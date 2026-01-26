# Tests Unitarios: Paginación para Books Bot

## Resumen

Tests unitarios automatizados para validar la funcionalidad de paginación del bot de Telegram para la Biblioteca Secreta.

## Cobertura

- **Total de tests:** 28
- **Suites:** 7
- **Estado:** ✅ Todos los tests pasando

## Suites de Tests

### 1. buildPaginationKeyboard (6 tests)
Valida la generación de botones de navegación (Anterior/Siguiente).

Tests:
- ✓ should show only "Next" button on first page
- ✓ should show only "Previous" button on last page
- ✓ should show both buttons on middle pages
- ✓ should return empty array when no navigation needed
- ✓ should handle single page scenario
- ✓ should handle many pages scenario on first page

### 2. buildPaginatedMessage (7 tests)
Valida el formato de mensajes paginados.

Tests:
- ✓ should format message for normal search on first page
- ✓ should format message for normal search on second page
- ✓ should format message for author search
- ✓ should show global index numbers on subsequent pages
- ✓ should handle empty results
- ✓ should handle single result
- ✓ should handle exact page boundary (5 results)
- ✓ should handle just over page boundary (6 results)

### 3. Pagination state management (3 tests)
Valida el manejo del estado de paginación.

Tests:
- ✓ should calculate correct total pages for various result counts
- ✓ should track current page correctly
- ✓ should validate page boundaries

### 4. Pagination edge cases (4 tests)
Valida casos extremos de paginación.

Tests:
- ✓ should handle very large result sets
- ✓ should handle query with special characters
- ✓ should handle very long book titles in global index calculation
- ✓ should handle author display name truncation

### 5. Pagination activation logic (3 tests)
Valida la lógica de activación de paginación.

Tests:
- ✓ should activate pagination when results >5
- ✓ should NOT activate pagination when results <=5
- ✓ should activate pagination for exactly 6 results (boundary)

### 6. Navigation button visibility (4 tests)
Valida la visibilidad correcta de botones de navegación.

Tests:
- ✓ should show "Next" button on all pages except last
- ✓ should show "Previous" button on all pages except first
- ✓ should show both buttons on middle pages
- ✓ should show no buttons for single page

## Ejecución

### Ejecutar todos los tests
```bash
npm test
```

### Ejecutar solo tests de paginación
```bash
npm test pagination.test.js
```

### Ejecutar tests en modo watch (development)
```bash
npm run test:watch
```

### Ejecutar tests con cobertura de código
```bash
npm run test:coverage
```

## Funciones Testeadas

### buildPaginationKeyboard(currentPage, totalPages, isLastPage)
Genera los botones de navegación para paginación.

**Parámetros:**
- `currentPage`: Número de página actual (0-indexado)
- `totalPages`: Número total de páginas
- `isLastPage`: Booleano indicando si es la última página

**Retorna:** Array con botones de navegación

### buildPaginatedMessage(query, results, currentPage, totalResults, searchType, displayName)
Construye el mensaje de paginación con formato minimalista.

**Parámetros:**
- `query`: Término de búsqueda
- `results`: Array de resultados de la página actual
- `currentPage`: Número de página actual (0-indexado)
- `totalResults`: Número total de resultados
- `searchType`: 'NORMAL' o 'AUTHOR'
- `displayName`: Nombre del autor (opcional, para modo autor)

**Retorna:** String con el mensaje formateado

## Resultados Esperados

### Formato de Mensaje Normal
```
📚 Página 1/2 (10 resultados)
🔍 Buscando: "historia"

1. Book Title 1
2. Book Title 2
3. Book Title 3
4. Book Title 4
5. Book Title 5
```

### Formato de Mensaje Modo Autor
```
👤 Modo autor: Terry Pratchett
📚 Página 1/3 (15 resultados)
🔍 Buscando: "fundación"

1. Book Title 1
2. Book Title 2
3. Book Title 3
4. Book Title 4
5. Book Title 5
```

### Botones de Navegación

Primera página:
```
[Siguiente ➡️]
```

Páginas intermedias:
```
[⬅️ Anterior] [Siguiente ➡️]
```

Última página:
```
[⬅️ Anterior]
```

Una sola página:
```
(sin botones de navegación)
```

## Archivos

- `pagination.test.js` - Archivo principal de tests
- `jest.config.js` - Configuración de Jest
- `package.json` - Scripts de ejecución

## Notas

- Los tests son unitarios y no requieren conexión a MeiliSearch real
- Los tests usan mocks y stubs para simular comportamiento
- Los tests validan lógica de negocio, no integración con servicios externos
- Los archivos de testing manual (`test-search-manual.js`, etc.) no son detectados por Jest

## Mantenimiento

Para agregar nuevos tests:
1. Agregar el caso de prueba en el `describe` apropiado
2. Ejecutar `npm test` para validar
3. Asegurar que el nuevo test pase
4. Actualizar este README con la descripción del test

## Referencias

- [Documentación de Jest](https://jestjs.io/docs/getting-started)
- [Documentación de Telegram Bot API](https://core.telegram.org/bots/api)
- [Plan de implementación de paginación](../working/plan_books_bot_pagination.md)
