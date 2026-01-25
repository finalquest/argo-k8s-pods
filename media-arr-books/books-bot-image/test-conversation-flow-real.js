// Simulación REAL del flujo del bot con resultados ficticios

const conversationStates = new Map();

const clearConversationState = (chatId) => {
  if (conversationStates.has(chatId)) {
    conversationStates.delete(chatId);
    console.log(`[clearConversationState] Estado borrado para chatId=${chatId}`);
  }
};

const searchMeilisearch = async (query, limit = 5, filters = null) => {
  console.log(`[searchMeilisearch] query="${query}", limit=${limit}, filters=${JSON.stringify(filters)}`);
  
  // Simular resultados de Terry Pratchett cuando busca "terry pratchett"
  if (query === 'terry pratchett' && !filters) {
    return [
      { title: 'Mundodisco', authors: ['Terry Pratchett'] },
      { title: 'La luz fantástica', authors: ['Terry Pratchett'] },
      { title: 'Brujería accidental', authors: ['Terry Pratchett'] },
      { title: 'Muerte', authors: ['Terry Pratchett'] },
      { title: 'Mort', authors: ['Terry Pratchett'] }
    ];
  }
  
  // Simular resultados de Terry Pratchett filtrados por "mundo"
  if (query === 'mundo' && filters && filters.author === 'terry pratchett') {
    return [
      { title: 'Mundodisco', authors: ['Terry Pratchett'] },
      { title: 'Hogfather', authors: ['Terry Pratchett'] }
    ];
  }
  
  // Simular resultados de "mundo" en autores generales
  if (query === 'mundo' && !filters) {
    return [
      { title: 'La leyenda de Snowman', authors: ['Mendi Mundo'] }
    ];
  }
  
  return [];
};

const searchByAuthors = async (query, limit = 5) => {
  console.log(`[searchByAuthors] query="${query}", limit=${limit}`);
  
  if (query === 'terry pratchett') {
    return [
      { title: 'Mundodisco', authors: ['Terry Pratchett'] },
      { title: 'La luz fantástica', authors: ['Terry Pratchett'] },
      { title: 'Brujería accidental', authors: ['Terry Pratchett'] },
      { title: 'Muerte', authors: ['Terry Pratchett'] },
      { title: 'Mort', authors: ['Terry Pratchett'] }
    ];
  }
  
  if (query === 'mundo') {
    return [
      { title: 'La leyenda de Snowman', authors: ['Mendi Mundo'] }
    ];
  }
  
  return [];
};

const smartSearch = async (query, limit = 5, filters = null) => {
  console.log(`[smartSearch] query="${query}", limit=${limit}, filters=${JSON.stringify(filters)}`);
  
  if (filters && filters.author) {
    console.log(`[smartSearch] USANDO FILTRO DE AUTOR: ${filters.author}`);
    return {
      results: await searchMeilisearch(query, limit, filters),
      searchType: 'FILTERED'
    };
  }
  
  const authorResults = await searchByAuthors(query, limit);
  
  if (authorResults.length > 0) {
    console.log(`[smartSearch] BÚSQUEDA DE AUTOR EXITOSA: ${authorResults.length} resultados`);
    return {
      results: authorResults,
      searchType: 'AUTHOR'
    };
  }
  
  console.log(`[smartSearch] BÚSQUEDA GENERAL`);
  const generalResults = await searchMeilisearch(query, limit, null);
  
  return {
    results: generalResults,
    searchType: 'GENERAL'
  };
};

const normalizeAuthor = (authors) => {
  if (!authors) return '';
  let authorStr = '';
  
  if (Array.isArray(authors)) {
    authorStr = authors[0];
  } else {
    authorStr = authors;
  }
  
  return authorStr.toLowerCase().trim();
};

const detectAuthorSearch = (results, originalQuery) => {
  if (results.length < 3) return null;
  
  const authors = results.map(r => normalizeAuthor(r.authors));
  const authorCount = {};
  
  authors.forEach(author => {
    authorCount[author] = (authorCount[author] || 0) + 1;
  });
  
  const sortedAuthors = Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1]);
  
  const [dominantAuthor, count] = sortedAuthors[0];
  const percentage = (count / results.length) * 100;
  
  if (percentage >= 80) {
    return {
      isAuthorSearch: true,
      author: dominantAuthor,
      originalQuery
    };
  }
  
  return null;
};

