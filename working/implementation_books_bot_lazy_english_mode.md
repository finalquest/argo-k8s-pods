# Implementación: Modo “Búsqueda Inglés” con LazyLibrarian (Anna‑Archive)

Fecha: 2026-01-26  
Servicio: `media-arr-books/books-bot-image`

## Objetivo
Agregar un modo `/english` que:
- Busque en LazyLibrarian (provider directo Anna‑Archive).
- Presente resultados paginados como el bot actual.
- Al “descargar”, dispare búsqueda/descarga en Lazy y notifique cuando el EPUB esté listo.
- Entregue el EPUB con los 3 botones actuales (download/info/email).

## Infra requerida
**Montar `/books` en el bot**

Archivo: `media-arr-books/deployment-books-bot.yaml`
- `volumeMounts`:
  - `name: books`
  - `mountPath: /books`
- `volumes`:
  - `name: books`
  - `persistentVolumeClaim: books-nfs`

## API LazyLibrarian confirmada (en vivo)
Se validó con llamadas reales:

### Buscar
```
GET /api?apikey=...&cmd=findBook&name=<query>
```
Devuelve lista de candidatos con `bookid`, `bookname`, `authorname`, etc.

### Consultar estado
```
GET /api?apikey=...&cmd=getAllBooks&id=<bookid>
```
Devuelve estado y paths:
- `Status`: Skipped / Wanted / Snatched
- `BookLibrary`: path final en `/books` (si ya está disponible)

### Poner en Wanted (si estaba Skipped)
```
GET /api?apikey=...&cmd=queueBook&id=<bookid>&type=eBook
```

### Buscar / descargar
```
GET /api?apikey=...&cmd=searchBook&id=<bookid>&wait=0
```

### Progreso de descarga
```
GET /api?apikey=...&cmd=getDownloadProgress
```
Devuelve items con `BookID`, `progress`, `finished`.

### Post‑process (mover a /books)
```
GET /api?apikey=...&cmd=forceProcess&dir=/downloads
```

## Flujo funcional

### 1) Activar modo inglés
Comando: `/english`
- Se activa modo persistente como `/author`.
- En este modo, todas las búsquedas van directo a Lazy.

### 2) Buscar y mostrar resultados
1. `findBook&name=<query>`
2. Mapear a formato de resultados del bot (título + autor + año).
3. Mostrar 5 resultados con paginación.
4. Botones de acción → “download” disparará Lazy.

### 3) Descargar (async)
Al click en “download”:
1. `getAllBooks&id=<bookid>`
2. Si `Status` es `Skipped` → `queueBook&id=<bookid>&type=eBook`
3. `searchBook&id=<bookid>&wait=0`
4. Responder al usuario: “Descarga iniciada, te avisaré cuando esté listo”.

### 4) Polling cada 30s
Guardar job en memoria: `{ chatId, userId, bookId, startedAt }`

En cada poll:
1. `getDownloadProgress` → buscar entry del `bookId`
2. Si `finished` → `forceProcess&dir=/downloads`
3. Consultar `getAllBooks&id=<bookid>`:
   - Si `BookLibrary` apunta a `/books/...` y el archivo existe → notificar al usuario y enviar EPUB.

### 5) /status
Comando `/status`:
- Lista descargas activas del usuario (book + estado + tiempo).

## Estructura de módulos (post‑refactor)
**Objetivo:** integrar el modo `/english` sin volver a “monolito” `index.js`.

### Archivos existentes (referencia)
- `media-arr-books/books-bot-image/index.js`  
  Orquesta dependencias y registra handlers (no agregar lógica nueva acá).
- `media-arr-books/books-bot-image/src/handlers/message-handler.ts`  
  Comandos de texto y búsquedas (aquí va `/english` y `/status`).
- `media-arr-books/books-bot-image/src/handlers/callback-handler.ts`  
  Callbacks de botones (aquí va el botón “download” de Lazy).
- `media-arr-books/books-bot-image/src/search/meili.ts`  
  Lógica Meili (no tocar para Lazy).
- `media-arr-books/books-bot-image/src/utils/*`  
  Helpers reutilizables.

### Nuevos módulos sugeridos (para Lazy)
- `media-arr-books/books-bot-image/src/lazy/client.ts`  
  Wrapper de la API LazyLibrarian (findBook, getAllBooks, queueBook, searchBook, getDownloadProgress, forceProcess).
- `media-arr-books/books-bot-image/src/lazy/state.ts`  
  Estado in‑memory de jobs de descarga y polling.
- `media-arr-books/books-bot-image/src/lazy/formatters.ts`  
  Normalizar resultados de Lazy al formato del bot (título/autor/año).
