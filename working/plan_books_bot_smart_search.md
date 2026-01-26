# Plan: Smart Author Search + Combined Search

## 📋 Resumen Ejecutivo

Mejorar la búsqueda del bot de libros para detectar automáticamente cuando el usuario busca un autor y proponer activar el modo autor con preview de libros, además de implementar búsqueda combinada (título + autor).

**Estado**: Planificado ✅  
**Fecha**: 2026-01-26  
**Servicio**: `media-arr-books/books-bot-image`  
**Impacto**: Mejora significativa en UX del bot

---

## 🎯 Objetivos

1. **Smart Author Detection**:
   - Si título = 0: usar facetas de Meili para autores y mostrar preview de 5 libros + aviso si hay más
   - Si título > 0 y hay autor único por facetas: enviar CTA separado para activar modo autor
2. **Combined Search**: Búsqueda inteligente que intenta múltiples estrategias (título, autor+título, combinado)
3. **Límite de 5 autores**: Mostrar hasta 5 autores en sugerencias, pedir refinamiento si hay más
4. **Tests Completos**: Suite de tests para validar todas las funcionalidades

---

## 🔍 Análisis del Problema Actual

### Estado Actual

- **Línea 371** (`index.js`): `searchMeilisearch()` solo busca en `restrictSearchableAttributes: ['title']`
- **Líneas 867-870** (`index.js`): Si búsqueda devuelve 0 resultados → mensaje "No encontré resultados"
- **Comando `/author`**: Funciona bien pero requiere uso explícito del usuario

### Problema

Cuando el usuario busca "asimov" sin resultados en título, el bot responde "No encontré resultados" aunque existen 120 libros de Isaac Asimov en la biblioteca.

### Flujo Deseado (clarificado)

```
Caso A: Título > 0 resultados
Usuario busca: "asimov foundation"
    ↓
1) Búsqueda normal en título (exacta) → devuelve resultados
    ↓
2) Mostrar 5 resultados de título (como hoy)
    ↓
3) Enviar mensaje separado con CTA:
   "👤 Encontré un autor que coincide: Isaac Asimov.
    ¿Quieres pasar a modo autor?"
   Botón: "✅ Sí, buscar solo libros de Isaac Asimov"

Caso B: Título = 0 y autor único (ej. "kazentbach")
    ↓
1) Búsqueda normal en título (exacta) → 0 resultados
    ↓
2) Detección de autor por facetas (Meili)
    ↓
3) Mostrar preview de 5 libros del autor + aviso de más
   "🔍 No encontré libros con el título "kazentbach"...
    👤 ¡Pero encontré un autor! [Autor] tiene N libros
    📖 Primeros 5 libros:
    1. ...
    ...
    💡 Y X más libros de [Autor]...
    ¿Quieres buscar solo libros de [Autor]?"
   Botón: "✅ Sí, buscar solo libros de [Autor]"
    ↓
4) Al aceptar: activar modo autor

Caso C: Título = 0 y 2-5 autores encontrados (facetas)
    ↓
Mensaje: "🔍 No encontré libros con el título "smith"...
           👤 Encontré 3 autores que coinciden:
           1. John Smith (45 libros)
           2. Adam Smith (12 libros)
           3. Mary Smith (8 libros)
           Elige el autor que quieres usar:"
    ↓
Botones para seleccionar autor

Caso D: Título = 0 y >5 autores encontrados (facetas)
    ↓
Mensaje: "🔍 No encontré libros con el título "smith"...
           👤 Encontré muchos autores que coinciden.
           Usa /author smith [apellido] para refinar la búsqueda."

Caso E: Título = 0 y 0 autores encontrados
    ↓
Mensaje actual: "No encontré resultados"
```

---

## 🔧 Implementación

### Estrategia de Búsqueda Combinada

Para implementar "asimov foundation", usaremos **estrategias en cascada**:

```javascript
// Estrategias probadas en orden:
1. Buscar en título completo: "asimov foundation"
   → restrictSearchableAttributes: ['title'] + query exacta (con comillas)
2. Si falla, buscar en ambos campos: "asimov foundation"
   → restrictSearchableAttributes: ['title', 'authors'] + query sin comillas
3. Si falla, parsear y buscar: author="asimov" + title="foundation"
   → filter: 'authors = "asimov"' + query: "foundation"
```

