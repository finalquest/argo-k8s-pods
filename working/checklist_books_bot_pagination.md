# Checklist: Implementación de Paginación para Books Bot

## Fase 1: Modificaciones Básicas
- [ ] Modificar `searchMeilisearch()` (línea 303)
  - [ ] Agregar parámetro `offset = 0`
  - [ ] Agregar `offset` a `searchParams`
  - [ ] Retornar objeto con `hits` y `totalHits`
  - [ ] Actualizar logging para incluir offset y totalHits

## Fase 2: Funciones de UI
- [ ] Crear función `buildPaginationKeyboard()`
  - [ ] Parámetros: currentPage, totalPages, isLastPage
  - [ ] Lógica para mostrar/ocultar "Anterior" en primera página
  - [ ] Lógica para mostrar/ocultar "Siguiente" en última página
  - [ ] Retornar array de botones vacío si no hay navegación
- [ ] Modificar `buildInlineKeyboard()` (línea 274)
  - [ ] Agregar parámetros: currentPage, totalResults
  - [ ] Integrar `buildPaginationKeyboard()`
  - [ ] Calcular totalPages y isLastPage
  - [ ] Agregar botones de paginación al final del inline_keyboard
- [ ] Crear función `buildPaginatedMessage()`
  - [ ] Parámetros: query, results, currentPage, totalResults, searchType, displayName
  - [ ] Construir encabezado con modo autor si aplica
  - [ ] Agregar contador de página y resultados
  - [ ] Mostrar solo títulos de libros (sin descripción, autor, año)
  - [ ] Calcular índice global (X de Y resultados totales)

## Fase 3: Lógica de Búsqueda
- [ ] Modificar búsqueda normal (línea 754)
  - [ ] Obtener `totalHits` de `searchMeilisearch()`
  - [ ] Si totalHits > 5, activar modo paginación
  - [ ] Guardar estado PAGINATION_MODE con toda la info necesaria
  - [ ] Usar `buildPaginatedMessage()` en lugar de formato completo
  - [ ] Pasar currentPage y totalResults a `buildInlineKeyboard()`
  - [ ] Agregar logging específico de paginación
- [ ] Modificar búsqueda en modo autor (línea 653)
  - [ ] Similar a búsqueda normal pero con filters de autor
  - [ ] Incluir displayName en estado PAGINATION_MODE
  - [ ] Mantener lógica existente cuando <= 5 resultados
  - [ ] Eliminar comportamiento actual que solo muestra mensaje de error

## Fase 4: Callback Handlers
- [ ] Implementar handler `page_prev` (línea 786)
  - [ ] Validar que existe estado PAGINATION_MODE
  - [ ] Validar que no estamos en primera página (currentPage > 0)
  - [ ] Calcular offset para página anterior
  - [ ] Actualizar currentPage en estado
  - [ ] Actualizar timestamp para evitar timeout
  - [ ] Llamar `searchMeilisearch()` con nuevo offset
  - [ ] Usar `bot.editMessageText()` para actualizar mensaje
  - [ ] Usar `bot.answerCallbackQuery()` para feedback
  - [ ] Agregar logging
- [ ] Implementar handler `page_next` (línea 786)
  - [ ] Validar que existe estado PAGINATION_MODE
  - [ ] Validar que no estamos en última página
  - [ ] Calcular offset para página siguiente
  - [ ] Actualizar currentPage en estado
  - [ ] Actualizar timestamp para evitar timeout
  - [ ] Llamar `searchMeilisearch()` con nuevo offset
  - [ ] Usar `bot.editMessageText()` para actualizar mensaje
  - [ ] Usar `bot.answerCallbackQuery()` para feedback
  - [ ] Agregar logging
- [ ] Modificar handler `download_` (línea 796)
  - [ ] Detectar si estamos en modo PAGINATION_MODE
  - [ ] Si sí, eliminar estado de conversación
  - [ ] Enviar mensaje de confirmación de salida
  - [ ] Agregar logging de auto-exit

## Fase 5: Cleanup y Ayuda
- [ ] Modificar `cleanOldStates()` (línea 243)
  - [ ] Agregar caso para `PAGINATION_MODE`
  - [ ] Calcular totalPages para mensaje de expiración
  - [ ] Eliminar estado de conversación
  - [ ] Enviar mensaje de expiración específico
  - [ ] Agregar logging específico
  - [ ] Manejar errores de envío con `.catch()`
