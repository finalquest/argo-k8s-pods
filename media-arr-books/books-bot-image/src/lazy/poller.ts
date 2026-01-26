import { downloadResponseToTemp } from './download.ts';

type Bot = {
  sendMessage: (chatId: string | number, text: string) => Promise<unknown>;
  sendDocument: (chatId: string | number, filePath: string, options?: Record<string, unknown>) => Promise<unknown>;
};

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type LazyJob = {
  jobId: string;
  chatId: string | number;
  userId: string;
  bookId: string;
  title?: string;
  author?: string;
  startedAt: number;
  lastStatus?: string;
};

type PollerDeps = {
  bot: Bot;
  logger: Logger;
  listLazyJobs: () => LazyJob[];
  updateLazyJob: (jobId: string, update: Partial<LazyJob>) => LazyJob | null;
  removeLazyJob: (jobId: string) => void;
  headFileDirect: (bookId: string, type?: string) => Promise<Response>;
  downloadFileDirect: (bookId: string, type?: string) => Promise<Response>;
  fallbackFilename: (title?: string, author?: string) => string;
};

let running = false;

const JOB_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const processLazyJobs = async (deps: PollerDeps) => {
  if (running) return;
  running = true;

  const {
    bot,
    logger,
    listLazyJobs,
    updateLazyJob,
    removeLazyJob,
    headFileDirect,
    downloadFileDirect,
    fallbackFilename,
  } = deps;

  const jobs = listLazyJobs();

  for (const job of jobs) {
    const age = Date.now() - job.startedAt;
    if (age > JOB_TIMEOUT_MS) {
      removeLazyJob(job.jobId);
      bot.sendMessage(job.chatId, '⏰ La descarga tardó demasiado y fue cancelada. Intenta de nuevo más tarde.');
      logger.warn({ jobId: job.jobId, bookId: job.bookId }, '[LAZY] Job timeout');
      continue;
    }

    try {
      const headResponse = await headFileDirect(job.bookId);
      if (!headResponse.ok) {
        updateLazyJob(job.jobId, { lastStatus: 'pendiente' });
        continue;
      }

      const response = await downloadFileDirect(job.bookId);
      const fallback = fallbackFilename(job.title, job.author);
      const { tempPath } = await downloadResponseToTemp(response, fallback);

      const captionParts = [];
      if (job.title) captionParts.push(`📥 ${job.title}`);
      if (job.author) captionParts.push(`✍️ ${job.author}`);

      await bot.sendDocument(job.chatId, tempPath, {
        caption: captionParts.join('\n') || '📥 Libro listo',
      });

      removeLazyJob(job.jobId);
      bot.sendMessage(job.chatId, '✅ Descarga completa. Si quieres otro libro, envía un nuevo título.');
      logger.info({ jobId: job.jobId, bookId: job.bookId }, '[LAZY] Job delivered');
    } catch (err) {
      logger.error({ err, jobId: job.jobId, bookId: job.bookId }, '[LAZY] Poller error');
    }
  }

  running = false;
};

export { processLazyJobs };
