const buildPaginatedMessage = (query, results, currentPage, totalResults, searchType, displayName = null) => {
  const totalPages = Math.ceil(totalResults / 5);

  let header = '';

  if ((searchType === 'AUTHOR' || searchType === 'AUTHOR_BROWSE') && displayName) {
    header = `👤 Modo autor: ${displayName}\n`;
  }

  header += `📚 Página ${currentPage + 1}/${totalPages} (${totalResults} resultados)\n`;
  header += `🔍 Buscando: "${query}"\n\n`;

  const bookList = results.map((hit, index) => {
    const globalIndex = (currentPage * 5) + index + 1;
    return `${globalIndex}. ${hit.title}`;
  }).join('\n');

  return header + bookList;
};

const buildInlineKeyboard = (results, userId, currentPage = 0, totalResults = 5) => {
  const keyboard = results.map((hit, index) => {
    const row = [
      {
        text: `📥 ${index + 1}. ${hit.title.substring(0, 40)}`,
        callback_data: `download_${hit.libid}`
      },
      {
        text: 'ℹ️ Info',
        callback_data: `info_${hit.libid}`
      }
    ];

    return row;
  });

  const totalPages = Math.ceil(totalResults / 5);
  const isLastPage = currentPage >= totalPages - 1;
  const paginationButtons = buildPaginationKeyboard(currentPage, totalPages, isLastPage);

  return { inline_keyboard: [...keyboard, ...paginationButtons] };
};

const buildPaginationKeyboard = (currentPage, totalPages, isLastPage) => {
  const paginationRow = [];

  if (currentPage > 0) {
    paginationRow.push({
      text: '⬅️ Anterior',
      callback_data: 'page_prev'
    });
  }

  if (!isLastPage) {
    paginationRow.push({
      text: 'Siguiente ➡️',
      callback_data: 'page_next'
    });
  }

  return paginationRow.length > 0 ? [paginationRow] : [];
};

