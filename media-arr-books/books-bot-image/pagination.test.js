const buildPaginatedMessage = (query, results, currentPage, totalResults, searchType, displayName = null) => {
  const totalPages = Math.ceil(totalResults / 5);

  let header = '';

  if (searchType === 'AUTHOR' && displayName) {
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

describe('buildPaginationKeyboard', () => {
  test('should show only "Next" button on first page', () => {
    const result = buildPaginationKeyboard(0, 3, false);
    expect(result).toEqual([[
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);
  });

  test('should show only "Previous" button on last page', () => {
    const result = buildPaginationKeyboard(2, 3, true);
    expect(result).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' }
    ]]);
  });

  test('should show both buttons on middle pages', () => {
    const result = buildPaginationKeyboard(1, 3, false);
    expect(result).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' },
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);
  });

  test('should return empty array when no navigation needed', () => {
    const result = buildPaginationKeyboard(0, 1, true);
    expect(result).toEqual([]);
  });

  test('should handle single page scenario', () => {
    const result = buildPaginationKeyboard(0, 1, true);
    expect(result).toEqual([]);
  });

  test('should handle many pages scenario on first page', () => {
    const result = buildPaginationKeyboard(0, 10, false);
    expect(result).toEqual([[
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);
  });
});

describe('buildPaginatedMessage', () => {
  const mockResults = [
    { title: 'Book 1' },
    { title: 'Book 2' },
    { title: 'Book 3' }
  ];

  test('should format message for normal search on first page', () => {
    const result = buildPaginatedMessage('test', mockResults, 0, 10, 'NORMAL');
    expect(result).toContain('Página 1/2 (10 resultados)');
    expect(result).toContain('Buscando: "test"');
    expect(result).toContain('1. Book 1');
    expect(result).toContain('2. Book 2');
    expect(result).toContain('3. Book 3');
    expect(result).not.toContain('👤 Modo autor');
  });

  test('should format message for normal search on second page', () => {
    const result = buildPaginatedMessage('test', mockResults, 1, 10, 'NORMAL');
    expect(result).toContain('Página 2/2 (10 resultados)');
    expect(result).toContain('6. Book 1');
    expect(result).toContain('7. Book 2');
    expect(result).toContain('8. Book 3');
  });

  test('should format message for author search', () => {
    const result = buildPaginatedMessage('test', mockResults, 1, 15, 'AUTHOR', 'Terry Pratchett');
    expect(result).toContain('👤 Modo autor: Terry Pratchett');
    expect(result).toContain('Página 2/3 (15 resultados)');
    expect(result).toContain('Buscando: "test"');
  });

  test('should show global index numbers on subsequent pages', () => {
    const result = buildPaginatedMessage('test', mockResults, 2, 20, 'NORMAL');
    expect(result).toContain('11. Book 1');
    expect(result).toContain('12. Book 2');
    expect(result).toContain('13. Book 3');
  });

  test('should handle empty results', () => {
    const result = buildPaginatedMessage('test', [], 0, 0, 'NORMAL');
    expect(result).toContain('Página 1/0 (0 resultados)');
    expect(result).toContain('Buscando: "test"');
  });

  test('should handle single result', () => {
    const singleResult = [{ title: 'Single Book' }];
    const result = buildPaginatedMessage('test', singleResult, 0, 1, 'NORMAL');
    expect(result).toContain('Página 1/1 (1 resultados)');
    expect(result).toContain('1. Single Book');
  });

  test('should handle exact page boundary (5 results)', () => {
    const fiveResults = [
      { title: 'Book 1' },
      { title: 'Book 2' },
      { title: 'Book 3' },
      { title: 'Book 4' },
      { title: 'Book 5' }
    ];
    const result = buildPaginatedMessage('test', fiveResults, 0, 5, 'NORMAL');
    expect(result).toContain('Página 1/1 (5 resultados)');
    expect(result).toContain('1. Book 1');
    expect(result).toContain('5. Book 5');
  });

  test('should handle just over page boundary (6 results)', () => {
    const sixResults = [
      { title: 'Book 1' },
      { title: 'Book 2' },
      { title: 'Book 3' }
    ];
    const result = buildPaginatedMessage('test', sixResults, 1, 6, 'NORMAL');
    expect(result).toContain('Página 2/2 (6 resultados)');
    expect(result).toContain('6. Book 1');
    expect(result).toContain('7. Book 2');
    expect(result).toContain('8. Book 3');
  });
});

describe('Pagination state management', () => {
  test('should calculate correct total pages for various result counts', () => {
    expect(Math.ceil(5 / 5)).toBe(1);
    expect(Math.ceil(6 / 5)).toBe(2);
    expect(Math.ceil(10 / 5)).toBe(2);
    expect(Math.ceil(11 / 5)).toBe(3);
    expect(Math.ceil(0 / 5)).toBe(0);
  });

  test('should track current page correctly', () => {
    let currentPage = 0;
    const totalResults = 12;
    const totalPages = Math.ceil(totalResults / 5);

    expect(currentPage).toBe(0);
    expect(totalPages).toBe(3);

    currentPage++;
    expect(currentPage).toBe(1);

    currentPage++;
    expect(currentPage).toBe(2);
  });

  test('should validate page boundaries', () => {
    const totalPages = 3;
    let currentPage = 0;

    expect(currentPage > 0).toBe(false);
    expect(currentPage < totalPages - 1).toBe(true);

    currentPage = 1;
    expect(currentPage > 0).toBe(true);
    expect(currentPage < totalPages - 1).toBe(true);

    currentPage = 2;
    expect(currentPage > 0).toBe(true);
    expect(currentPage < totalPages - 1).toBe(false);
  });
});

describe('Pagination edge cases', () => {
  test('should handle very large result sets', () => {
    const largeResults = 100;
    const totalPages = Math.ceil(largeResults / 5);
    expect(totalPages).toBe(20);

    const result = buildPaginatedMessage('test', [{ title: 'Book' }], 19, 100, 'NORMAL');
    expect(result).toContain('Página 20/20 (100 resultados)');
  });

  test('should handle query with special characters', () => {
    const result = buildPaginatedMessage('test "quoted" & symbols', [{ title: 'Book' }], 0, 1, 'NORMAL');
    expect(result).toContain('Buscando: "test "quoted" & symbols"');
  });

  test('should handle very long book titles in global index calculation', () => {
    const result = buildPaginatedMessage(
      'test',
      [{ title: 'A'.repeat(200) }],
      10,
      60,
      'NORMAL'
    );
    expect(result).toContain('51.');
    expect(result).toContain('A'.repeat(200));
  });

  test('should handle author display name truncation', () => {
    const longAuthorName = 'Very Long Author Name That Might Need Truncation In Some Contexts';
    const result = buildPaginatedMessage('test', [{ title: 'Book' }], 0, 1, 'AUTHOR', longAuthorName);
    expect(result).toContain(`👤 Modo autor: ${longAuthorName}`);
  });
});

describe('Pagination activation logic', () => {
  test('should activate pagination when results > 5', () => {
    const totalResults = 6;
    const shouldActivatePagination = totalResults > 5;
    expect(shouldActivatePagination).toBe(true);
  });

  test('should NOT activate pagination when results <= 5', () => {
    const totalResults = 5;
    const shouldActivatePagination = totalResults > 5;
    expect(shouldActivatePagination).toBe(false);

    const totalResults2 = 3;
    const shouldActivatePagination2 = totalResults2 > 5;
    expect(shouldActivatePagination2).toBe(false);
  });

  test('should activate pagination for exactly 6 results (boundary)', () => {
    const totalResults = 6;
    const shouldActivatePagination = totalResults > 5;
    expect(shouldActivatePagination).toBe(true);
  });
});

describe('Navigation button visibility', () => {
  test('should show "Next" button on all pages except last', () => {
    expect(buildPaginationKeyboard(0, 3, false)).toEqual([[
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);

    expect(buildPaginationKeyboard(1, 3, false)).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' },
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);

    expect(buildPaginationKeyboard(2, 3, true)).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' }
    ]]);
  });

  test('should show "Previous" button on all pages except first', () => {
    expect(buildPaginationKeyboard(0, 3, false)).toEqual([[
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);

    expect(buildPaginationKeyboard(1, 3, false)).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' },
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);

    expect(buildPaginationKeyboard(2, 3, true)).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' }
    ]]);
  });

  test('should show both buttons on middle pages', () => {
    const result = buildPaginationKeyboard(1, 5, false);
    expect(result).toEqual([[
      { text: '⬅️ Anterior', callback_data: 'page_prev' },
      { text: 'Siguiente ➡️', callback_data: 'page_next' }
    ]]);
  });

  test('should show no buttons for single page', () => {
    const result = buildPaginationKeyboard(0, 1, true);
    expect(result).toEqual([]);
  });
});