**Razón**: Primero intentamos la búsqueda directa del usuario. Si no hay resultados, probamos estrategias más complejas.

---

### Cambio 1: Modificar `searchMeilisearch()` para búsqueda combinada

**Archivo**: `index.js` (líneas 364-393)

**Antes**:
```javascript
const searchMeilisearch = async (query, limit = 5, filters = null, offset = 0) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const searchParams = {
      limit,
      offset,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
      restrictSearchableAttributes: ['title'],  // ← Solo título
    };
    // ... resto del código igual
  }
};
```

**Después**:
```javascript
const searchMeilisearch = async (
  query,
  limit = 5,
  filters = null,
  offset = 0,
  searchIn = ['title'],
  useExactPhrase = false
) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const searchParams = {
      limit,
      offset,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
      restrictSearchableAttributes: searchIn,  // ← Parámetro configurable
    };

    if (filters && filters.author) {
      searchParams.filter = `authors = "${filters.author}"`;
      logger.info({ query, filter: searchParams.filter, offset, searchIn }, '[MEILISEARCH] Author filter APPLIED');
    } else {
      logger.info({ query, limit, offset, filters, searchIn }, '[MEILISEARCH] NO filter applied');
    }

    const effectiveQuery = useExactPhrase ? `"${query}"` : query;
    const search = await index.search(effectiveQuery, searchParams);

    const totalHits = search.totalHits ?? search.estimatedTotalHits;
    logger.info({ query, offset, totalHits: search.totalHits, estimatedTotalHits: search.estimatedTotalHits, searchIn }, '[MEILISEARCH] Total hits fields');

    logger.info({ query, results: search.hits.length, offset, totalHits, hasFilter: !!filters, filterValue: filters?.author, searchIn }, '[MEILISEARCH] Search completed');

    return { hits: search.hits, totalHits };
  } catch (err) {
    logger.error({ err, query, filters, offset, searchIn, useExactPhrase }, '[MEILISEARCH] Error searching');
    throw err;
  }
};
```

**Cambios**:
- Agregar parámetro `searchIn` (default: `['title']`)
- Actualizar logging para incluir `searchIn`
- Mantener backward compatibility con llamadas existentes

---

### Cambio 2: Nueva función `searchWithStrategies()`

**Archivo**: `index.js` (agregar después de `searchMeilisearch()`)

```javascript
const searchWithStrategies = async (query, limit = 5) => {
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
    const result = await searchMeilisearch(
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
      searchIn: strategy.searchIn
    }, '[COMBINED] Strategy tried');

    if (result.hits.length > 0) {
      return {
        ...result,
        strategy: strategy.name,
        strategyDesc: strategy.desc
      };
    }
  }

  return {
    hits: [],
    totalHits: 0,
    strategy: 'none',
    strategyDesc: 'No se encontraron resultados'
  };
};
```

**Características**:
- Estrategias probadas en orden de simpleza → complejidad
- Parsea query de múltiples palabras para intentar autor+título
- Retorna resultado de primera estrategia exitosa
- Logging detallado de cada estrategia

---

### Cambio 3: Nueva función `searchAuthorFacets()`

**Archivo**: `index.js` (agregar después de `searchWithStrategies()`)

```javascript
const searchAuthorFacets = async (query, limit = 10) => {
  const index = meiliClient.index(MEILI_INDEX);
  const search = await index.search(query, {
    limit: 0,
    facets: ['authors'],
    facetLimit: limit
  });

  return search.facetDistribution?.authors || {};
};

const extractAuthorsFromFacets = (facetMap) => {
  return Object.entries(facetMap).map(([name, count]) => ({
    name,
    displayName: name,
    bookCount: count
  }));
};
```

**Características**:
- Usa facetas nativas de MeiliSearch para obtener autores + conteo
- Evita deduplicar hits y mejora performance

---

### Cambio 4: Nueva función `buildAuthorPreviewMessage()`

**Archivo**: `index.js` (agregar después de `buildPaginatedMessage()`)

