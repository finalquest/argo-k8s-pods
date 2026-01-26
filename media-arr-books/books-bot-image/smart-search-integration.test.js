import { MeiliSearch } from 'meilisearch';

const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || 'tN4XUhyjvGfyvc1/QH1yLd8fTlWI8U/7wVCFKqleXHI=';
const MEILI_INDEX = process.env.MEILI_INDEX || 'biblioteca';

const normalizeAuthor = (author) => {
  return String(author || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

const extractAuthorsFromFacets = (facetMap, query, limit = 10) => {
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

describe('Smart Search Integration Tests (Real Meilisearch)', () => {
  let client;
  let index;

  beforeAll(() => {
    client = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY,
    });
    index = client.index(MEILI_INDEX);
    console.log(`\n=== Testing against: ${MEILI_HOST} ===`);
  });

  test('title exact search returns hits for "fundacion"', async () => {
    const search = await index.search('"fundacion"', {
      limit: 1,
      attributesToSearchOn: ['title'],
    });

    expect(search.hits.length).toBeGreaterThan(0);
  });

  test('author facet match for "asimov" includes Isaac Asimov', async () => {
    const search = await index.search('asimov', {
      limit: 0,
      facets: ['authors'],
      attributesToSearchOn: ['authors'],
    });

    const authors = extractAuthorsFromFacets(search.facetDistribution?.authors, 'asimov', 10);
    const hasAsimov = authors.some((author) => normalizeAuthor(author.name).includes('asimov'));

    expect(hasAsimov).toBe(true);
  });

  test('preview search for Isaac Asimov returns <=5 hits and large total', async () => {
    const preview = await index.search('', {
      limit: 5,
      filter: 'authors = "Isaac Asimov"',
      attributesToRetrieve: ['title'],
    });

    const totalHits = preview.totalHits ?? preview.estimatedTotalHits ?? 0;

    expect(preview.hits.length).toBeLessThanOrEqual(5);
    expect(totalHits).toBeGreaterThan(5);
  });

  test('author browse pagination keeps empty query and returns results', async () => {
    const page1 = await index.search('', {
      limit: 5,
      offset: 0,
      filter: 'authors = "Isaac Asimov"',
      attributesToRetrieve: ['title', 'authors'],
    });

    const page2 = await index.search('', {
      limit: 5,
      offset: 5,
      filter: 'authors = "Isaac Asimov"',
      attributesToRetrieve: ['title', 'authors'],
    });

    expect(page1.hits.length).toBeGreaterThan(0);
    expect(page2.hits.length).toBeGreaterThan(0);

    expect(page1.hits.every((hit) => (hit.authors || []).includes('Isaac Asimov'))).toBe(true);
    expect(page2.hits.every((hit) => (hit.authors || []).includes('Isaac Asimov'))).toBe(true);
  });
});