- `media-arr-books/books-bot-image/src/lazy/poller.ts`  
  Polling cada 30s para progreso + post‑process + entrega.

### Puntos de integración
1. **Comando `/english`**  
   - Implementar en `src/handlers/message-handler.ts`  
   - Activar `ENGLISH_MODE` en `conversationStates` (paralelo a `AUTHOR_MODE`).
2. **Búsqueda en modo inglés**  
   - En `message-handler`, cuando `ENGLISH_MODE` activo:  
     `lazyClient.findBook` → map → `buildPaginatedMessage` + `buildInlineKeyboard`.
3. **Botón “download” de Lazy**  
   - En `src/handlers/callback-handler.ts`  
   - Diferenciar callback type: `lazy_download_<bookid>`.
4. **Polling + entrega**  
   - `lazy/poller.ts` usa `setInterval` (similar a cleanOldStates)  
   - Al finalizar, enviar EPUB usando el mismo flujo de envío actual (file + botones).

### Convención de callbacks
- `lazy_download_<bookid>`  
- `lazy_page_next` / `lazy_page_prev` si se separa paginado de Lazy (opcional).

## Validación real (prueba manual)
Se probó con **Dune**:
- `queueBook` → `Status: Wanted`
- `searchBook` → descarga completada (`getDownloadProgress` finished)
- Archivo en `/downloads/Dune/Herbert Frank Dune.epub`
- `forceProcess` → movido a `/books/Frank Herbert/Dune/Dune - Frank Herbert.epub`

## Tests sugeridos
1. Unitarios:
   - Estado `Skipped` → `queueBook` → `searchBook`
   - Polling detecta `finished` y luego archivo en `/books`
2. Integración (opcional):
   - Mock de API Lazy y filesystem

## Riesgos y notas
- Si Lazy no puede resolver Anna‑Archive, el provider falla.
- El bot debe tener acceso a `/books` (PVC `books-nfs`).
- `getFileDirect` solo funciona si el archivo ya existe.

---

# Extensión: Modo autor en inglés (Lazy)

## Lo que devuelve la API Lazy (verificado)
### `findBook`
```
GET /api?apikey=...&cmd=findBook&name=<query>
```
Devuelve lista con:
- `bookid`
- `bookname`
- `authorname`
- `authorid`
- (otros campos de metadata)

### `findAuthor`
```
GET /api?apikey=...&cmd=findAuthor&name=<author>
```
Devuelve lista de libros (misma estructura que `findBook`), pero filtrada por autor.

### `getAuthor`
```
GET /api?apikey=...&cmd=getAuthor&id=<authorid>
```
Funciona **solo si el autor ya está en la DB de Lazy**. Si no, no trae resultados útiles.

### `findAuthorID`
Devuelve `{}` en esta instancia. No es confiable para el flujo.

## Qué se puede implementar con esto (sin write‑access extra)

### Opción A (recomendada): Modo autor inglés con `findAuthor`
**Flujo**
1. En `/english`, al buscar, usar `findBook`.
2. Si hay resultados y se detecta autor dominante → CTA:
   - “Encontré autor X, ¿querés pasar a modo autor?”
3. Si el usuario acepta, activar `ENGLISH_AUTHOR_MODE`.
4. En `ENGLISH_AUTHOR_MODE`, usar `findAuthor&name=<author>`.
5. Mostrar resultados paginados igual que en español.

**Ventajas**
- No depende de que el autor esté previamente agregado en Lazy.
- Tiene comportamiento similar al modo autor en español.

### Opción B: Modo autor con `getAuthor`
Depende de `authorid` + autor ya existente en la DB. Menos confiable.

### Opción C: Filtro “local” en memoria
Filtrar solo sobre los resultados de `findBook` y paginar.
Es simple, pero más limitado (no explora catálogo completo del autor).

## Propuesta (a implementar)
Usar **Opción A** (findAuthor) para replicar el comportamiento del modo autor español:
- CTA basado en `authorname` dominante en resultados de `findBook`.
- Modo autor en inglés con paginación real usando `findAuthor`.
- Agregar autor en el listado del mensaje (solo en el texto, no en botones).

## Mejora de match por ISBN (Lazy)
Problema observado: Lazy encuentra resultados, pero el provider no devuelve match suficiente y queda en `Skipped`.

### Estrategia
1. **Priorizar resultados con ISBN**  
   - Ordenar hits: primero los que traen `bookisbn`.
2. **Resolver bookid por ISBN al descargar**  
   - Si el hit tiene `bookisbn`, hacer `findBook&name=<isbn>` y usar el `bookid` que coincida por ISBN.
   - Si no hay match, fallback al `bookid` original.

### Efecto esperado
Mejor match y menos falsos positivos al descargar.
