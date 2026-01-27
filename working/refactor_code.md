# Plan de Refactor - Books Bot

## 📋 Resumen

Refactorización del archivo `books-bot-image/index.js` (~1450 líneas) para separarlo en módulos y hacerlo más mantenible, testable y escalable.

---

## Estructura de Directorios Propuesta

```
books-bot-image/
├── src/
│   ├── config/
│   │   └── env.js
│   ├── services/
│   │   ├── meilisearch.js
│   │   ├── email.js
│   │   ├── whitelist.js
│   │   └── conversation.js
│   ├── handlers/
│   │   ├── message.js
│   │   ├── callback.js
│   │   └── commands.js
│   ├── utils/
│   │   ├── formatters.js
│   │   ├── validators.js
│   │   ├── keyboards.js
│   │   └── text.js
│   ├── modes/
│   │   ├── author.js
│   │   └── pagination.js
│   ├── suggestions/
│   │   └── author-suggestions.js
│   ├── bot.js
│   └── index.js
```

---

## Módulos Detallados

### 1. **config/env.js** (~37 líneas)

**Responsabilidad:** Validación y configuración de variables de entorno

**Funciones:**
- `validateEnv()` - Valida que todas las vars requeridas estén presentes
- `getEnvVars()` - Retorna objeto con todas las variables de entorno
- `isTestEnv()` - Indica si estamos en entorno de prueba

**Líneas del archivo original:** 9-45

**Dependencies:** `process.env`, `logger`

---

### 2. **services/whitelist.js** (~45 líneas)

**Responsabilidad:** Gestión de whitelist de usuarios autorizados

**Funciones:**
- `loadWhitelist()` - Carga whitelist desde archivo o usa defaults
- `saveWhitelist(config)` - Guarda whitelist en archivo
- `isAdmin(userId, config)` - Verifica si usuario es admin

**Líneas del archivo original:** 47-91

**Dependencies:** `fs`, `WHITELIST_FILE`, `logger`

---

### 3. **services/email.js** (~100 líneas)

**Responsabilidad:** Gestión de emails de usuarios y envío de libros

**Funciones:**
- `loadEmails()` - Carga emails de usuarios desde archivo
- `saveEmails(emails)` - Guarda emails en archivo
- `isValidEmail(email)` - Valida formato de email
- `sendEmail(toEmail, book, epubBuffer, filename)` - Envía email con libro

**Líneas del archivo original:** 110-137, 660-705

**Dependencies:** `fs`, `nodemailer`, `EMAILS_FILE`, `logger`

---

### 4. **services/conversation.js** (~60 líneas)

**Responsabilidad:** Gestión de estados de conversación (author mode, pagination)

**Funciones:**
- `clearConversationState(chatId)` - Limpia estado de conversación
- `cleanOldStates(bot)` - Limpia estados expirados (5 min)

**Líneas del archivo original:** 100, 246-300

**Dependencies:** `conversationStates` (Map), `logger`

---

### 5. **services/meilisearch.js** (~470 líneas)

**Responsabilidad:** Toda la lógica de búsqueda en MeiliSearch

**Funciones:**
- `searchMeilisearch(query, limit, filters, offset, searchIn, useExactPhrase)` - Búsqueda genérica
- `searchByAuthors(query, limit)` - Búsqueda específica en autores
- `searchWithStrategies(query, limit)` - Búsqueda con múltiples estrategias
- `getTotalResults(query)` - Obtiene total de resultados
- `getTotalBooksByAuthor(authorName)` - Obtiene total de libros por autor
- `searchAuthorFacets(query)` - Obtiene facetas de autores
- `extractAuthorsFromFacets(facetMap, query, limit)` - Extrae autores de facetas
- `getBookById(libid)` - Obtiene libro por ID
- `escapeFilterValue(value)` - Escapa valores para filtros

**Líneas del archivo original:** 95-98, 197-265, 375-513, 647-658

**Dependencies:** `meiliClient`, `MEILI_INDEX`, `logger`

---

