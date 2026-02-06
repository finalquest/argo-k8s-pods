import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createMoonshotRuntime, runMoonshotPrompt } from './moonshot.js';

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
  CODEX_SESSION_PROMPT = `Contexto: sos Codex ejecutándote en el bot tokyo-bot. Te escriben usuarios autorizados por Telegram para trabajar en el repo tokyo2026. Debés responder en español, con tono conciso, describiendo los comandos que sugerís ejecutar y resaltando pasos o riesgos importantes. Asumí que tus mensajes se enviarán directamente por Telegram y evitá incluir secuencias ANSI.`
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

const runLlmPrompt = async (prompt, chatId) => {
  return runMoonshotPrompt({ runtime: moonshotRuntime, prompt, chatId, logger, repoPath });
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
    if (CODEX_SESSION_PROMPT) {
      segments.push(CODEX_SESSION_PROMPT.trim());
    }
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
  logger.info('Bot connected to Telegram');
  setupPollingRecovery(bot);

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ? String(msg.from.id) : '';
    if (allowedUsers.size && !allowedUsers.has(userId)) {
      logger.warn({ userId }, 'Unauthorized user');
      return;
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