```javascript
const buildAuthorPreviewMessage = (author, previewBooks, totalBooks, originalQuery) => {
  let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
  messageText += `👤 ¡Pero encontré un autor!\n\n`;
  messageText += `✍️ ${author.displayName}\n`;
  messageText += `📚 Tiene ${totalBooks} libro${totalBooks > 1 ? 's' : ''} en la biblioteca.\n\n`;

  if (totalBooks > 5) {
    messageText += `📖 Primeros 5 libros:\n\n`;
  } else {
    messageText += `📖 Todos sus libros:\n\n`;
  }

  previewBooks.forEach((book, index) => {
    const year = book.published ? `(${book.published})` : '';
    messageText += `${index + 1}. ${book.title} ${year}\n`;
  });

  if (totalBooks > 5) {
    messageText += `\n💡 Y ${totalBooks - 5} más libros de ${author.displayName}...\n\n`;
    messageText += `¿Quieres buscar solo libros de ${author.displayName}?`;
  } else {
    messageText += `\n\n¿Quieres buscar libros de ${author.displayName}?`;
  }

  return messageText;
};
```

**Características**:
- Mensaje informativo con preview de libros
- Muestra diferencia entre "Primeros 5" vs "Todos" según total
- Aviso de cantidad de libros adicionales si total > 5
- Manejo de libros sin año de publicación

---

### Cambio 5: Nueva función `sendAuthorCtaAfterTitleResults()`

**Archivo**: `index.js` (agregar después de `buildAuthorPreviewMessage()`)

```javascript
const sendAuthorCtaAfterTitleResults = async (bot, chatId, uniqueAuthors) => {
  if (uniqueAuthors.length !== 1) return;

  const author = uniqueAuthors[0];
  await bot.sendMessage(chatId,
    `👤 Encontré un autor que coincide: ${author.displayName}.\n\n` +
    `¿Quieres pasar a modo autor?`,
    {
      reply_markup: {
        inline_keyboard: [[{
          text: `✅ Sí, buscar solo libros de ${author.displayName.substring(0, 25)}`,
          callback_data: `activate_author_${author.name}`
        }]]
      }
    }
  );
};
```

**Características**:
- Se usa solo cuando ya hubo resultados por título
- Envía CTA separado para activar modo autor

---

### Cambio 6: Nueva función `handleAuthorSuggestion()`

**Archivo**: `index.js` (agregar después de `buildAuthorPreviewMessage()`)

```javascript
const handleAuthorSuggestion = async (bot, chatId, userId, originalQuery, uniqueAuthors) => {
  if (uniqueAuthors.length === 1) {
    const author = uniqueAuthors[0];
    const totalBooks = await getTotalBooksByAuthor(author.name);

    const index = meiliClient.index(MEILI_INDEX);
    const previewSearch = await index.search('', {
      limit: 5,
      filter: `authors = "${author.name}"`,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    });

    const previewBooks = previewSearch.hits;

    const messageText = buildAuthorPreviewMessage(author, previewBooks, totalBooks, originalQuery);

    const keyboard = [[{
      text: `✅ Sí, buscar libros de ${author.displayName.substring(0, 25)}`,
      callback_data: `activate_author_${author.name}`
    }]];

    await bot.sendMessage(chatId, messageText, {
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard }
    });

    logger.info({
      chatId,
      author: author.name,
      totalBooks,
      previewBooks: previewBooks.length
    }, '[SUGGESTION] Author suggestion with preview sent');

  } else if (uniqueAuthors.length <= 5) {
    let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
    messageText += `👤 Encontré ${uniqueAuthors.length} autores que coinciden:\n\n`;

    uniqueAuthors.forEach((author, index) => {
      messageText += `${index + 1}. ${author.displayName}\n`;
    });

    messageText += `\nElige el autor que quieres usar:`;

    const keyboard = uniqueAuthors.map((author, index) => [{
      text: `${index + 1}. ${author.displayName.substring(0, 30)}`,
      callback_data: `activate_author_${author.name}`
    }]);

    await bot.sendMessage(chatId, messageText, {
      reply_markup: { inline_keyboard: keyboard }
    });

    logger.info({
      chatId,
      authors: uniqueAuthors.length,
      authorsList: uniqueAuthors.map(a => a.name)
    }, '[SUGGESTION] Multiple authors suggestion sent');

  } else {
    let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
    messageText += `👤 Encontré muchos autores que coinciden.\n\n`;
    messageText += `Usa /author ${originalQuery} [apellido] para refinar la búsqueda.`;

    await bot.sendMessage(chatId, messageText);

    logger.info({ chatId, query: originalQuery }, '[SUGGESTION] Too many authors, asking for refinement');
  }
};
```