### 6. **utils/validators.js** (~30 líneas)

**Responsabilidad:** Funciones de validación y normalización

**Funciones:**
- `normalizeAuthor(author)` - Normaliza nombre de autor
- `sanitizeFilename(text)` - Sanitiza texto para nombre de archivo
- `isValidEmail(email)` - Valida formato de email
- `escapeFilterValue(value)` - Escapa caracteres especiales para filtros

**Líneas del archivo original:** 102-108, 134-141, 515-517

**Dependencies:** Ninguna

---

### 7. **utils/formatters.js** (~40 líneas)

**Responsabilidad:** Formateo de texto y mensajes

**Funciones:**
- `truncate(text, maxLength)` - Trunca texto con "..."
- `formatResult(hit)` - Formatea resultado de búsqueda
- `generateFilename(title, authors)` - Genera nombre de archivo para EPUB
- `buildAuthorPreviewMessage(author, previewBooks, totalBooks, originalQuery)` - Mensaje de preview de autor

**Líneas del archivo original:** 155-166, 519-544

**Dependencies:** `truncate`, `sanitizeFilename`

---

### 8. **utils/keyboards.js** (~75 líneas)

**Responsabilidad:** Construcción de teclados inline y mensajes paginados

**Funciones:**
- `buildPaginatedMessage(query, results, currentPage, totalResults, searchType, displayName)` - Mensaje paginado
- `buildPaginationKeyboard(currentPage, totalPages, isLastPage)` - Teclado de paginación
- `buildInlineKeyboard(results, userId, currentPage, totalResults)` - Teclado inline con botones de acción

**Líneas del archivo original:** 302-373

**Dependencies:** `loadEmails`, `truncate`

---

### 9. **utils/text.js** (~30 líneas)

**Responsabilidad:** Procesamiento de texto y extracción de datos

**Funciones:**
- `extractUniqueAuthors(results)` - Extrae autores únicos de resultados
- `extractAuthorsFromFacets(facetMap, query, limit)` - Extrae autores de facetas

**Líneas del archivo original:** 168-195

**Dependencies:** `normalizeAuthor`

---

### 10. **suggestions/author-suggestions.js** (~100 líneas)

**Responsabilidad:** Lógica de sugerencias de autores cuando no hay resultados

**Funciones:**
- `handleAuthorSuggestion(bot, chatId, userId, originalQuery, uniqueAuthors, deps)` - Maneja sugerencias de autores
- `sendAuthorCtaAfterTitleResults(bot, chatId, uniqueAuthors)` - Envía CTA de autor después de resultados de título

**Líneas del archivo original:** 546-645

**Dependencies:** `meiliClient`, `getTotalBooksByAuthor`, `escapeFilterValue`, `logger`

---

### 11. **modes/author.js** (~210 líneas)

**Responsabilidad:** Lógica del modo autor (filtrar por autor)

**Funciones:**
- `activateAuthorMode(bot, chatId, author)` - Activa modo autor
- `deactivateAuthorMode(bot, chatId, state)` - Desactiva modo autor
- `handleAuthorModeSearch(bot, chatId, userId, state, text)` - Maneja búsqueda en modo autor

**Líneas del archivo original:** 859-1066

**Dependencies:** `searchMeilisearch`, `buildPaginatedMessage`, `buildInlineKeyboard`, `conversationStates`, `logger`

---

### 12. **modes/pagination.js** (~140 líneas)

**Responsabilidad:** Lógica de paginación de resultados

**Funciones:**
- `activatePaginationMode(bot, chatId, userId, query, results, searchResult)` - Activa modo paginación
- `deactivatePaginationMode(bot, chatId, state)` - Desactiva modo paginación
- `handlePagination(bot, chatId, userId, action)` - Maneja acciones de paginación (anterior/siguiente)
- `showPage(bot, chatId, state, userId)` - Muestra página específica

**Líneas del archivo original:** 1060-1196

**Dependencies:** `searchMeilisearch`, `buildPaginatedMessage`, `buildInlineKeyboard`, `conversationStates`, `logger`

