import { jest } from '@jest/globals';
import {
  buildAuthorPreviewMessage,
  extractAuthorsFromFacets,
  handleAuthorSuggestion,
  normalizeAuthor,
  searchWithStrategies,
  sendAuthorCtaAfterTitleResults
} from './index.js';

describe('searchWithStrategies', () => {
  test('uses title exact strategy first', async () => {
    const searchFn = jest.fn().mockResolvedValueOnce({
      hits: [{ title: 'Book' }],
      totalHits: 1
    });

    const result = await searchWithStrategies('fundacion', 5, searchFn);

    expect(result.strategy).toBe('title');
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith(
      'fundacion',
      5,
      null,
      0,
      ['title'],
      true
    );
  });

  test('falls back to combined strategy when title returns 0', async () => {
    const searchFn = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [{ title: 'Book' }], totalHits: 1 });

    const result = await searchWithStrategies('asimov', 5, searchFn);

    expect(result.strategy).toBe('combined');
    expect(searchFn).toHaveBeenCalledTimes(2);
  });

  test('tries author+title strategy for multi-word queries', async () => {
    const searchFn = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [{ title: 'Foundation' }], totalHits: 1 });

    const result = await searchWithStrategies('asimov foundation', 5, searchFn);

    expect(result.strategy).toBe('author_plus_title');
    expect(searchFn).toHaveBeenNthCalledWith(3,
      'foundation',
      5,
      { author: 'asimov' },
      0,
      ['title'],
      false
    );
  });
});

describe('extractAuthorsFromFacets', () => {
  test('filters authors by normalized query substring', () => {
    const facetMap = {
      'Isaac Asimov': 10,
      'Arthur C. Clarke': 8,
      'Isaac Newton': 3
    };

    const authors = extractAuthorsFromFacets(facetMap, 'asimov', 10);
    expect(authors).toHaveLength(1);
    expect(normalizeAuthor(authors[0].name)).toContain('asimov');
  });
});

describe('buildAuthorPreviewMessage', () => {
  test('includes preview list and remaining count', () => {
    const author = { displayName: 'Isaac Asimov', name: 'Isaac Asimov' };
    const previewBooks = [
      { title: 'Foundation', published: 1951 },
      { title: 'I, Robot', published: 1950 }
    ];

    const message = buildAuthorPreviewMessage(author, previewBooks, 120, 'asimov');

    expect(message).toContain('No encontré libros con el título "asimov"');
    expect(message).toContain('Isaac Asimov');
    expect(message).toContain('120 libros');
    expect(message).toContain('Foundation (1951)');
    expect(message).toContain('Y 115 más libros');
  });
});

describe('sendAuthorCtaAfterTitleResults', () => {
  test('sends CTA when exactly one author match', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({}) };
    const uniqueAuthors = [{ name: 'Isaac Asimov', displayName: 'Isaac Asimov' }];

    await sendAuthorCtaAfterTitleResults(bot, 'chat1', uniqueAuthors);

    expect(bot.sendMessage).toHaveBeenCalledWith(
      'chat1',
      expect.stringContaining('¿Quieres pasar a modo autor?'),
      expect.objectContaining({
        reply_markup: expect.any(Object)
      })
    );
  });

  test('does nothing for multiple authors', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({}) };
    const uniqueAuthors = [
      { name: 'Isaac Asimov', displayName: 'Isaac Asimov' },
      { name: 'Arthur C. Clarke', displayName: 'Arthur C. Clarke' }
    ];

    await sendAuthorCtaAfterTitleResults(bot, 'chat1', uniqueAuthors);

    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});

describe('handleAuthorSuggestion', () => {
  test('sends preview for single author match', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({}) };
    const meiliClient = {
      index: () => ({
        search: jest.fn().mockResolvedValue({
          hits: [
            { title: 'Foundation', published: 1951 },
            { title: 'I, Robot', published: 1950 }
          ]
        })
      })
    };
    const getTotalBooksByAuthor = jest.fn().mockResolvedValue(120);

    await handleAuthorSuggestion(
      bot,
      'chat1',
      'user1',
      'asimov',
      [{ name: 'Isaac Asimov', displayName: 'Isaac Asimov' }],
      { meiliClient, getTotalBooksByAuthor }
    );

    expect(bot.sendMessage).toHaveBeenCalledWith(
      'chat1',
      expect.stringContaining('Primeros 5 libros'),
      expect.objectContaining({
        reply_markup: expect.any(Object)
      })
    );
  });

  test('does nothing when no authors', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({}) };

    await handleAuthorSuggestion(bot, 'chat1', 'user1', 'xyz', []);

    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});