**Características**:
- Maneja 1, 2-5, >5 autores de forma diferente
- Obtiene preview de 5 libros del autor
- Crea keyboard interactivo para selección
- Logging detallado para debugging

---

### Cambio 7: Modificar búsqueda normal (líneas 860-918)

**Archivo**: `index.js`

**Antes** (líneas 860-871):
```javascript
try {
  logger.info({ chatId, text }, '[SEARCH] Normal search START');
  const searchResult = await searchMeilisearch(text, 5, null);
  const results = searchResult.hits;

  logger.info({ chatId, text, results: results.length, totalHits: searchResult.totalHits }, '[SEARCH] Normal search completed');

  if (results.length === 0) {
    bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
    clearConversationState(chatId);
    return;
  }

  const totalCount = searchResult.totalHits;

  if (totalCount > 5) {
    conversationStates.set(chatId, {
      state: 'PAGINATION_MODE',
      query: text,
      filters: null,
      currentPage: 0,
      totalResults: totalCount,
      resultsPerPage: 5,
      searchType: 'NORMAL',
      displayName: null,
      timestamp: Date.now()
    });

    const messageText = buildPaginatedMessage(text, results, 0, totalCount, 'NORMAL');

    try {
      await bot.sendMessage(chatId, messageText, {
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(results, userId, 0, totalCount)
      });
    } catch (err) {
      logger.error({ chatId, err }, '[SEND] Error sending message in normal pagination mode');
      bot.sendMessage(chatId,
        `❌ Error al mostrar resultados. Intenta con una búsqueda más específica.`
      );
      return;
    }

    logger.info({ chatId, query: text, totalResults: totalCount }, '[PAGINATION] Pagination mode activated');

    const authorFacets = await searchAuthorFacets(text, 10);
    const uniqueAuthors = extractAuthorsFromFacets(authorFacets);
    await sendAuthorCtaAfterTitleResults(bot, chatId, uniqueAuthors);
    return;
  }

  const messageText = `📚 Resultados para "${text}":\n\n` +
    results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

  await bot.sendMessage(chatId, messageText, {
    disable_web_page_preview: true,
    reply_markup: buildInlineKeyboard(results, userId)
  });
} catch (err) {
  logger.error({ chatId, err }, '[SEARCH] Error processing search');
  clearConversationState(chatId);
  bot.sendMessage(chatId, `❌ Error al buscar: ${err.message}`);
}
```

**Después**:
```javascript
try {
  logger.info({ chatId, text }, '[SEARCH] Combined search START');

  const searchResult = await searchWithStrategies(text, 5);
  const results = searchResult.hits;

  logger.info({
    chatId,
    text,
    results: results.length,
    totalHits: searchResult.totalHits,
    strategy: searchResult.strategy,
    strategyDesc: searchResult.strategyDesc
  }, '[SEARCH] Combined search completed');

  if (results.length === 0) {
    logger.info({ chatId, text }, '[SEARCH] No results, checking authors...');

    const authorFacets = await searchAuthorFacets(text, 10);
    const uniqueAuthors = extractAuthorsFromFacets(authorFacets);

    if (uniqueAuthors.length > 0) {
      await handleAuthorSuggestion(bot, chatId, userId, text, uniqueAuthors);
      return;
    }

    bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
    clearConversationState(chatId);
    return;
  }

  const totalCount = searchResult.totalHits;

  if (totalCount > 5) {
    conversationStates.set(chatId, {
      state: 'PAGINATION_MODE',
      query: text,
      filters: null,
      currentPage: 0,
      totalResults: totalCount,
      resultsPerPage: 5,
      searchType: 'NORMAL',
      displayName: null,
      timestamp: Date.now()
    });

    const messageText = buildPaginatedMessage(text, results, 0, totalCount, 'NORMAL');

    try {
      await bot.sendMessage(chatId, messageText, {
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(results, userId, 0, totalCount)
      });
    } catch (err) {
      logger.error({ chatId, err }, '[SEND] Error sending message in normal pagination mode');
      bot.sendMessage(chatId,
        `❌ Error al mostrar resultados. Intenta con una búsqueda más específica.`
      );
      return;
    }

    logger.info({ chatId, query: text, totalResults: totalCount }, '[PAGINATION] Pagination mode activated');
    return;
  }

  const messageText = `📚 Resultados para "${text}":\n\n` +
    results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

  await bot.sendMessage(chatId, messageText, {
    disable_web_page_preview: true,
    reply_markup: buildInlineKeyboard(results, userId)
  });

  // Si hay resultados por título, enviar CTA separado si hay autor match por facetas.
  const authorFacets = await searchAuthorFacets(text, 10);
  const uniqueAuthors = extractAuthorsFromFacets(authorFacets);
  await sendAuthorCtaAfterTitleResults(bot, chatId, uniqueAuthors);
} catch (err) {
  logger.error({ chatId, err }, '[SEARCH] Error processing search');
  clearConversationState(chatId);
  bot.sendMessage(chatId, `❌ Error al buscar: ${err.message}`);
}
```