---

### 13. **handlers/commands.js** (~270 líneas)

**Responsabilidad:** Manejo de todos los comandos del bot

**Funciones:**
- `handleStartCommand(bot, chatId)` - Comando /start
- `handleHelpCommand(bot, chatId, userId, whitelistConfig)` - Comando /help
- `handleMyIdCommand(bot, chatId, userId)` - Comando /myId
- `handleAddMailCommand(bot, chatId, userId, emailText)` - Comando /addMail
- `handleChangeMailCommand(bot, chatId, userId, emailText)` - Comando /changeMail
- `handleAuthorCommand(bot, chatId, authorName)` - Comando /author
- `handleExitCommand(bot, chatId, state)` - Comando /exit
- `handleAddUserCommand(bot, chatId, userId, targetId, whitelistConfig)` - Comando /addUser (admin)
- `handleRemoveUserCommand(bot, chatId, userId, targetId, whitelistConfig)` - Comando /removeUser (admin)
- `handleListUsersCommand(bot, chatId, userId, whitelistConfig)` - Comando /listUsers (admin)

**Líneas del archivo original:** 728-992

**Dependencies:** Todos los módulos anteriores, `whitelistConfig`, `allowedUsers`

---

### 14. **handlers/callback.js** (~330 líneas)

**Responsabilidad:** Manejo de callbacks de botones inline

**Funciones:**
- `handleDownloadCallback(bot, query, chatId, userId, BIBLIOTECA_BASE_URL)` - Callback download_
- `handleInfoCallback(bot, query, chatId, BIBLIOTECA_BASE_URL)` - Callback info_
- `handleEmailCallback(bot, query, chatId, userId)` - Callback email_
- `handleActivateAuthorCallback(bot, query, chatId)` - Callback activate_author_
- `handleBrowseAuthorCallback(bot, query, chatId, userId)` - Callback browse_author_
- `handlePagePrevCallback(bot, query, chatId, userId)` - Callback page_prev
- `handlePageNextCallback(bot, query, chatId, userId)` - Callback page_next

**Líneas del archivo original:** 1217-1549

**Dependencies:** Todos los servicios y modos, `BIBLIOTECA_BASE_URL`

---

### 15. **handlers/message.js** (~220 líneas)

**Responsabilidad:** Manejo principal de mensajes y coordinación de modos

**Funciones:**
- `handleMessage(bot, msg, allowedUsers, whitelistConfig)` - Maneja mensaje de texto
- `handleNormalSearch(bot, chatId, userId, text)` - Búsqueda normal (sin modos activos)
- `checkConversationStates(bot, chatId, userId, text)` - Verifica estados de conversación activos

**Líneas del archivo original:** 995-1214

**Dependencies:** `searchWithStrategies`, `handleAuthorSuggestion`, `authorMode`, `paginationMode`, `logger`

---

### 16. **bot.js** (~10 líneas)

**Responsabilidad:** Inicialización del bot y registro de handlers

**Funciones:**
- `createBot(bot, handlers)` - Crea instancia de bot y registra handlers

**Líneas del archivo original:** 707-711

**Dependencies:** `TelegramBot`, `handlers/message.js`, `handlers/callback.js`

---

### 17. **index.js** (~20 líneas)

**Responsabilidad:** Punto de entrada y manejo de errores

**Funciones:**
- `startBot()` - Inicializa el bot
- Error handling global

**Líneas del archivo original:** (combinación de final de archivo)

**Dependencies:** `bot.js`, `config/env.js`, `logger`

---

## Beneficios del Refactor

### ✅ **Separación de Responsabilidades**
- Cada módulo tiene una única función clara
- Reduce acoplamiento entre componentes
- Facilita comprensión del código

### ✅ **Testabilidad**
- Módulos pequeños son más fáciles de testear
- Mocks más simples para dependencias
- Tests unitarios más enfocados

### ✅ **Mantenibilidad**
- Cambios localizados sin afectar todo el código
- Archivos más pequeños y manejables (~30-270 líneas vs ~1450)
- Identificación rápida de dónde hacer cambios

