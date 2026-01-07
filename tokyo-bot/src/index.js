import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_USER_IDS = '',
  TOKYO_REPO_URL = 'https://github.com/finalquest/tokyo2026',
  TOKYO_REPO_DIR = '/data/repos',
  TOKYO_REPO_NAME = 'tokyo2026',
  GIT_AUTH_TOKEN = '',
  GIT_AUTH_USERNAME = '',
  GIT_USER_NAME = 'Codex Telegram Bot',
  GIT_USER_EMAIL = 'bot@example.com',
  CODEX_CMD = 'codex',
  CODEX_ARGS = '',
  CODEX_API_KEY,
  RESPONSE_IDLE_MS = '1500'
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  logger.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const allowedUsers = new Set(
  ALLOWED_USER_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const repoPath = join(TOKYO_REPO_DIR, TOKYO_REPO_NAME);

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
    await runCommand('git', ['clone', authUrl, repoPath]);
  } else {
    logger.info('Repo already exists, pulling latest changes');
    await runCommand('git', ['-C', repoPath, 'fetch', '--all']);
    await runCommand('git', ['-C', repoPath, 'pull', '--ff-only']);
  }
  await runCommand('git', ['-C', repoPath, 'remote', 'set-url', 'origin', authUrl]);
  await runCommand('git', ['-C', repoPath, 'config', 'user.name', GIT_USER_NAME]);
  await runCommand('git', ['-C', repoPath, 'config', 'user.email', GIT_USER_EMAIL]);
}

class CodexSession {
  constructor(chatId, onExit) {
    this.chatId = chatId;
    this.buffer = '';
    this.pending = null;
    this.timer = null;
    const args = CODEX_ARGS ? CODEX_ARGS.split(' ').filter(Boolean) : ['chat'];
    logger.info({ chatId, args }, 'Starting Codex session');
    this.proc = spawn(CODEX_CMD, args, {
      cwd: repoPath,
      env: {
        ...process.env,
        CODEX_API_KEY
      }
    });
    this.proc.stdout.on('data', (chunk) => this.handleData(chunk));
    this.proc.stderr.on('data', (chunk) => this.handleData(chunk, true));
    this.proc.on('exit', (code, signal) => {
      logger.info({ chatId, code, signal }, 'Codex session ended');
      if (this.pending) {
        this.pending.reject(new Error('Codex session ended'));
        this.pending = null;
      }
      onExit?.();
    });
  }

  handleData(chunk, isError = false) {
    if (!this.pending) {
      if (isError) {
        logger.warn({ chatId: this.chatId, chunk: chunk.toString() }, 'Codex stderr (no pending)');
      }
      return;
    }
    this.buffer += chunk.toString();
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), Number(RESPONSE_IDLE_MS));
  }

  flush() {
    if (!this.pending) {
      return;
    }
    const text = this.buffer.trim() || '(sin salida)';
    this.pending.resolve(text);
    this.pending = null;
    this.buffer = '';
  }

  async send(message) {
    if (this.pending) {
      throw new Error('Codex está procesando otro mensaje');
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        this.proc.stdin.write(`${message}\n`);
      } catch (err) {
        this.pending = null;
        reject(err);
        return;
      }
      this.scheduleFlush();
    });
  }

  close() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.proc.kill('SIGTERM');
  }
}

const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    const session = new CodexSession(chatId, () => sessions.delete(chatId));
    sessions.set(chatId, session);
  }
  return sessions.get(chatId);
}

function closeSession(chatId) {
  const session = sessions.get(chatId);
  if (session) {
    session.close();
    sessions.delete(chatId);
  }
}

function chunkMessage(message) {
  const chunks = [];
  let remaining = message;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  return chunks;
}

async function startBot() {
  await ensureRepo();
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  logger.info('Bot connected to Telegram');

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
      closeSession(chatId);
      bot.sendMessage(chatId, 'Sesión Codex cerrada.');
      return;
    }

    if (text === '/status') {
      bot.sendMessage(chatId, sessions.has(chatId) ? 'Sesión activa.' : 'No hay sesión abierta.');
      return;
    }

    if (text === '/reset') {
      closeSession(chatId);
      bot.sendMessage(chatId, 'Sesión reiniciada.');
      return;
    }

    if (text === '/start') {
      bot.sendMessage(
        chatId,
        'Listo para trabajar con Codex. Mandame instrucciones y usaré el repo tokyo2026.'
      );
      return;
    }

    if (!sessions.has(chatId)) {
      await bot.sendMessage(chatId, 'Creando sesión nueva con Codex...');
    }

    const session = getSession(chatId);
    try {
      const response = await session.send(text);
      const chunks = chunkMessage(response);
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
      }
    } catch (err) {
      logger.error({ err }, 'Error interacting with Codex');
      closeSession(chatId);
      bot.sendMessage(chatId, `Error: ${err.message}`);
    }
  });
}

startBot().catch((err) => {
  logger.error({ err }, 'Bot failed to start');
  process.exit(1);
});