**Cambios**:
- Usar `searchWithStrategies()` en lugar de `searchMeilisearch()`
- Agregar logging de estrategia utilizada
- Cuando no hay resultados, buscar autores por facetas antes de dar error
- Llamar `handleAuthorSuggestion()` si se encuentran autores
- Si hay resultados por título y existe autor match (faceta), enviar mensaje separado con CTA a modo autor

---

### Cambio 8: Agregar callback `activate_author_*` (línea ~1122)

**Archivo**: `index.js`, sección `bot.on('callback_query')`

**Agregar después de `cancel_author_selection` handler**:

```javascript
} else if (query.data.startsWith('activate_author_')) {
  const authorName = query.data.replace('activate_author_', '');

  logger.info({ chatId, authorName }, '[CALLBACK] Activate author requested');

  const selectedAuthor = { name: authorName, displayName: authorName };

  if (!selectedAuthor?.name) {
    bot.answerCallbackQuery(query.id, { text: 'Autor no encontrado' });
    return;
  }

  const actualBookCount = await getTotalBooksByAuthor(authorName);
  selectedAuthor.bookCount = actualBookCount;

  conversationStates.set(chatId, {
    state: 'AUTHOR_MODE',
    author: selectedAuthor.name,
    displayName: selectedAuthor.displayName,
    timestamp: Date.now()
  });

  bot.answerCallbackQuery(query.id, { text: `✅ ${selectedAuthor.displayName}` });

  bot.sendMessage(chatId,
    `✅ Modo autor activado\n\n` +
    `👤 Autor: ${selectedAuthor.displayName}\n\n` +
    `📚 Tiene ${selectedAuthor.bookCount} libro${selectedAuthor.bookCount > 1 ? 's' : ''} en la biblioteca.\n\n` +
    `Ahora las búsquedas se filtrarán solo por este autor.\n\n` +
    `Envía un título o parte del título para buscar libros de ${selectedAuthor.displayName}.\n\n` +
    `⏰ Este modo expira en 5 minutos de inactividad.\n\n` +
    `Comandos disponibles:\n` +
    `/exit - Salir del modo autor\n` +
    `/author - Cambiar autor`
  );

  logger.info({
    chatId,
    author: selectedAuthor.name,
    displayName: selectedAuthor.displayName
  }, '[CALLBACK] Author mode activated from suggestion');
  return;
```

**Características**:
- Extrae nombre del autor del callback data
- Valida que el autor exista
- Obtiene cuenta real de libros
- Activa modo autor en conversation states
- Envía mensaje de confirmación

---

## 🧪 Tests

Crear archivo: `media-arr-books/books-bot-image/test-smart-search.test.js`