### ✅ **Reutilización**
- Funciones utilitarias reutilizables en otros bots
- Servicios genéricos (email, whitelist) pueden reutilizarse
- Handlers pueden extenderse fácilmente

### ✅ **Escalabilidad**
- Agregar nuevos comandos es más simple
- Nuevos modos de conversación son más fáciles de implementar
- Nuevas estrategias de búsqueda pueden añadirse sin afectar lógica existente

---

## Orden de Implementación Sugerido

### Fase 1: Core (Fundación)
1. **config/env.js** - Configuración base
2. **utils/validators.js** - Validaciones básicas
3. **utils/formatters.js** - Formateo de texto
4. **utils/text.js** - Procesamiento de texto

### Fase 2: Servicios
5. **services/whitelist.js** - Gestión de whitelist
6. **services/email.js** - Gestión de emails
7. **services/conversation.js** - Gestión de estados
8. **services/meilisearch.js** - Búsqueda (módulo más grande)

### Fase 3: Utilidades de UI
9. **utils/keyboards.js** - Teclados inline

### Fase 4: Lógica de Negocio
10. **suggestions/author-suggestions.js** - Sugerencias
11. **modes/author.js** - Modo autor
12. **modes/pagination.js** - Modo paginación

### Fase 5: Handlers
13. **handlers/commands.js** - Comandos
14. **handlers/callback.js** - Callbacks
15. **handlers/message.js** - Mensajes

### Fase 6: Integración
16. **bot.js** - Inicialización
17. **index.js** - Punto de entrada

### Fase 7: Limpieza
18. Eliminar `index.js` original
19. Actualizar imports
20. Ejecutar tests existentes
21. Corregir errores si los hay

---

## Consideraciones de Implementación

### Importaciones
- Usar imports relativos: `import { searchMeilisearch } from '../services/meilisearch.js'`
- Mantener estilo ES modules del proyecto

### Estado Global
- `conversationStates` puede ser exportado desde `services/conversation.js`
- `allowedUsers` y `whitelistConfig` pueden ser exportados desde `services/whitelist.js`

### Logger
- Usar `pino` en todos los módulos
- Inyectar logger en módulos para mejor testabilidad

### Tests
- Migrar tests existentes a nueva estructura
- Crear tests unitarios para cada módulo
- Mantener tests de integración en `handlers/`

### Errores
- Mantener manejo de errores consistente
- Usar `try/catch` en todos los handlers
- Loggear errores con contexto suficiente

---

## Archivos a Crear

Total: **17 nuevos archivos**

- `src/config/env.js`
- `src/services/whitelist.js`
- `src/services/email.js`
- `src/services/conversation.js`
- `src/services/meilisearch.js`
- `src/utils/validators.js`
- `src/utils/formatters.js`
- `src/utils/keyboards.js`
- `src/utils/text.js`
- `src/suggestions/author-suggestions.js`
- `src/modes/author.js`
- `src/modes/pagination.js`
- `src/handlers/commands.js`
- `src/handlers/callback.js`
- `src/handlers/message.js`
- `src/bot.js`
- `src/index.js`

---

## Archivo a Eliminar

- `books-bot-image/index.js` (original, ~1450 líneas)

---

## Próximos Pasos

1. ✅ Aprobar plan de refactor
2. ⏳ Crear estructura de directorios
3. ⏳ Implementar módulos en orden sugerido
4. ⏳ Migrar tests existentes
5. ⏳ Ejecutar tests completos
6. ⏳ Corregir errores encontrados
7. ⏳ Documentar cambios en README

---

## Notas Adicionales

- **No cambiar funcionalidad** - solo refactorizar
- **Mantener logs existentes** - preservar contexto de debugging
- **Tests existentes deben pasar** - sin cambios en comportamiento
- **Commits pequeños** - un módulo por commit para facilitar rollback
- **Code review** - revisar cada módulo antes de continuar al siguiente