const handleMessage = async (chatId, text) => {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`[handleMessage] chatId=${chatId}, text="${text}"`);
  console.log(`[handleMessage] Estado actual:`, conversationStates.has(chatId) ? JSON.stringify(conversationStates.get(chatId)) : 'NINGUNO');
  console.log(`${'='.repeat(80)}`);
  
  if (conversationStates.has(chatId)) {
    const state = conversationStates.get(chatId);
    console.log(`\n[handleMessage] ✅ HAY ESTADO DE CONVERSACIÓN`);
    console.log(`[handleMessage] state: ${state.state}`);
    console.log(`[handleMessage] author: ${state.author}`);
    
    if (state.state === 'WAITING_FOR_BOOK_FILTER') {
      console.log(`\n[handleMessage] ✅ ESTADO ES 'WAITING_FOR_BOOK_FILTER'`);
      console.log(`[handleMessage] Filtrando por autor: ${state.author} con query: "${text}"`);
      
      const filteredResults = await searchMeilisearch(text, 10, { author: state.author });
      console.log(`[handleMessage] Resultados filtrados: ${filteredResults.length}`);
      
      if (filteredResults.length === 0) {
        console.log(`[handleMessage] ❌ NO HAY RESULTADOS`);
        return;
      }
      
      if (filteredResults.length > 5) {
        console.log(`[handleMessage] ❌ MÁS DE 5 RESULTADOS`);
        return;
      }
      
      console.log(`[handleMessage] ✅ MENOS O IGUAL A 5 RESULTADOS - BORRANDO ESTADO`);
      conversationStates.delete(chatId);
      console.log(`[handleMessage] Resultado: ${filteredResults.length} libros encontrados`);
      return;
    } else {
      console.log(`\n[handleMessage] ❌ ESTADO NO ES 'WAITING_FOR_BOOK_FILTER'`);
    }
  } else {
    console.log(`\n[handleMessage] ❌ NO HAY ESTADO DE CONVERSACIÓN`);
  }
  
  console.log(`\n[handleMessage] Buscando con smartSearch("${text}")`);
  const searchResult = await smartSearch(text);
  const results = searchResult.results;
  
  console.log(`[handleMessage] smartSearch devolvió: ${results.length} resultados, type=${searchResult.searchType}`);
  
  if (results.length === 0) {
    console.log(`[handleMessage] ❌ NO HAY RESULTADOS - BORRANDO ESTADO`);
    clearConversationState(chatId);
    return;
  }
  
  if (searchResult.searchType === 'AUTHOR') {
    console.log(`\n[handleMessage] ✅ searchType es 'AUTHOR'`);
    const authorDetection = detectAuthorSearch(results, text);
    console.log(`[handleMessage] detectAuthorSearch: ${authorDetection ? 'DETECTADO' : 'NO DETECTADO'}`);
    
    if (authorDetection) {
      console.log(`[handleMessage] ✅ Autor detectado, CREANDO ESTADO`);
      conversationStates.set(chatId, {
        state: 'WAITING_FOR_BOOK_FILTER',
        author: authorDetection.author,
        originalQuery: text,
        timestamp: Date.now()
      });
      console.log(`[handleMessage] Estado creado:`, JSON.stringify(conversationStates.get(chatId)));
      return;
    }
  }
  
  console.log(`\n[handleMessage] Mostrando ${results.length} resultados generales`);
};

// ESCENARIO REAL DEL USUARIO
console.log('\n\n' + '='.repeat(80));
console.log('ESCENARIO REAL DEL USUARIO');
console.log('='.repeat(80));

handleMessage(145368254, "terry pratchett")
  .then(() => {
    console.log('\n\n' + '='.repeat(80));
    console.log('ESTADO DESPUÉS DE "terry pratchett"');
    console.log('='.repeat(80));
    console.log('conversationStates:', JSON.stringify([...conversationStates.entries()]));
    
    console.log('\n\n' + '='.repeat(80));
    console.log('SEGUNDA BÚSQUEDA: "mundo" (DEBERÍA FILTRAR POR TERRY PRATCHETT)');
    console.log('='.repeat(80));
    
    return handleMessage(145368254, "mundo");
  })
  .then(() => {
    console.log('\n\n' + '='.repeat(80));
    console.log('ESTADO DESPUÉS DE "mundo"');
    console.log('='.repeat(80));
    console.log('conversationStates:', JSON.stringify([...conversationStates.entries()]));
    
    console.log('\n\n' + '='.repeat(80));
    console.log('RESUMEN DEL PROBLEMA');
    console.log('='.repeat(80));
    console.log('✅ La primera búsqueda ("terry pratchett") funcionó');
    console.log('✅ El estado se creó correctamente');
    console.log('❌ La segunda búsqueda ("mundo") NO filtró por Terry Pratchett');
    console.log('❌ En lugar de eso, buscó "mundo" en autores generales');
    console.log('❌ Esto es porque el código va a smartSearch con filters=null');
    console.log('❌ El estado de conversación NO se revisó correctamente');
  });