```javascript
describe('searchWithStrategies', () => {
  test('should try title search first', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({ hits: [{ title: 'Test Book' }], totalHits: 1 });

    const result = await searchWithStrategies('test query', 5);

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.strategy).toBe('title');
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  test('should fallback to combined search when title returns 0', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [{ title: 'Test Book' }], totalHits: 1 });

    const result = await searchWithStrategies('test query', 5);

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.strategy).toBe('combined');
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  test('should parse multi-word query and try author+title', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({
        hits: [{ title: 'Foundation' }],
        totalHits: 1
      });

    const result = await searchWithStrategies('asimov foundation', 5);

    expect(result.strategy).toBe('author_plus_title');
    expect(mockSearch).toHaveBeenNthCalledWith(3,
      expect.anything(),
      expect.anything(),
      { author: 'asimov' },
      expect.anything(),
      expect.anything(),
      false
    );
  });

  test('should return empty result when all strategies fail', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValue({ hits: [], totalHits: 0 });

    const result = await searchWithStrategies('nonexistent query', 5);

    expect(result.hits).toEqual([]);
    expect(result.strategy).toBe('none');
    expect(mockSearch).toHaveBeenCalledTimes(3);
  });

  test('should log each strategy attempt', async () => {
    const mockLogger = { info: jest.fn() };
    const mockSearch = jest.fn()
      .mockResolvedValue({ hits: [{ title: 'Book' }], totalHits: 1 });

    await searchWithStrategies('test', 5);

    expect(mockLogger.info).toHaveBeenCalled();
  });
});

describe('buildAuthorPreviewMessage', () => {
  test('should format message with 5 preview books', () => {
    const author = { displayName: 'Isaac Asimov', name: 'isaac asimov' };
    const previewBooks = [
      { title: 'Foundation', published: '1951' },
      { title: 'I, Robot', published: '1950' }
    ];

    const message = buildAuthorPreviewMessage(author, previewBooks, 120, 'asimov');

    expect(message).toContain('No encontré libros con el título "asimov"');
    expect(message).toContain('Isaac Asimov');
    expect(message).toContain('120 libros');
    expect(message).toContain('Foundation (1951)');
    expect(message).toContain('I, Robot (1950)');
    expect(message).toContain('Y 115 más libros');
  });

  test('should format message when total is exactly 5', () => {
    const author = { displayName: 'Author', name: 'author' };
    const previewBooks = Array(5).fill({ title: 'Book', published: '2020' });

    const message = buildAuthorPreviewMessage(author, previewBooks, 5, 'author');

    expect(message).toContain('Todos sus libros');
    expect(message).not.toContain('más');
  });

  test('should handle books without publication year', () => {
    const author = { displayName: 'Author', name: 'author' };
    const previewBooks = [{ title: 'Book', published: null }];

    const message = buildAuthorPreviewMessage(author, previewBooks, 5, 'author');

    expect(message).toContain('Book');
    expect(message).toContain('1. Book');
  });

  test('should truncate long author names', () => {
    const longName = 'Very Long Author Name That Exceeds Normal Length';
    const author = { displayName: longName, name: 'very long author name' };
    const previewBooks = [{ title: 'Book', published: '2020' }];

    const message = buildAuthorPreviewMessage(author, previewBooks, 5, 'author');

    expect(message).toContain(longName);
  });
});

describe('Author suggestion flow', () => {
  let mockBot, mockClient;

  beforeEach(() => {
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({})
    };
    mockClient = {
      index: jest.fn().mockReturnValue({
        search: jest.fn()
      })
    };
  });

  test('should show preview when 1 author found', async () => {
    const facetMap = { 'Isaac Asimov': 2 };
    const uniqueAuthors = extractAuthorsFromFacets(facetMap);

    mockClient.index().search.mockResolvedValueOnce({
      hits: authorResults,
      totalHits: 2
    });

    await handleAuthorSuggestion(mockBot, 'chat123', 'user123', 'asimov', uniqueAuthors);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('Primeros 5 libros'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Sí, buscar libros de Isaac Asimov')
              })
            ])
          ])
        })
      })
    );
  });

  test('should show selection when 2-5 authors found', async () => {
    const uniqueAuthors = [
      { displayName: 'Isaac Asimov', name: 'isaac asimov', bookCount: 120 },
      { displayName: 'Robert Asimov', name: 'robert asimov', bookCount: 3 }
    ];

    await handleAuthorSuggestion(mockBot, 'chat123', 'user123', 'asimov', uniqueAuthors);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('Encontré 2 autores'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [{ text: '1. Isaac Asimov', callback_data: 'activate_author_isaac asimov' }],
            [{ text: '2. Robert Asimov', callback_data: 'activate_author_robert asimov' }]
          ])
        })
      })
    );
  });

  test('should show refinement message when >5 authors found', async () => {
    const uniqueAuthors = Array(6).fill({
      displayName: 'Author',
      name: 'author',
      bookCount: 1
    });

    await handleAuthorSuggestion(mockBot, 'chat123', 'user123', 'smith', uniqueAuthors);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('Encontré muchos autores')
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('Usa /author smith [apellido]')
    );
  });

  test('should maintain original message when 0 authors found', async () => {
    await handleAuthorSuggestion(mockBot, 'chat123', 'user123', 'xyz', []);

    expect(mockBot.sendMessage).not.toHaveBeenCalled();
  });
});

describe('author CTA when title has results', () => {
  test('should send CTA when title results exist and 1 author facet match', async () => {
    const mockBot = { sendMessage: jest.fn().mockResolvedValue({}) };
    const facetMap = { 'Isaac Asimov': 120 };
    const uniqueAuthors = extractAuthorsFromFacets(facetMap);

    await sendAuthorCtaAfterTitleResults(mockBot, 'chat123', uniqueAuthors);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('¿Quieres pasar a modo autor?'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array)
        })
      })
    );
  });
});

describe('activate_author callback', () => {
  let mockBot, mockQuery;

  beforeEach(() => {
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({})
    };
    mockQuery = {
      data: 'activate_author_isaac asimov',
      id: 'query123'
    };
  });

  test('should activate author mode when button clicked', async () => {
    await handleActivateAuthorCallback(mockBot, mockQuery, 'chat123', 'user123');

    expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('query123', {
      text: '✅ Isaac Asimov'
    });
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'chat123',
      expect.stringContaining('Modo autor activado')
    );
    expect(conversationStates.has('chat123')).toBe(true);
  });

  test('should handle non-existent author', async () => {
    const mockQuery = {
      data: 'activate_author_nonexistent',
      id: 'query123'
    };

    await handleActivateAuthorCallback(mockBot, mockQuery, [], 'chat123', 'user123');

    expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('query123', {
      text: 'Autor no encontrado'
    });
    expect(conversationStates.has('chat123')).toBe(false);
  });

  test('should get actual book count from getTotalBooksByAuthor', async () => {
    await handleActivateAuthorCallback(mockBot, mockQuery, 'chat123', 'user123');

    expect(getTotalBooksByAuthor).toHaveBeenCalledWith('isaac asimov');
  });
});

describe('Combined search integration', () => {
  test('should handle "asimov foundation" query correctly', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({
        hits: [
          { title: 'Foundation', authors: ['Isaac Asimov'] },
          { title: 'Foundation and Empire', authors: ['Isaac Asimov'] }
        ],
        totalHits: 2
      });

    const result = await searchWithStrategies('asimov foundation', 5);

    expect(result.strategy).toBe('author_plus_title');
    expect(result.hits.length).toBe(2);
    expect(result.hits[0].authors).toContain('Isaac Asimov');
    expect(result.hits[0].title).toContain('Foundation');
  });

  test('should handle short queries (single word)', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({
        hits: [{ title: 'Foundation' }],
        totalHits: 1
      });

    const result = await searchWithStrategies('foundation', 5);

    expect(result.strategy).toBe('title');
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  test('should handle queries with special characters', async () => {
    const mockSearch = jest.fn()
      .mockResolvedValueOnce({ hits: [], totalHits: 0 })
      .mockResolvedValueOnce({
        hits: [{ title: 'Test' }],
        totalHits: 1
      });

    const result = await searchWithStrategies('test & special', 5);

    expect(result.strategy).toBe('combined');
  });
});
```

