# Plan: Author Browse Mode (paginación sin título)

Fecha: 2026-01-26  
Servicio: `media-arr-books/books-bot-image`

## Objetivo
Cuando el usuario entra en **modo autor**, ofrecer una opción explícita para **navegar/paginar todos los libros de ese autor**, aun sin conocer el título.

## Flujo Deseado

### Entrada al modo autor
Al activar modo autor (por `/author` o CTA):
1) Se muestra mensaje actual de confirmación.
2) Se agrega botón: **“📚 Navegar libros de este autor”**.

### Navegar autor (browse)
Si el usuario toca el botón:
1) Se ejecuta búsqueda **sin query** pero con filtro de autor.
2) Se muestra página 1 con 5 títulos (formato paginado existente).
3) Se activa `PAGINATION_MODE` con:
   - `searchType: 'AUTHOR_BROWSE'`
   - `filters: { author: selectedAuthor }`
   - `searchQuery: ''` (vacío)
   - `searchIn: ['title']`
   - `useExactPhrase: false`
4) El usuario navega con botones `page_prev` / `page_next`.

### Salida
`/exit` funciona como hoy y sale del modo de paginación/autor.

## Cambios de Código

### 1) Nuevo callback: `browse_author_*`
**Archivo:** `media-arr-books/books-bot-image/index.js`

- Agregar handler en `bot.on('callback_query')`:
  - Extraer autor del callback.
  - Buscar con `searchMeilisearch('', 5, { author })`.
  - Si no hay resultados, mensaje de “no hay libros”.
  - Si hay resultados, activar paginación y mostrar página 1.

### 2) CTA en activación de modo autor
**Archivo:** `media-arr-books/books-bot-image/index.js`

Agregar botón en los mensajes de activación de modo autor:
- En `/author` (autor único).
- En CTA `activate_author_*`.

Botón:
```
📚 Navegar libros de este autor
callback_data: browse_author_<authorName>
```

### 3) Reutilizar paginación existente
No se crean nuevos botones ni estados; se reutiliza:
- `buildPaginatedMessage()`
- `buildInlineKeyboard()` (incluye paginación)
- callbacks `page_prev` / `page_next`

## Tests

### Unitarios (mocks)
Crear `author-browse.test.js`:
- `browse_author_*` activa paginación con `searchQuery: ''`.
- Maneja caso sin resultados.
- Verifica que el mensaje paginado se envía.

### Integración (Meili real)
Agregar en `smart-search-integration.test.js`:
- Buscar autor conocido con `searchMeilisearch('', 5, { author: 'Isaac Asimov' })`.
- Confirmar que devuelve resultados y `totalHits > 5`.

## Criterios de Éxito
1) Al activar modo autor, aparece botón “Navegar libros de este autor”.
2) El botón muestra página 1 con títulos del autor.
3) Paginación funciona igual que búsquedas normales.
4) `/exit` sale del modo de navegación.

## Implementación Paso a Paso
1) Agregar callback `browse_author_*`.
2) Insertar CTA en mensajes de activación de modo autor.
3) Escribir tests unitarios.
4) (Opcional) integrar test real con Meili.
5) Validación manual: entrar modo autor → navegar → paginar → salir.
