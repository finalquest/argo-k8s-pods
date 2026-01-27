# Plan de Refactor: Books Bot (index.js → módulos)

Fecha: 2026-01-26  
Servicio: `media-arr-books/books-bot-image`

## Objetivo
Dividir el `index.js` monolítico en módulos claros y testeables, **y migrar a TypeScript de forma incremental**, sin cambiar el comportamiento.

## Estructura Propuesta

```
media-arr-books/books-bot-image/
  src/
    bot/
      telegram.js              # init bot + wiring
      commands.js              # /start /help /author /english /status
      callbacks.js             # callback_query handlers
    search/
      meili.js                 # searchMeilisearch + strategies + pagination
      lazy.js                  # LazyLibrarian API (find/add/search/poll)
    state/
      conversationState.js     # Map + helpers (cleanup, clear)
    messages/
      formatters.js            # buildPaginatedMessage, buildAuthorPreviewMessage
    providers/
      email.js                 # sendEmail + helpers
    utils/
      text.js                  # normalizeAuthor, truncate, sanitizeFilename
      fs.js                    # whitelist/emails load/save
    config/
      env.js                   # lectura y validación de env
  index.ts                     # entrypoint: startBot()
  dist/                        # salida compilada (tsc)
```

## Pasos Incrementales (Refactor + TS)

### Paso 1: Utilidades puras (convertir a TS)
Mover sin tocar lógica y tipar funciones:
- `normalizeAuthor`, `truncate`, `sanitizeFilename`, `generateFilename`
- `buildPaginationKeyboard`, `buildInlineKeyboard`
- `buildPaginatedMessage`, `buildAuthorPreviewMessage`

### Paso 2: Estado y almacenamiento (TS)
- `conversationStates` y helpers (`clearConversationState`, `cleanOldStates`)
- `loadWhitelist`, `saveWhitelist`, `loadEmails`, `saveEmails`

### Paso 3: MeiliSearch (TS)
- `searchMeilisearch`, `searchWithStrategies`, `searchAuthorFacets`
- `getTotalBooksByAuthor`, `getTotalResults`

### Paso 4: Lazy API (TS)
- módulo `lazy.js` con calls HTTP:
  - `findBook`, `queueBook`, `searchBook`, `getDownloadProgress`
  - `forceProcess`, `getAllBooks`

### Paso 5: Telegram Handlers (TS)
- `commands.js` para comandos
- `callbacks.js` para botones

### Paso 6: Wiring final (TS)
- `telegram.js` inicializa bot y registra handlers
- `index.ts` queda como entrypoint mínimo

## Tests
- Reapuntar tests a módulos (search, messages, state).
- Agregar mocks para Lazy y Meili.
- **Tests pueden seguir en JS** en esta etapa.

## Checklist
- No cambiar strings visibles.
- Mantener shape de `conversationStates`.
- Mantener env vars y defaults.
- Correr tests + smoke manual.

## Resultado Esperado
Código más mantenible, modular y fácil de testear, sin cambios de comportamiento.

## Plan Técnico (TypeScript + Build)

### Configuración
- `tsconfig.json`:
  - `target`: ES2020
  - `module`: ES2022
  - `moduleResolution`: node
  - `outDir`: `dist`
  - `rootDir`: `src`
  - `esModuleInterop`: true
  - `strict`: false (mantener comportamiento actual)
  - `skipLibCheck`: true

### Scripts (package.json)
- `build`: `tsc`
- `start`: `node dist/index.js`
- `dev`: `tsc --watch` (opcional)

### Docker
- Build multi‑stage recomendado:
  1) `npm ci` + `npm run build`
  2) copiar `dist/` al runtime
- El runtime ejecuta `node dist/index.js`

### Migración incremental
- Cada módulo nuevo se crea en `.ts` con tipos básicos.
- `index.ts` solo importa y ejecuta `startBot`.
- Tests continúan en JS hasta migración total.