---

## 📊 Resumen de Cambios

| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `index.js` | 364-393 | Modificar `searchMeilisearch()` - agregar parámetro `searchIn` |
| `index.js` | 394+ (nuevo) | Agregar `searchWithStrategies()` |
| `index.js` | (nuevo) | Agregar `searchAuthorFacets()` + `extractAuthorsFromFacets()` |
| `index.js` | (nuevo) | Agregar `buildAuthorPreviewMessage()` |
| `index.js` | (nuevo) | Agregar `sendAuthorCtaAfterTitleResults()` |
| `index.js` | (nuevo) | Agregar `handleAuthorSuggestion()` (usa facetas) |
| `index.js` | 860-918 | Modificar búsqueda normal - usar `searchWithStrategies()` |
| `index.js` | ~1122 (nuevo) | Agregar callback `activate_author_*` |
| `test-smart-search.test.js` | (nuevo) | Suite completa de tests |

---

## ✅ Criterios de Éxito

1. ✅ **Búsqueda Combinada**: "asimov foundation" encuentra libros de Asimov con "Foundation" en el título
2. ✅ **Smart Detection**: Buscar "asimov" sin resultados de título → muestra preview de 5 libros + aviso
3. ✅ **Preview Muestra**: Los 5 primeros libros del autor aparecen en el mensaje
4. ✅ **Aviso de Más**: Si el autor tiene >5 libros, muestra "Y X más libros"
5. ✅ **Activación**: Al aceptar, modo autor se activa correctamente
6. ✅ **Múltiples Autores**: Si hay 2-5 autores, muestra lista para seleccionar
7. ✅ **Refinamiento**: Si hay >5 autores, sugiere refinar búsqueda
8. ✅ **Tests Pasan**: Todos los tests nuevos pasan
9. ✅ **Backward Compatibility**: El comando `/author` sigue funcionando igual
10. ✅ **Logging Detallado**: Cada estrategia se loggea con sus resultados

