import { normalizeAuthor } from '../utils/text.ts';

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type MeiliClient = {
  index: (indexName: string) => {
    search: (query: string, params: Record<string, unknown>) => Promise<{
      hits: BookHit[];
      totalHits?: number;
      estimatedTotalHits?: number;
      facetDistribution?: { authors?: Record<string, number> };
    }>;
  };
};

type BookHit = {
  libid: string | number;
  title: string;
  authors?: string[] | string;
  description?: string;
  published?: string | number;
  filename?: string;
};

type AuthorFacet = {
  name: string;
  displayName: string;
  bookCount: number;
};

type SearchResult = {
  hits: BookHit[];
  totalHits: number;
};

type SearchStrategyResult = SearchResult & {
  strategy: string;
  strategyDesc: string;
  queryUsed: string;
  filtersUsed: { author: string } | null;
  searchIn: string[];
  useExactPhrase: boolean;
};

type SearchFn = (
  query: string,
  limit: number,
  filters: { author: string } | null,
  offset: number,
  searchIn: string[],
  useExactPhrase: boolean
) => Promise<SearchResult>;

const getTotalResults = async (
  meiliClient: MeiliClient,
  indexName: string,
  query: string,
  logger: Logger
): Promise<number> => {
  try {
    const index = meiliClient.index(indexName);
    const search = await index.search(query, {
      limit: 0,
      attributesToRetrieve: [],
    });

    return search.totalHits || 0;
  } catch (err) {
    logger.error({ err, query }, '[TOTAL] Error getting total results');
    return 0;
  }
};

const getTotalBooksByAuthor = async (
  meiliClient: MeiliClient,
  indexName: string,
  authorName: string,
  logger: Logger
): Promise<number> => {
  try {
    const index = meiliClient.index(indexName);
    const search = await index.search('', {
      limit: 0,
      filter: `authors = "${authorName}"`,
      attributesToRetrieve: [],
    });

    return search.totalHits || search.estimatedTotalHits || 0;
  } catch (err) {
    logger.error({ err, authorName }, '[TOTAL] Error getting total books by author');
    return 0;
  }
};

const searchByAuthors = async (
  meiliClient: MeiliClient,
  indexName: string,
  query: string,
  limit = 5,
  logger: Logger
): Promise<BookHit[]> => {
  try {
    const index = meiliClient.index(indexName);
    const search = await index.search(query, {
      limit,
      attributesToSearchOn: ['authors'],
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    });

    logger.info({ query, results: search.hits.length }, '[SEARCHBYAUTHORS] Authors search completed');

    return search.hits;
  } catch (err) {
    logger.error({ err, query }, '[SEARCHBYAUTHORS] Error searching authors');
    throw err;
  }
};

const searchMeilisearch = async (
  meiliClient: MeiliClient,
  indexName: string,
  query: string,
  limit = 5,
  filters: { author: string } | null = null,
  offset = 0,
  searchIn = ['title'],
  useExactPhrase = false,
  logger: Logger
): Promise<SearchResult> => {
  try {
    const index = meiliClient.index(indexName);
    const searchParams: Record<string, unknown> = {
      limit,
      offset,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
      attributesToSearchOn: searchIn,
    };

    if (filters && filters.author) {
      searchParams.filter = `authors = "${filters.author}"`;
      logger.info({ query, filter: searchParams.filter, offset, searchIn, useExactPhrase }, '[MEILISEARCH] Author filter APPLIED');
    } else {
      logger.info({ query, limit, offset, filters, searchIn, useExactPhrase }, '[MEILISEARCH] NO filter applied');
    }

    const effectiveQuery = useExactPhrase ? `"${query}"` : query;
    const search = await index.search(effectiveQuery, searchParams);

    const totalHits = search.totalHits ?? search.estimatedTotalHits ?? 0;
    logger.info({ query, offset, totalHits: search.totalHits, estimatedTotalHits: search.estimatedTotalHits, searchIn, useExactPhrase }, '[MEILISEARCH] Total hits fields');

    logger.info({ query, results: search.hits.length, offset, totalHits, hasFilter: !!filters, filterValue: filters?.author, searchIn, useExactPhrase }, '[MEILISEARCH] Search completed');

    return { hits: search.hits, totalHits };
  } catch (err) {
    logger.error({ err, query, filters, offset, searchIn, useExactPhrase }, '[MEILISEARCH] Error searching');
    throw err;
  }
};

const searchWithStrategies = async (
  query: string,
  limit = 5,
  searchFn: SearchFn,
  logger: Logger
): Promise<SearchStrategyResult> => {
  const strategies = [
    {
      name: 'title',
      searchIn: ['title'],
      useExactPhrase: true,
      desc: 'Búsqueda en título (frase exacta)'
    },
    {
      name: 'combined',
      searchIn: ['title', 'authors'],
      useExactPhrase: false,
      desc: 'Búsqueda en título y autor (sin comillas)'
    }
  ];

  const words = query.trim().split(/\s+/);
  if (words.length >= 2) {
    const firstWord = words[0];
    const restWords = words.slice(1).join(' ');

    strategies.push({
      name: 'author_plus_title',
      searchIn: ['title'],
      useExactPhrase: false,
      filters: { author: firstWord },
      queryOverride: restWords,
      desc: `Autor: "${firstWord}" + Título: "${restWords}"`
    });
  }

  for (const strategy of strategies) {
    const searchQuery = strategy.queryOverride || query;
    const result = await searchFn(
      searchQuery,
      limit,
      strategy.filters || null,
      0,
      strategy.searchIn,
      strategy.useExactPhrase
    );

    logger.info({
      query,
      strategy: strategy.name,
      results: result.hits.length,
      totalHits: result.totalHits,
      searchIn: strategy.searchIn,
      useExactPhrase: strategy.useExactPhrase
    }, '[COMBINED] Strategy tried');

    if (result.hits.length > 0) {
      return {
        ...result,
        strategy: strategy.name,
        strategyDesc: strategy.desc,
        queryUsed: searchQuery,
        filtersUsed: strategy.filters || null,
        searchIn: strategy.searchIn,
        useExactPhrase: strategy.useExactPhrase
      };
    }
  }

  return {
    hits: [],
    totalHits: 0,
    strategy: 'none',
    strategyDesc: 'No se encontraron resultados',
    queryUsed: query,
    filtersUsed: null,
    searchIn: ['title'],
    useExactPhrase: true
  };
};

const searchAuthorFacets = async (
  meiliClient: MeiliClient,
  indexName: string,
  query: string
): Promise<Record<string, number>> => {
  const index = meiliClient.index(indexName);
  const search = await index.search(query, {
    limit: 0,
    facets: ['authors'],
    attributesToSearchOn: ['authors']
  });

  return search.facetDistribution?.authors || {};
};

const extractAuthorsFromFacets = (
  facetMap: Record<string, number>,
  query: string,
  limit = 10
): AuthorFacet[] => {
  const normalizedQuery = normalizeAuthor(query);

  return Object.entries(facetMap || {})
    .map(([name, count]) => ({
      name,
      displayName: name,
      bookCount: count
    }))
    .filter((author) => normalizeAuthor(author.name).includes(normalizedQuery))
    .sort((a, b) => b.bookCount - a.bookCount)
    .slice(0, limit);
};

const escapeFilterValue = (value: string) => {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

export {
  getTotalResults,
  getTotalBooksByAuthor,
  searchByAuthors,
  searchMeilisearch,
  searchWithStrategies,
  searchAuthorFacets,
  extractAuthorsFromFacets,
  escapeFilterValue,
};
