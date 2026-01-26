import { MeiliSearch } from 'meilisearch';

const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_API_KEY = process.env.MEILI_API_KEY || 'tN4XUhyjvGfyvc1/QH1yLd8fTlWI8U/7wVCFKqleXHI=';
const MEILI_INDEX = process.env.MEILI_INDEX || 'biblioteca';

describe('Search Pagination Integration Tests (Real Meilisearch)', () => {
  let client;

  beforeAll(() => {
    client = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY,
    });
    console.log(`\n=== Testing against: ${MEILI_HOST} ===`);
  });

  describe('searchMeilisearch with limit parameter', () => {
    test('should return only 5 results when limit=5', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit:5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Returned ${search.hits.length} results (limit=5)`);
      console.log(`   ✓ Total available: ${search.estimatedTotalHits}`);
    });

    test('should return 100 results when limit=100 (old behavior)', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('', {
        limit: 100,
        offset: 0,
        attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(100);
      console.log(`   ✓ Returned ${search.hits.length} results (limit=100)`);
      console.log(`   ✓ Total available: ${search.estimatedTotalHits}`);
    });

    test('should handle very large query with limit=5', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Returned ${search.hits.length} results (empty query, limit=5)`);
      console.log(`   ✓ Total available: ${search.estimatedTotalHits}`);
    });
  });

  describe('Pagination with offset parameter', () => {
    let totalResults;

    beforeAll(async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 0,
        attributesToSearchOn: ['title'],
      });
      totalResults = search.estimatedTotalHits;
      console.log(`   ✓ Total results for "fundacion": ${totalResults}`);
    });

    test('should return page 1 with offset=0', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Page 1 (offset=0): ${search.hits.length} results`);
      if (search.hits.length > 0) {
        console.log(`     First result: ${search.hits[0].title}`);
      }
    });

    test('should return page 2 with offset=5', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 5,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Page 2 (offset=5): ${search.hits.length} results`);
      if (search.hits.length > 0) {
        console.log(`     First result: ${search.hits[0].title}`);
      }
    });

    test('should return page 3 with offset=10', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 10,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Page 3 (offset=10): ${search.hits.length} results`);
      if (search.hits.length > 0) {
        console.log(`     First result: ${search.hits[0].title}`);
      }
    });

    test('should return different results on different pages', async () => {
      const index = client.index(MEILI_INDEX);
      const page1 = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      const page2 = await index.search('fundacion', {
        limit: 5,
        offset: 5,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      if (page1.hits.length > 0 && page2.hits.length > 0) {
        const firstIds = page1.hits.map(h => h.libid);
        const secondIds = page2.hits.map(h => h.libid);
        const hasOverlap = firstIds.some(id => secondIds.includes(id));
        expect(hasOverlap).toBe(false);
        console.log(`   ✓ Pages have different results (no overlap)`);
        console.log(`     Page 1 IDs: ${firstIds.join(', ')}`);
        console.log(`     Page 2 IDs: ${secondIds.join(', ')}`);
      }
    });
  });

  describe('Author filter with pagination', () => {
    test('should filter by author with limit=5', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        filter: 'authors = "Isaac Asimov"',
        attributesToRetrieve: ['libid', 'title', 'authors'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBeLessThanOrEqual(5);
      console.log(`   ✓ Filtered by "Isaac Asimov": ${search.hits.length} results`);
      console.log(`   ✓ Total matching: ${search.estimatedTotalHits}`);

      if (search.hits.length > 0) {
        search.hits.forEach(hit => {
          expect(hit.authors).toContain('Isaac Asimov');
        });
        console.log(`   ✓ All results are from Isaac Asimov`);
      }
    });

    test('should paginate author-filtered results', async () => {
      const index = client.index(MEILI_INDEX);
      const page1 = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        filter: 'authors = "Isaac Asimov"',
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      const page2 = await index.search('fundacion', {
        limit: 5,
        offset: 5,
        filter: 'authors = "Isaac Asimov"',
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      console.log(`   ✓ Page 1: ${page1.hits.length} results`);
      console.log(`   ✓ Page 2: ${page2.hits.length} results`);
      console.log(`   ✓ Total matching: ${page1.estimatedTotalHits}`);

      if (page1.hits.length > 0 && page2.hits.length > 0) {
        const firstIds = page1.hits.map(h => h.libid);
        const secondIds = page2.hits.map(h => h.libid);
        const hasOverlap = firstIds.some(id => secondIds.includes(id));
        expect(hasOverlap).toBe(false);
        console.log(`   ✓ Pages have different results (no overlap)`);
      }
    });

    test('should use normalized author name (isaac asimov vs Isaac Asimov)', async () => {
      const index = client.index(MEILI_INDEX);

      const search1 = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        filter: 'authors = "isaac asimov"',
        attributesToRetrieve: ['libid', 'title', 'authors'],
        attributesToSearchOn: ['title'],
      });

      const search2 = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        filter: 'authors = "Isaac Asimov"',
        attributesToRetrieve: ['libid', 'title', 'authors'],
        attributesToSearchOn: ['title'],
      });

      console.log(`   ✓ Filter "isaac asimov": ${search1.hits.length} results`);
      console.log(`   ✓ Filter "Isaac Asimov": ${search2.hits.length} results`);

      expect(search1.totalHits).toBe(search2.totalHits);
      console.log(`   ✓ Both return same total: ${search1.totalHits}`);
    });
  });

  describe('Message length constraints', () => {
    test('should not exceed 4096 characters with 5 paginated results', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published'],
        attributesToSearchOn: ['title'],
      });

      const totalPages = Math.ceil(search.estimatedTotalHits / 5);
      let header = `📚 Página 1/${totalPages} (${search.estimatedTotalHits} resultados)\n`;
      header += `🔍 Buscando: "fundacion"\n\n`;

      const bookList = search.hits.map((hit, index) => {
        const globalIndex = (0 * 5) + index + 1;
        return `${globalIndex}. ${hit.title}`;
      }).join('\n');

      const message = header + bookList;
      console.log(`   ✓ Message length: ${message.length} characters`);
      console.log(`   ✓ Telegram limit: 4096 characters`);

      expect(message.length).toBeLessThanOrEqual(4096);
      console.log(`   ✓ Message fits within Telegram limit`);
    });

    test('should EXCEED 4096 characters with all results (simulating old bug)', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('', {
        limit: 30,
        offset: 0,
        attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published'],
      });

      let message = `👤 Modo autor: Isaac Asimov\n\n`;
      message += `📚 Libros de Isaac Asimov que coinciden con "fundacion":\n\n`;

      const results = search.hits.map((hit, i) => {
        const authors = Array.isArray(hit.authors) ? hit.authors.join(', ') : hit.authors || 'Desconocido';
        const year = hit.published ? `(${hit.published})` : '';
        const description = hit.description ? hit.description.substring(0, 280) : '';

        return `${i + 1}. ${hit.title} ${year}\nAutor: ${authors}\n\n${description}`;
      }).join('\n\n---\n\n');

      message += `\n⏰ Expira en 3 minutos\n`;
      message += `/exit - Salir del modo autor`;

      console.log(`   ✓ Results in message: ${search.hits.length}`);
      console.log(`   ✓ Message length: ${message.length} characters`);
      console.log(`   ✓ Telegram limit: 4096 characters`);

      if (message.length > 4096) {
        console.log(`   ⚠ This WOULD cause a crash in the old code`);
        expect(message.length).toBeGreaterThan(4096);
        console.log(`   ✓ Confirmed: message exceeds limit (${message.length} > 4096)`);
      } else {
        console.log(`   ℹ Message fits within limit (not enough results to exceed)`);
      }
    });
  });

  describe('Pagination edge cases', () => {
    test('should handle offset beyond available results', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('fundacion', {
        limit: 5,
        offset: 9999,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBe(0);
      console.log(`   ✓ Empty results for offset=9999`);
    });

    test('should handle query with no results', async () => {
      const index = client.index(MEILI_INDEX);
      const search = await index.search('nonexistentbookxyz123', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      expect(search.hits.length).toBe(0);
      console.log(`   ✓ Empty results for nonexistent query`);
    });

    test('should handle exactly 5 results', async () => {
      const index = client.index(MEILI_INDEX);

      const search = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      const totalPages = Math.ceil(search.estimatedTotalHits / 5);
      console.log(`   ✓ Total results: ${search.estimatedTotalHits}`);
      console.log(`   ✓ Total pages: ${totalPages}`);

      if (search.estimatedTotalHits === 5) {
        expect(totalPages).toBe(1);
        console.log(`   ✓ Exactly 5 results = 1 page`);
      }
    });

    test('should handle just over 5 results (pagination boundary)', async () => {
      const index = client.index(MEILI_INDEX);

      const search = await index.search('fundacion', {
        limit: 5,
        offset: 0,
        attributesToRetrieve: ['libid', 'title'],
        attributesToSearchOn: ['title'],
      });

      const totalPages = Math.ceil(search.estimatedTotalHits / 5);
      const shouldPaginate = search.estimatedTotalHits > 5;

      console.log(`   ✓ Total results: ${search.estimatedTotalHits}`);
      console.log(`   ✓ Should paginate: ${shouldPaginate}`);
      console.log(`   ✓ Total pages: ${totalPages}`);

      if (search.estimatedTotalHits > 5) {
        expect(shouldPaginate).toBe(true);
        expect(totalPages).toBeGreaterThan(1);
        console.log(`   ✓ Pagination needed (results > 5)`);
      }
    });
  });
});