---

## 🚀 Implementación Paso a Paso

### Paso 1: Preparación
1. Hacer backup de `index.js`
2. Crear archivo de tests `test-smart-search.test.js`

### Paso 2: Modificar funciones existentes
1. Modificar `searchMeilisearch()` para aceptar `searchIn`
2. Modificar búsqueda normal para usar `searchWithStrategies()`

### Paso 3: Agregar nuevas funciones
1. Agregar `searchWithStrategies()`
2. Agregar `searchAuthorFacets()` + `extractAuthorsFromFacets()`
3. Agregar `buildAuthorPreviewMessage()`
4. Agregar `sendAuthorCtaAfterTitleResults()`
5. Agregar `handleAuthorSuggestion()` (usa facetas)
6. Agregar callback `activate_author_*`

### Paso 4: Tests
1. Implementar tests en `test-smart-search.test.js`
2. Ejecutar tests y corregir errores

### Paso 5: Validación
1. Probar búsqueda combinada: "asimov foundation"
2. Probar smart detection: "asimov"
3. Probar múltiples autores: "smith"
4. Probar backward compatibility: `/author isaac asimov`

### Paso 6: Deployment
1. Build nueva imagen Docker
2. Push a Harbor
3. Deploy en Kubernetes

---

## 🐛 Consideraciones y Edge Cases

### Edge Cases Identificados

1. **Búsquedas con palabras cortas** ("el", "la", "de")
   - Solución: Posiblemente agregar filtro mínimo de longitud (3 caracteres)
   - O: Dejar que el flujo natural maneje (si hay muchos autores → pedir refinamiento)

2. **Autores con nombres duplicados en diferentes formatos**
   - Ej: "isaac asimov" vs "Isaac Asimov"
   - Solución: Usar `normalizeAuthor()` para deduplicar

3. **Búsquedas con caracteres especiales** ("&", "-", "+")
   - Solución: MeiliSearch maneja esto bien, pero testear

4. **Preview de libros que supera el límite de 4096 caracteres de Telegram**
   - Solución: Ya tenemos límite de 5 libros en preview, debería estar bien

5. **Timeout de búsqueda combinada**
   - Solución: Las búsquedas se ejecutan en serie; el timeout es manejado por MeiliSearch

---

## 📝 Preguntas de Validación Pendientes

1. **¿El límite de 5 autores para la sugerencia está bien?**
   - O prefieres 3 para que sea más directo?

2. **¿Qué pasa si el usuario busca palabras cortas como "el" o "la"?**
   - Probablemente muchos autores coincidirían. ¿Deberíamos agregar un filtro mínimo de longitud?

3. **¿El mensaje de preview debería incluir los botones de descarga/info de los 5 libros mostrados?**
   - O solo mostrar los títulos en texto simple?

4. **¿Quieres que logging sea más detallado para debugging?**
   - Ej: mostrar cada estrategia probada con sus resultados

---

## 📚 Referencias

- **Documentación actual**: `README_DOCKER.md` (v2.2.0)
- **Tests existentes**: `pagination.test.js` (28 tests), `search-pagination-integration.test.js`
- **Comando `/author`**: Líneas 607-688 en `index.js`
- **Callback `select_author_*`**: Líneas 1081-1118 en `index.js`

---

## 🎯 Próximos Pasos

1. ✅ Plan detallado creado
2. ⏳ Revisión y aprobación del plan
3. ⏳ Implementación de cambios en `index.js`
4. ⏳ Implementación de tests en `test-smart-search.test.js`
5. ⏳ Ejecución de tests
6. ⏳ Validación manual
7. ⏳ Build y deployment

---

**Estado del Plan**: ✅ Completado y listo para revisión
