import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  createMoonshotRuntime,
  runMoonshotPrompt,
  generateRepoGuidanceSystemText
} from './moonshot.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_USER_IDS = '',
  TOKYO_REPO_URL = 'https://github.com/finalquest/tokyo2026',
  TOKYO_REPO_DIR = '/data/repos',
  TOKYO_REPO_NAME = 'tokyo2026',
  TOKYO_REPO_DEPTH = '1',
  GIT_AUTH_TOKEN = '',
  GIT_AUTH_USERNAME = '',
  GIT_USER_NAME = 'Codex Telegram Bot',
  GIT_USER_EMAIL = 'bot@example.com',
  TOKYO_REPO_BRANCH = '',
  CODEX_HISTORY_LIMIT = '6',
  CODEX_SESSION_PROMPT = `Contexto: sos Codex ejecutándote en el bot tokyo-bot. Te escriben usuarios autorizados por Telegram para trabajar en el repo tokyo2026. Debés responder en español, con tono conciso, describiendo los comandos que sugerís ejecutar y resaltando pasos o riesgos importantes. Asumí que tus mensajes se enviarán directamente por Telegram y evitá incluir secuencias ANSI.`,
  REPO_GUIDANCE_RETRY_BASE_MS = '5000',
  REPO_GUIDANCE_RETRY_MAX_MS = '300000'
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  logger.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

let moonshotRuntime;
try {
  moonshotRuntime = createMoonshotRuntime(process.env);
} catch (err) {
  logger.error({ err }, 'Moonshot configuration error');
  process.exit(1);
}

const allowedUsers = new Set(
  ALLOWED_USER_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const repoPath = join(TOKYO_REPO_DIR, TOKYO_REPO_NAME);
const parsedHistoryLimit = Number(CODEX_HISTORY_LIMIT);
const historyLimit = Number.isNaN(parsedHistoryLimit) || parsedHistoryLimit < 0 ? 6 : Math.floor(parsedHistoryLimit);
const baseSystemPrompt = CODEX_SESSION_PROMPT?.trim() || '';
const knownAuthorizedChatIds = new Set();

const repoGuidanceState = {
  valid: false,
  guidanceSystemText: '',
  versionHash: '',
  generatedAt: 0,
  lastError: null,
  retryTimer: null,
  retryAttempt: 0,
  failureNotified: false,
  recoveryNotified: false,
  pendingAlertMessage: ''
};

let guidanceRefreshPromise = null;
let botInstance = null;

const runCommand = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    logger.debug({ cmd, args }, 'exec');
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });

