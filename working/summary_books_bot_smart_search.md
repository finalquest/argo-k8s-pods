# Smart Search + Author Facets (Books Bot) — Resumen

Fecha: 2026-01-26  
Servicio: `media-arr-books/books-bot-image`

## Objetivo
Mejorar la búsqueda del bot para:
- Detectar autores automáticamente con facetas.
- Manejar consultas combinadas (título + autor).
- Mostrar CTA para activar modo autor sin romper el flujo actual.
- Mantener paginación coherente con la estrategia de búsqueda.

## Flujo Final (Comportamiento)
**Caso A: Título > 0 resultados**  
- Se muestran 5 resultados por título (como hoy).  
- Si hay un autor único detectado por facetas, se envía **mensaje separado** con CTA: “¿Quieres pasar a modo autor?”.

**Caso B: Título = 0 y autor único**  
- Se muestran los 5 primeros libros del autor.  
- Se indica cuántos libros más hay.  
- CTA para activar modo autor.

**Caso C: Título = 0 y 2–5 autores**  
- Se muestran autores con botones para elegir.

**Caso D: Título = 0 y >5 autores**  
- Mensaje pidiendo refinar la búsqueda con `/author`.

**Caso E: Título = 0 y 0 autores**  
- Mensaje de “no encontré resultados”.

## Cambios de Código
Archivo principal: `media-arr-books/books-bot-image/index.js`

### Nuevo flujo de búsqueda
- `searchWithStrategies()`  
  Estrategias en cascada:
  1) Título exacto (con comillas)  
  2) Título + autor (sin comillas)  
  3) Autor + título (filtro de autor + query del resto)

- El estado de paginación ahora guarda:
  - `searchQuery`, `filters`, `searchIn`, `useExactPhrase`  
  Para mantener la misma estrategia en páginas siguientes.

### Facetas de autor
- `searchAuthorFacets()` usa facetas de MeiliSearch (`facets: ['authors']`).
- `extractAuthorsFromFacets()` filtra por substring normalizado y ordena por cantidad.

### CTA modo autor
- `sendAuthorCtaAfterTitleResults()` envía CTA separado cuando hay resultados por título y autor único.

### Modo autor desde CTA
- Nuevo callback `activate_author_*` activa modo autor con confirmación explícita.

### Seguridad de filtros
- `escapeFilterValue()` para evitar romper filtros en MeiliSearch con comillas.

### Tests
Nuevos tests agregados:
- `media-arr-books/books-bot-image/smart-search.test.js` (unitarios con mocks)
- `media-arr-books/books-bot-image/smart-search-integration.test.js` (Meili real)

Tests ejecutados:
- `npm test` en `media-arr-books/books-bot-image` → **OK**

## Deploy
Imagen construida y publicada:
- `harbor.finalq.xyz/tools/books-bot:v2.2.3`
- `harbor.finalq.xyz/tools/books-bot:latest`

Manifest actualizado:
- `media-arr-books/deployment-books-bot.yaml`  
  `image: harbor.finalq.xyz/tools/books-bot:v2.2.3`

## Notas Importantes
- MeiliSearch acepta `attributesToSearchOn` (no `restrictSearchableAttributes`).
- La detección de autor usa facetas + filtro substring normalizado (ej. “asimov” → “Isaac Asimov”).
- El port-forward de Meili se cerró luego de validar.
