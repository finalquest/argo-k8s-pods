import * as fs from 'fs';
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
  deliveryMethod?: 'telegram' | 'email';
  userEmail?: string;
};

type Book = {
  title?: string;
  authors?: string[] | string;
  published?: string | number;
  pagecount?: string | number;
  size?: number;
  labels?: string[] | string;
  filename?: string;
  libid?: string | number;
  description?: string;
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
  sendEmail?: (toEmail: string, book: Book, epubBuffer: Buffer, filename: string) => Promise<boolean>;
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
    sendEmail,
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
      const { tempPath, filename } = await downloadResponseToTemp(response, fallback);

      if (job.deliveryMethod === 'email' && job.userEmail && sendEmail) {
        const epubBuffer = fs.readFileSync(tempPath);
        
        const book: Book = {
          title: job.title || filename,
          authors: job.author ? [job.author] : undefined,
        };

        await sendEmail(job.userEmail, book, epubBuffer, filename);

        removeLazyJob(job.jobId);
        bot.sendMessage(job.chatId, `✅ Libro enviado por email a:\n\n📧 ${job.userEmail}\n\n📚 ${job.title || 'Libro'}`);
        logger.info({ jobId: job.jobId, bookId: job.bookId, email: job.userEmail }, '[LAZY] Job delivered via email');
      } else {
        const captionParts = [];
        if (job.title) captionParts.push(`📥 ${job.title}`);
        if (job.author) captionParts.push(`✍️ ${job.author}`);

        await bot.sendDocument(job.chatId, tempPath, {
          caption: captionParts.join('\n') || '📥 Libro listo',
        });

        removeLazyJob(job.jobId);
        bot.sendMessage(job.chatId, '✅ Descarga completa. Si quieres otro libro, envía un nuevo título.');
        logger.info({ jobId: job.jobId, bookId: job.bookId }, '[LAZY] Job delivered');
      }

      try {
        fs.unlinkSync(tempPath);
      } catch (unlinkErr) {
        logger.warn({ err: unlinkErr, tempPath }, '[LAZY] Failed to cleanup temp file');
      }
    } catch (err) {
      logger.error({ err, jobId: job.jobId, bookId: job.bookId }, '[LAZY] Poller error');
    }
  }

  running = false;
};

export { processLazyJobs };
