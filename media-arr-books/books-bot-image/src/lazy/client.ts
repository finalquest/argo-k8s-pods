type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type LazyClientDeps = {
  baseUrl: string;
  apiKey: string;
  logger: Logger;
};

type LazyBookCandidate = {
  bookid?: string;
  bookname?: string;
  authorname?: string;
  year?: string | number;
};

type LazyCommandResponse = {
  Success?: boolean;
  Data?: unknown;
  Error?: { Code?: number; Message?: string };
};

type LazyBookRecord = {
  BookID?: string;
  BookName?: string;
  AuthorName?: string;
  Status?: string;
  BookLibrary?: string | null;
};

type LazyFindBookResponse = {
  results?: LazyBookCandidate[];
} | LazyBookCandidate[];

const buildUrl = (baseUrl: string, apiKey: string, cmd: string, params: Record<string, string>) => {
  const url = new URL(baseUrl);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('cmd', cmd);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
};

const safeArray = (value: unknown): LazyBookCandidate[] => {
  if (Array.isArray(value)) return value as LazyBookCandidate[];
  if (value && typeof value === 'object' && 'results' in (value as Record<string, unknown>)) {
    const results = (value as { results?: unknown }).results;
    if (Array.isArray(results)) {
      return results as LazyBookCandidate[];
    }
  }
  return [];
};

const createLazyClient = ({ baseUrl, apiKey, logger }: LazyClientDeps) => {
  if (!baseUrl) throw new Error('LAZY_BASE_URL missing');
  if (!apiKey) throw new Error('LAZY_API_KEY missing');

  const requestJson = async (cmd: string, params: Record<string, string> = {}) => {
    const url = buildUrl(baseUrl, apiKey, cmd, params);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        return JSON.parse(text) as LazyCommandResponse;
      } catch {
        return { Success: text.trim().toLowerCase() === 'ok', Data: text };
      }
    } catch (err) {
      logger.error({ err, cmd }, '[LAZY] command failed');
      throw err;
    }
  };

  const findBook = async (query: string) => {
    const url = buildUrl(baseUrl, apiKey, 'findBook', { name: query });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as LazyFindBookResponse;
      return safeArray(data);
    } catch (err) {
      logger.error({ err, query }, '[LAZY] findBook failed');
      throw err;
    }
  };

  const findAuthor = async (query: string) => {
    const url = buildUrl(baseUrl, apiKey, 'findAuthor', { name: query });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as LazyFindBookResponse;
      return safeArray(data);
    } catch (err) {
      logger.error({ err, query }, '[LAZY] findAuthor failed');
      throw err;
    }
  };

  const addBook = async (bookId: string) => {
    return requestJson('addBook', { id: bookId });
  };

  const queueBook = async (bookId: string) => {
    return requestJson('queueBook', { id: bookId });
  };

  const searchBook = async (bookId: string, wait = '0') => {
    return requestJson('searchBook', { id: bookId, wait });
  };

  const forceProcess = async () => {
    return requestJson('forceProcess');
  };

  const getAllBooks = async (params: { status?: string; limit?: string } = {}) => {
    return requestJson('getAllBooks', params) as Promise<LazyBookRecord[]>;
  };

  const getFileDirectUrl = (bookId: string, type = 'eBook') => {
    return buildUrl(baseUrl, apiKey, 'getFileDirect', { id: bookId, type });
  };

  const headFileDirect = async (bookId: string, type = 'eBook') => {
    const url = getFileDirectUrl(bookId, type);
    return fetch(url, { method: 'HEAD' });
  };

  const downloadFileDirect = async (bookId: string, type = 'eBook') => {
    const url = getFileDirectUrl(bookId, type);
    return fetch(url);
  };

  return {
    findBook,
    findAuthor,
    addBook,
    queueBook,
    searchBook,
    forceProcess,
    getAllBooks,
    getFileDirectUrl,
    headFileDirect,
    downloadFileDirect,
  };
};

export {
  createLazyClient,
  type LazyBookCandidate,
  type LazyBookRecord,
  type LazyCommandResponse,
};