- [ ] Actualizar comando `/exit` (línea 624)
  - [ ] Agregar caso para `PAGINATION_MODE`
  - [ ] Mostrar páginas visitadas y duración
  - [ ] Eliminar estado de conversación
  - [ ] Enviar mensaje de confirmación
  - [ ] Actualizar texto cuando no hay estado activo
  - [ ] Agregar logging
- [ ] Actualizar mensaje `/start` (línea 413)
  - [ ] Mencionar modo paginación en descripción
  - [ ] Actualizar texto del comando `/exit`
- [ ] Actualizar mensaje `/help` (línea 415)
  - [ ] Mencionar modo paginación en explicación
  - [ ] Actualizar descripción de `/exit`

## Fase 6: Testing Manual
### Búsqueda Normal
- [ ] Probar búsqueda con <5 resultados
  - [ ] Verificar que NO se active paginación
  - [ ] Verificar formato completo del mensaje
- [ ] Probar búsqueda con >5 resultados
  - [ ] Verificar que se active modo paginación
  - [ ] Verificar formato minimalista (solo títulos)
  - [ ] Verificar botones de navegación visibles
  - [ ] Verificar contador correcto (Página X/Y, Z resultados)
- [ ] Navegar a página siguiente
  - [ ] Verificar que el mensaje se actualice
  - [ ] Verificar que el contador se actualice
  - [ ] Verificar que no se creen nuevos mensajes
- [ ] Navegar a página anterior
  - [ ] Verificar funcionalidad similar
- [ ] Intentar ir atrás en primera página
  - [ ] Verificar que el botón esté oculto
  - [ ] Verificar error si se intenta forzar
- [ ] Intentar ir adelante en última página
  - [ ] Verificar que el botón esté oculto
  - [ ] Verificar error si se intenta forzar

### Modo Autor con Paginación
- [ ] Activar modo autor con `/author`
- [ ] Buscar título del autor con >5 resultados
  - [ ] Verificar que se active paginación
  - [ ] Verificar que el encabezado muestre el autor
  - [ ] Verificar que los filtros se mantengan
- [ ] Navegar páginas
  - [ ] Verificar que los resultados sean del mismo autor
- [ ] Usar `/exit`
  - [ ] Verificar que salga del modo
  - [ ] Verificar mensaje de resumen

### Timeout
- [ ] Activar modo paginación
- [ ] Esperar 5 minutos sin interacción
- [ ] Verificar mensaje de expiración
- [ ] Verificar que el estado se elimine
- [ ] Intentar navegar después de timeout
  - [ ] Verificar error de "no hay búsqueda activa"

### Descarga
- [ ] Activar modo paginación
- [ ] Hacer click en download de un libro
- [ ] Verificar que se envíe el libro
- [ ] Verificar que se cierre modo paginación
- [ ] Verificar mensaje de confirmación

### Botón Info
- [ ] Activar modo paginación
- [ ] Hacer click en Info de un libro
- [ ] Verificar que se muestren detalles completos
- [ ] Verificar que NO se cierre modo paginación
- [ ] Verificar que se pueda seguir navegando

### Botón Email
- [ ] Activar modo paginación
- [ ] Hacer click en Email de un libro
- [ ] Verificar que se envíe el email
- [ ] Verificar que NO se cierre modo paginación

### Comando /exit
- [ ] Activar modo paginación
- [ ] Navegar varias páginas
- [ ] Ejecutar `/exit`
- [ ] Verificar mensaje con resumen (páginas visitadas, duración)
- [ ] Verificar que el estado se elimine

## Checklist de Validación Post-Implementación
- [ ] Paginación funciona en modo normal
- [ ] Paginación funciona en modo autor
- [ ] Timeout funciona correctamente
- [ ] Auto-exit al descargar funciona
- [ ] Comando /exit funciona en paginación
- [ ] Formato de mensaje es correcto (solo títulos)
- [ ] Botones de navegación aparecen/desaparecen correctamente
- [ ] Contadores de página y resultados son precisos
- [ ] Botón Info funciona sin salir de paginación
- [ ] Botón Email funciona sin salir de paginación
- [ ] Logging es suficiente para debugging
- [ ] No hay memory leaks en conversationStates
- [ ] Mensajes de ayuda están actualizados
