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
    console.log(`[smartSearch] USING AUTHOR FILTER: ${filters.author}`);
    return {
      results: await searchMeilisearch(query, limit, filters),
      searchType: 'FILTERED'
    };
  }
  
  const authorResults = await searchByAuthors(query, limit);
  
  if (authorResults.length > 0) {
    console.log(`[smartSearch] AUTHOR SEARCH SUCCESSFUL`);
    return {
      results: authorResults,
      searchType: 'AUTHOR'
    };
  }
  
  console.log(`[smartSearch] GENERAL SEARCH`);
  const generalResults = await searchMeilisearch(query, limit, null);
  
  return {
    results: generalResults,
    searchType: 'GENERAL'
  };
};

// TEST 1: Primera búsqueda - Sin estado de conversación
console.log('\n=== TEST 1: Primera búsqueda "terry pratchett" (sin estado) ===');
smartSearch("terry pratchett", 5, null)
  .then(result => console.log('Result:', result.searchType))
  .catch(err => console.error('Error:', err));

// TEST 2: Segunda búsqueda - DEBERÍA tener estado con author filter
console.log('\n=== TEST 2: Segunda búsqueda "mundo" (CON estado de autor) ===');
// ESTO ES LO QUE ESTÁ PASANDO AHORA:
smartSearch("mundo", 10, null)  // ← filters = null, ¡PERO DEBERÍA SER { author: "terry pratchett" }!
  .then(result => console.log('Result:', result.searchType))
  .catch(err => console.error('Error:', err));

// TEST 3: LO QUE DEBERÍA PASAR:
console.log('\n=== TEST 3: LO QUE DEBERÍA PASAR (con filtro de autor) ===');
smartSearch("mundo", 10, { author: "terry pratchett" })  // ← CON filtro de autor!
  .then(result => console.log('Result:', result.searchType))
  .catch(err => console.error('Error:', err));

setTimeout(() => {
  console.log('\n=== ANÁLISIS DEL PROBLEMA ===');
  console.log('TEST 2 está usando filters=null, pero debería usar filters={author:"terry pratchett"}');
}, 100);