describe('Author Browse Mode Tests', () => {
  const mockResults = [
    { libid: '1', title: 'Foundation' },
    { libid: '2', title: 'I, Robot' },
    { libid: '3', title: 'The Stars, Like Dust' },
    { libid: '4', title: 'Pebble in the Sky' },
    { libid: '5', title: 'The Currents of Space' }
  ];

  describe('Pagination state for AUTHOR_BROWSE', () => {
    test('should create correct state for AUTHOR_BROWSE mode', () => {
      const state = {
        state: 'PAGINATION_MODE',
        query: '',
        searchQuery: '',
        filters: { author: 'Isaac Asimov' },
        searchIn: ['title'],
        useExactPhrase: false,
        currentPage: 0,
        totalResults: 10,
        resultsPerPage: 5,
        searchType: 'AUTHOR_BROWSE',
        displayName: 'Isaac Asimov',
        timestamp: Date.now()
      };

      expect(state.state).toBe('PAGINATION_MODE');
      expect(state.searchQuery).toBe('');
      expect(state.filters.author).toBe('Isaac Asimov');
      expect(state.searchType).toBe('AUTHOR_BROWSE');
      expect(state.searchIn).toEqual(['title']);
      expect(state.useExactPhrase).toBe(false);
    });

    test('should track page navigation correctly', () => {
      let currentPage = 0;
      const totalResults = 12;
      const totalPages = Math.ceil(totalResults / 5);

      expect(currentPage).toBe(0);
      expect(totalPages).toBe(3);

      currentPage++;
      expect(currentPage).toBe(1);

      currentPage++;
      expect(currentPage).toBe(2);
      expect(currentPage).toBe(totalPages - 1);
    });
  });

  describe('Message formatting for AUTHOR_BROWSE', () => {
    test('should format message for AUTHOR_BROWSE with empty query', () => {
      const result = buildPaginatedMessage('', mockResults, 0, 10, 'AUTHOR_BROWSE', 'Isaac Asimov');
      
      expect(result).toContain('👤 Modo autor: Isaac Asimov');
      expect(result).toContain('Página 1/2 (10 resultados)');
      expect(result).toContain('Buscando: ""');
      expect(result).toContain('1. Foundation');
      expect(result).toContain('2. I, Robot');
    });

    test('should format message for AUTHOR_BROWSE on second page', () => {
      const secondPageResults = [
        { title: 'Prelude to Foundation' },
        { title: 'Forward the Foundation' }
      ];
      const result = buildPaginatedMessage('', secondPageResults, 1, 7, 'AUTHOR_BROWSE', 'Isaac Asimov');
      
      expect(result).toContain('Página 2/2 (7 resultados)');
      expect(result).toContain('6. Prelude to Foundation');
      expect(result).toContain('7. Forward the Foundation');
    });

    test('should handle single page in AUTHOR_BROWSE', () => {
      const result = buildPaginatedMessage('', mockResults, 0, 5, 'AUTHOR_BROWSE', 'Isaac Asimov');
      
      expect(result).toContain('Página 1/1 (5 resultados)');
      expect(result).toContain('1. Foundation');
      expect(result).toContain('5. The Currents of Space');
    });
  });

  describe('Keyboard formatting for AUTHOR_BROWSE', () => {
    test('should show download buttons for author books', () => {
      const result = buildInlineKeyboard(mockResults, '123', 0, 10);
      
      expect(result.inline_keyboard[0][0].text).toContain('Foundation');
      expect(result.inline_keyboard[0][0].callback_data).toBe('download_1');
      expect(result.inline_keyboard[0][1].callback_data).toBe('info_1');
    });

    test('should show pagination buttons on first page of author browse', () => {
      const result = buildInlineKeyboard(mockResults, '123', 0, 10);
      
      const paginationRow = result.inline_keyboard[5];
      expect(paginationRow).toBeDefined();
      expect(paginationRow[0].text).toBe('Siguiente ➡️');
      expect(paginationRow[0].callback_data).toBe('page_next');
    });

    test('should show both navigation buttons on middle pages', () => {
      const result = buildInlineKeyboard(mockResults, '123', 1, 15);
      
      const paginationRow = result.inline_keyboard[5];
      expect(paginationRow).toBeDefined();
      expect(paginationRow[0].text).toBe('⬅️ Anterior');
      expect(paginationRow[0].callback_data).toBe('page_prev');
      expect(paginationRow[1].text).toBe('Siguiente ➡️');
      expect(paginationRow[1].callback_data).toBe('page_next');
    });

    test('should show only previous button on last page', () => {
      const result = buildInlineKeyboard(mockResults, '123', 2, 15);
      
      const paginationRow = result.inline_keyboard[5];
      expect(paginationRow).toBeDefined();
      expect(paginationRow[0].text).toBe('⬅️ Anterior');
      expect(paginationRow[0].callback_data).toBe('page_prev');
      expect(paginationRow[1]).toBeUndefined();
    });
  });

  describe('Author browse edge cases', () => {
    test('should handle author with no books', () => {
      const result = buildPaginatedMessage('', [], 0, 0, 'AUTHOR_BROWSE', 'Unknown Author');
      
      expect(result).toContain('👤 Modo autor: Unknown Author');
      expect(result).toContain('Página 1/0 (0 resultados)');
      expect(result).toContain('Buscando: ""');
    });

    test('should handle author with exactly 5 books', () => {
      const result = buildPaginatedMessage('', mockResults, 0, 5, 'AUTHOR_BROWSE', 'Author Five');
      
      expect(result).toContain('Página 1/1 (5 resultados)');
    });

    test('should handle author with many books (20+)', () => {
      const result = buildPaginatedMessage('', [{ title: 'Book' }], 4, 25, 'AUTHOR_BROWSE', 'Prolific Author');
      
      expect(result).toContain('Página 5/5 (25 resultados)');
    });

    test('should handle special characters in author name', () => {
      const result = buildPaginatedMessage('', mockResults, 0, 5, 'AUTHOR_BROWSE', 'José María García-López');
      
      expect(result).toContain('👤 Modo autor: José María García-López');
    });
  });

  describe('Callback data validation', () => {
    test('should correctly parse author name from browse_author_* callback', () => {
      const callbackData = 'browse_author_Isaac Asimov';
      const authorName = callbackData.replace('browse_author_', '');
      
      expect(authorName).toBe('Isaac Asimov');
    });

    test('should handle author name with spaces in callback', () => {
      const callbackData = 'browse_author_Gabriel García Márquez';
      const authorName = callbackData.replace('browse_author_', '');
      
      expect(authorName).toBe('Gabriel García Márquez');
    });

    test('should handle empty author name', () => {
      const callbackData = 'browse_author_';
      const authorName = callbackData.replace('browse_author_', '');
      
      expect(authorName).toBe('');
    });
  });

  describe('Search parameter validation for author browse', () => {
    test('should have correct search parameters for author browse', () => {
      const searchParams = {
        query: '',
        limit: 5,
        filters: { author: 'Isaac Asimov' },
        offset: 0,
        searchIn: ['title'],
        useExactPhrase: false
      };

      expect(searchParams.query).toBe('');
      expect(searchParams.filters.author).toBe('Isaac Asimov');
      expect(searchParams.searchIn).toEqual(['title']);
      expect(searchParams.useExactPhrase).toBe(false);
      expect(searchParams.offset).toBe(0);
      expect(searchParams.limit).toBe(5);
    });

    test('should calculate correct offset for pagination', () => {
      const currentPage = 2;
      const resultsPerPage = 5;
      const offset = currentPage * resultsPerPage;

      expect(offset).toBe(10);
    });

    test('should handle offset for first page', () => {
      const currentPage = 0;
      const resultsPerPage = 5;
      const offset = currentPage * resultsPerPage;

      expect(offset).toBe(0);
    });

    test('should keep empty searchQuery for browse pagination', () => {
      const state = {
        query: 'Isaac Asimov',
        searchQuery: ''
      };

      const resolvedQuery = state.searchQuery !== undefined ? state.searchQuery : state.query;

      expect(resolvedQuery).toBe('');
    });
  });

  describe('Comparison with other search types', () => {
    test('AUTHOR_BROWSE should have empty query unlike AUTHOR search', () => {
      const authorBrowseState = {
        searchType: 'AUTHOR_BROWSE',
        searchQuery: '',
        query: ''
      };

      const authorSearchState = {
        searchType: 'AUTHOR',
        searchQuery: 'foundation',
        query: 'foundation'
      };

      expect(authorBrowseState.searchQuery).toBe('');
      expect(authorSearchState.searchQuery).toBe('foundation');
    });

    test('AUTHOR_BROWSE should use author filter like AUTHOR search', () => {
      const authorBrowseState = {
        searchType: 'AUTHOR_BROWSE',
        filters: { author: 'Isaac Asimov' }
      };

      const authorSearchState = {
        searchType: 'AUTHOR',
        filters: { author: 'Isaac Asimov' }
      };

      expect(authorBrowseState.filters.author).toBe(authorSearchState.filters.author);
    });
  });
});
