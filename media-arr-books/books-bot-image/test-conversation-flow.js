// Simulación del flujo de búsqueda del bot

const conversationStates = new Map();

const clearConversationState = (chatId) => {
  if (conversationStates.has(chatId)) {
    conversationStates.delete(chatId);
    console.log(`[clearConversationState] Estado borrado para chatId=${chatId}`);
  }
};

const searchMeilisearch = async (query, limit = 5, filters = null) => {
  console.log(`[searchMeilisearch] query="${query}", limit=${limit}, filters=${JSON.stringify(filters)}`);
  return [];
};

const searchByAuthors = async (query, limit = 5) => {
  console.log(`[searchByAuthors] query="${query}", limit=${limit}`);
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
    console.log(`[smartSearch] BÚSQUEDA DE AUTOR EXITOSA`);
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

// Simulación del handler de mensajes
const handleMessage = async (chatId, text) => {
  console.log(`\n\n[handleMessage] chatId=${chatId}, text="${text}"`);
  
  // BLOQUE 1: Revisar si hay estado de conversación
  if (conversationStates.has(chatId)) {
    const state = conversationStates.get(chatId);
    console.log(`[handleMessage] HAY ESTADO DE CONVERSACIÓN: ${JSON.stringify(state)}`);
    
    if (state.state === 'WAITING_FOR_BOOK_FILTER') {
      console.log(`[handleMessage] Filtrando por autor: ${state.author}`);
      
      const filteredResults = await searchMeilisearch(text, 10, { author: state.author });
      console.log(`[handleMessage] Resultados filtrados: ${filteredResults.length}`);
      
      if (filteredResults.length === 0) {
        console.log(`[handleMessage] NO HAY RESULTADOS - NO se borra estado`);
        return;
      }
      
      if (filteredResults.length > 5) {
        console.log(`[handleMessage] MÁS DE 5 RESULTADOS - NO se borra estado`);
        return;
      }
      
      console.log(`[handleMessage] MENOS O IGUAL A 5 RESULTADOS - SE BORRA ESTADO`);
      conversationStates.delete(chatId);
      return;
    }
  }
  
  console.log(`[handleMessage] NO HAY ESTADO DE CONVERSACIÓN (o no es WAITING)`);
  
  // BLOQUE 2: Búsqueda normal
  try {
    console.log(`[handleMessage] Buscando con smartSearch`);
    const searchResult = await smartSearch(text);
    const results = searchResult.results;
    
    if (results.length === 0) {
      console.log(`[handleMessage] NO HAY RESULTADOS - BORRANDO ESTADO`);
      clearConversationState(chatId);
      return;
    }
    
    if (searchResult.searchType === 'AUTHOR') {
      console.log(`[handleMessage] BÚSQUEDA DE AUTOR DETECTADA - CREANDO ESTADO`);
      conversationStates.set(chatId, {
        state: 'WAITING_FOR_BOOK_FILTER',
        author: 'terry pratchett',
        originalQuery: text,
        timestamp: Date.now()
      });
      console.log(`[handleMessage] ESTADO CREADO: ${JSON.stringify(conversationStates.get(chatId))}`);
      return;
    }
    
    console.log(`[handleMessage] BÚSQUEDA GENERAL - MOSTRANDO RESULTADOS`);
  } catch (err) {
    console.error(`[handleMessage] ERROR: ${err}`);
  }
};

// TEST 1: Primera búsqueda
handleMessage(145368254, "terry pratchett")
  .then(() => {
    console.log('\n\n=== ESTADO DESPUÉS DE PRIMERA BÚSQUEDA ===');
    console.log('conversationStates:', JSON.stringify([...conversationStates.entries()]));
    
    // TEST 2: Segunda búsqueda con filtro
    return handleMessage(145368254, "mundo");
  })
  .then(() => {
    console.log('\n\n=== ESTADO DESPUÉS DE SEGUNDA BÚSQUEDA ===');
    console.log('conversationStates:', JSON.stringify([...conversationStates.entries()]));
  });