const runCommandOutput = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    logger.debug({ cmd, args }, 'exec-output');
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`));
      }
    });
  });

const getDefaultBranch = async () => {
  try {
    const ref = await runCommandOutput('git', [
      '-C',
      repoPath,
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD'
    ]);
    const parts = ref.split('/');
    return parts[parts.length - 1] || 'master';
  } catch (err) {
    logger.warn({ err }, 'No pude leer origin/HEAD, uso master');
    return 'master';
  }
};

const checkoutDefaultBranch = async () => {
  const targetBranch = await getDefaultBranch();
  try {
    await runCommand('git', ['-C', repoPath, 'checkout', '-B', targetBranch, `origin/${targetBranch}`]);
  } catch (err) {
    logger.warn({ targetBranch, err }, 'No pude hacer checkout desde origin, creo branch local');
    await runCommand('git', ['-C', repoPath, 'checkout', '-B', targetBranch]);
  }
  await runCommand('git', ['-C', repoPath, 'pull', '--ff-only', 'origin', targetBranch]);
};

const buildAuthUrl = (url) => {
  if (!GIT_AUTH_TOKEN || !url.startsWith('http')) {
    return url;
  }
  try {
    const authUrl = new URL(url);
    const user = GIT_AUTH_USERNAME || 'x-access-token';
    authUrl.username = user;
    authUrl.password = GIT_AUTH_TOKEN;
    return authUrl.toString();
  } catch (err) {
    logger.warn({ url }, 'Failed to inject auth token into repo URL');
    return url;
  }
};

async function ensureRepo() {
  mkdirSync(TOKYO_REPO_DIR, { recursive: true });
  const authUrl = buildAuthUrl(TOKYO_REPO_URL);
  if (!existsSync(repoPath)) {
    logger.info({ repoPath }, 'Cloning tokyo2026 repo');
    const cloneArgs = ['clone'];
    const depth = Number(TOKYO_REPO_DEPTH);
    if (!Number.isNaN(depth) && depth > 0) {
      cloneArgs.push(`--depth=${depth}`);
    }
    cloneArgs.push(authUrl, repoPath);
    await runCommand('git', cloneArgs);
  } else {
    logger.info('Repo already exists, pulling latest changes');
    const depth = Number(TOKYO_REPO_DEPTH);
    const fetchArgs = ['-C', repoPath, 'fetch', '--all', '--prune'];
    if (!Number.isNaN(depth) && depth > 0) {
      fetchArgs.push(`--depth=${depth}`);
    }
    await runCommand('git', fetchArgs);
    await checkoutDefaultBranch();
  }
  await runCommand('git', ['-C', repoPath, 'remote', 'set-url', 'origin', authUrl]);
  await runCommand('git', ['-C', repoPath, 'config', 'user.name', GIT_USER_NAME]);
  await runCommand('git', ['-C', repoPath, 'config', 'user.email', GIT_USER_EMAIL]);
}

const readRepoGuidanceFiles = async () => {
  const agentsPath = join(repoPath, 'AGENTS.md');
  const readmePath = join(repoPath, 'README.md');
  let agentsText = '';
  let readmeText = '';

  try {
    agentsText = await readFile(agentsPath, 'utf8');
  } catch (err) {
    logger.warn({ err, agentsPath }, 'AGENTS.md no disponible en repo clonado');
  }
  try {
    readmeText = await readFile(readmePath, 'utf8');
  } catch (err) {
    logger.warn({ err, readmePath }, 'README.md no disponible en repo clonado');
  }

  return {
    agentsText: agentsText || '(AGENTS.md no disponible)',
    readmeText: readmeText || '(README.md no disponible)'
  };
};

const buildGuidanceHash = ({ agentsText, readmeText }) =>
  createHash('sha256')
    .update(`AGENTS\n${agentsText}\n\nREADME\n${readmeText}`)
    .digest('hex');

const notifyKnownChats = async (message) => {
  if (!botInstance || knownAuthorizedChatIds.size === 0) {
    return false;
  }
  await Promise.all(
    Array.from(knownAuthorizedChatIds).map((chatId) =>
      botInstance.sendMessage(chatId, message).catch((err) => {
        logger.warn({ err, chatId }, 'No pude enviar alerta de guidance');
      })
    )
  );
  return true;
};

const nextRetryDelayMs = (attempt) => {
  const base = Number(REPO_GUIDANCE_RETRY_BASE_MS) || 5000;
  const max = Number(REPO_GUIDANCE_RETRY_MAX_MS) || 300000;
  const exponential = base * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, max);
};

const scheduleGuidanceRetry = () => {
  if (repoGuidanceState.retryTimer) {
    return;
  }
  repoGuidanceState.retryAttempt += 1;
  const delay = nextRetryDelayMs(repoGuidanceState.retryAttempt);
  repoGuidanceState.retryTimer = setTimeout(async () => {
    repoGuidanceState.retryTimer = null;
    try {
      await ensureRepo();
      await refreshRepoGuidanceCache('retry');
    } catch (err) {
      logger.error({ err }, 'Falló retry de cache de guidance');
      scheduleGuidanceRetry();
    }
  }, delay);
};

const buildSystemPrompt = () => {
  const sections = [baseSystemPrompt];
  if (repoGuidanceState.guidanceSystemText) {
    sections.push(`Contexto compilado del repo:\n${repoGuidanceState.guidanceSystemText}`);
  }
  return sections.filter(Boolean).join('\n\n');
};

async function refreshRepoGuidanceCache(reason = 'manual') {
  if (guidanceRefreshPromise) {
    return guidanceRefreshPromise;
  }
  guidanceRefreshPromise = (async () => {
    const { agentsText, readmeText } = await readRepoGuidanceFiles();
    const versionHash = buildGuidanceHash({ agentsText, readmeText });
    if (repoGuidanceState.valid && repoGuidanceState.versionHash === versionHash) {
      logger.debug({ reason, versionHash }, 'Guidance cache sin cambios, se reutiliza');
      return;
    }
    const guidanceText = await generateRepoGuidanceSystemText({
      runtime: moonshotRuntime,
      agentsText,
      readmeText,
      logger
    });
    repoGuidanceState.valid = true;
    repoGuidanceState.guidanceSystemText = guidanceText;
    repoGuidanceState.versionHash = versionHash;
    repoGuidanceState.generatedAt = Date.now();
    repoGuidanceState.lastError = null;
    repoGuidanceState.retryAttempt = 0;
    if (repoGuidanceState.retryTimer) {
      clearTimeout(repoGuidanceState.retryTimer);
      repoGuidanceState.retryTimer = null;
    }
    if (repoGuidanceState.failureNotified && !repoGuidanceState.recoveryNotified) {
      await notifyKnownChats(
        '✅ Contexto del repo regenerado correctamente. El bot vuelve a estar operativo.'
      );
      repoGuidanceState.recoveryNotified = true;
      repoGuidanceState.failureNotified = false;
    }
  })();

  try {
    await guidanceRefreshPromise;
  } catch (err) {
    repoGuidanceState.valid = false;
    repoGuidanceState.lastError = err?.message || 'Error desconocido';
    repoGuidanceState.recoveryNotified = false;
    if (!repoGuidanceState.failureNotified) {
      const failureMessage = `⚠️ Error al generar el contexto del repo (AGENTS.md/README.md): ${repoGuidanceState.lastError}. El bot queda bloqueado hasta regenerarlo.`;
      const sent = await notifyKnownChats(failureMessage);
      if (!sent) {
        repoGuidanceState.pendingAlertMessage = failureMessage;
      }
      repoGuidanceState.failureNotified = true;
    }
    scheduleGuidanceRetry();
    throw err;
  } finally {
    guidanceRefreshPromise = null;
  }
}

const runLlmPrompt = async (prompt, chatId) => {
  if (!repoGuidanceState.valid) {
    throw new Error(
      'No puedo procesar tareas hasta regenerar el contexto del repo (AGENTS/README).'
    );
  }
  return runMoonshotPrompt({
    runtime: moonshotRuntime,
    prompt,
    chatId,
    logger,
    repoPath,
    systemPrompt: buildSystemPrompt()
  });
};

class CodexExecManager {
  constructor(limit) {
    this.limit = Number.isInteger(limit) && limit > 0 ? limit : 0;
    this.history = new Map();
    this.active = new Set();
  }

  isBusy(chatId) {
    return this.active.has(chatId);
  }

  hasHistory(chatId) {
    return (this.history.get(chatId)?.length || 0) > 0;
  }

  reset(chatId) {
    this.history.delete(chatId);
  }

  async send(chatId, message) {
    if (this.isBusy(chatId)) {
      throw new Error('Codex está procesando otro mensaje');
    }
    this.active.add(chatId);
    try {
      const prompt = this.buildPrompt(chatId, message);
      const response = await runLlmPrompt(prompt, chatId);
      this.recordHistory(chatId, message, response);
      return response.trim() ? response.trim() : '(sin salida)';
    } finally {
      this.active.delete(chatId);
    }
  }

  buildPrompt(chatId, message) {
    const segments = [];
    const history = this.history.get(chatId) || [];
    if (history.length) {
      const formattedHistory = history
        .map((entry) => `${entry.role === 'assistant' ? 'Codex' : 'Usuario'}:\n${entry.content}`)
        .join('\n\n');
      segments.push(`Historial reciente de la conversación:\n${formattedHistory}`);
    }
    segments.push(`Nuevo mensaje desde Telegram:\n${message}`);
    return segments.join('\n\n').trim();
  }

  recordHistory(chatId, userMessage, assistantMessage) {
    if (this.limit === 0) {
      return;
    }
    const history = this.history.get(chatId) || [];
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantMessage || '(sin salida)' });
    if (history.length > this.limit) {
      history.splice(0, history.length - this.limit);
    }
    this.history.set(chatId, history);
  }
}

const codexManager = new CodexExecManager(historyLimit);

function chunkMessage(message) {
  const chunks = [];
  let remaining = message;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  return chunks;
}

function startTypingIndicator(bot, chatId) {
  let active = true;
  let timer = null;
  const sendAction = () => {
    if (!active) {
      return;
    }
    bot.sendChatAction(chatId, 'typing').catch((err) => {
      logger.debug({ chatId, err }, 'Failed to send typing indicator');
    });
    timer = setTimeout(sendAction, 4000);
  };
  sendAction();
  return () => {
    active = false;
    if (timer) {
      clearTimeout(timer);
    }
  };
}

function setupPollingRecovery(bot) {
  let restarting = false;
  let restartTimer = null;

  const restartPolling = async () => {
    if (restarting) {
      return;
    }
    restarting = true;
    logger.warn('Reiniciando polling de Telegram tras error fatal...');
    try {
      try {
        await bot.stopPolling();
      } catch (stopErr) {
        logger.warn({ stopErr }, 'Falló stopPolling (continuo con restart)');
      }
      await bot.startPolling();
      logger.info('Polling de Telegram reiniciado.');
    } catch (err) {
      logger.error({ err }, 'No pude reiniciar el polling, reintento en 5s');
      restartTimer = setTimeout(() => {
        restartTimer = null;
        restarting = false;
        restartPolling();
      }, 5000);
      return;
    }
    restarting = false;
  };

  bot.on('polling_error', (err) => {
    if (!err) {
      return;
    }
    const fatal = err.code === 'EFATAL' || /EFATAL/i.test(err.message || '');
    const level = fatal ? 'error' : 'warn';
    logger[level]({ err }, 'Polling error de Telegram');
    if (fatal) {
      if (restartTimer) {
        return;
      }
      restartTimer = setTimeout(() => {
        restartTimer = null;
        restartPolling();
      }, 2000);
    }
  });

  bot.on('webhook_error', (err) => {
    logger.warn({ err }, 'Webhook error de Telegram');
  });
}

async function startBot() {
  await ensureRepo();
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  botInstance = bot;
  try {
    await refreshRepoGuidanceCache('startup');
  } catch (err) {
    logger.error({ err }, 'No pude generar cache de guidance al iniciar; bot queda bloqueado');
  }
  logger.info('Bot connected to Telegram');
  setupPollingRecovery(bot);

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ? String(msg.from.id) : '';
    if (allowedUsers.size && !allowedUsers.has(userId)) {
      logger.warn({ userId }, 'Unauthorized user');
      return;
    }
    knownAuthorizedChatIds.add(chatId);
    if (repoGuidanceState.pendingAlertMessage) {
      bot
        .sendMessage(chatId, repoGuidanceState.pendingAlertMessage)
        .catch((err) => logger.warn({ err, chatId }, 'No pude enviar alerta pendiente'))
        .finally(() => {
          repoGuidanceState.pendingAlertMessage = '';
        });
    }

    const text = msg.text?.trim();
    if (!text) {
      bot.sendMessage(chatId, 'Solo puedo procesar mensajes de texto.');
      return;
    }

    if (text === '/close') {
      codexManager.reset(chatId);
      bot.sendMessage(chatId, 'Historial de Codex borrado.');
      return;
    }

    if (text === '/status') {
      if (!repoGuidanceState.valid) {
        bot.sendMessage(
          chatId,
          `Bot bloqueado: fallo cache de contexto del repo. Error: ${repoGuidanceState.lastError || 'desconocido'}`
        );
        return;
      }
      if (codexManager.isBusy(chatId)) {
        bot.sendMessage(chatId, 'Codex está procesando un mensaje.');
        return;
      }
      bot.sendMessage(
        chatId,
        codexManager.hasHistory(chatId)
          ? 'Codex libre, con historial vigente.'
          : 'Codex libre. No hay historial guardado.'
      );
      return;
    }

    if (text === '/reset') {
      codexManager.reset(chatId);
      bot.sendMessage(chatId, 'Historial reiniciado.');
      return;
    }

    if (text === '/start') {
      bot.sendMessage(
        chatId,
        'Listo para trabajar con Codex. Mandame instrucciones y usaré el repo tokyo2026.'
      );
      return;
    }

    if (!repoGuidanceState.valid) {
      bot.sendMessage(
        chatId,
        'No puedo procesar tareas hasta regenerar el contexto del repo (AGENTS/README).'
      );
      return;
    }

    if (codexManager.isBusy(chatId)) {
      bot.sendMessage(chatId, 'Codex sigue procesando el mensaje anterior, esperá un momento.');
      return;
    }
    const stopTyping = startTypingIndicator(bot, chatId);
    try {
      logger.info({ chatId, text }, 'Forwarding message to Codex');
      const response = await codexManager.send(chatId, text);
      logger.info({ chatId }, 'Codex response ready');
      const chunks = chunkMessage(response);
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
    } catch (err) {
      logger.error({ chatId, err }, 'Error interacting with Codex');
      codexManager.reset(chatId);
      bot.sendMessage(chatId, `Error: ${err.message}`);
    } finally {
      stopTyping();
    }
  });
}

startBot().catch((err) => {
  logger.error({ err }, 'Bot failed to start');
  process.exit(1);
});
