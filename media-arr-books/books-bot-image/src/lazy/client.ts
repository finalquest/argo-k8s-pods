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
  if (value && typeof value === 'object' && Array.isArray((value as LazyFindBookResponse).results)) {
    return (value as LazyFindBookResponse).results as LazyBookCandidate[];
  }
  return [];
};

const createLazyClient = ({ baseUrl, apiKey, logger }: LazyClientDeps) => {
  if (!baseUrl) throw new Error('LAZY_BASE_URL missing');
  if (!apiKey) throw new Error('LAZY_API_KEY missing');

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

  return {
    findBook,
  };
};

export {
  createLazyClient,
  type LazyBookCandidate,
};
