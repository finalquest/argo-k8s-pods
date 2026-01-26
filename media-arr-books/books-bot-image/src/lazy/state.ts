type EnglishState = {
  state: 'ENGLISH_MODE';
  query?: string;
  currentPage?: number;
  totalResults?: number;
  resultsPerPage?: number;
  timestamp: number;
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

const lazyJobs = new Map<string, LazyJob>();

const makeJobId = (userId: string, bookId: string) => `${userId}:${bookId}`;

const addLazyJob = (job: Omit<LazyJob, 'jobId'>) => {
  const jobId = makeJobId(job.userId, job.bookId);
  const existing = lazyJobs.get(jobId);
  if (existing) return existing;
  const record: LazyJob = { ...job, jobId };
  lazyJobs.set(jobId, record);
  return record;
};

const getLazyJob = (jobId: string) => lazyJobs.get(jobId);

const removeLazyJob = (jobId: string) => {
  lazyJobs.delete(jobId);
};

const updateLazyJob = (jobId: string, update: Partial<LazyJob>) => {
  const current = lazyJobs.get(jobId);
  if (!current) return null;
  const next = { ...current, ...update };
  lazyJobs.set(jobId, next);
  return next;
};

const listLazyJobs = () => Array.from(lazyJobs.values());

const listLazyJobsByUser = (userId: string) => {
  return Array.from(lazyJobs.values()).filter(job => job.userId === userId);
};

const isEnglishMode = (state: Record<string, unknown>) => state.state === 'ENGLISH_MODE';

export {
  type EnglishState,
  type LazyJob,
  isEnglishMode,
  addLazyJob,
  getLazyJob,
  removeLazyJob,
  updateLazyJob,
  listLazyJobs,
  listLazyJobsByUser,
};
