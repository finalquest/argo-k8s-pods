# Plan de Implementación: Paginación para Books Bot

## Objetivo
Implementar sistema de paginación para resultados de búsqueda cuando hay más de 5 items, aplicable tanto en búsquedas normales como en modo autor.

## Requisitos Funcionales

### Comportamiento General
- **Ámbito**: Paginación disponible en ambos modos (búsqueda normal y modo autor)
- **Límite por página**: 5 resultados
- **Timeout**: 5 minutos de inactividad para expirar el modo paginación
- **Salida al descargar**: Cancelar modo paginación cuando usuario descarga un libro
- **Salida manual**: Comando `/exit` también funciona en modo paginación

### Formato de Mensaje en Modo Paginación
- **Solo mostrar títulos** de cada libro (sin autor, año, descripción)
- Botón `ℹ️ Info` existente para ver detalles completos
- Encabezado con información de paginación: `Página X/Y (Z resultados) - Buscando: "query"`
- Botones de navegación: `⬅️ Anterior` y `Siguiente ➡️`
- Botones de acción por libro: `📥 Download`, `ℹ️ Info`, `📧 Email` (si configurado)

## Estado de Conversación

### Nuevo Estado: PAGINATION_MODE
```javascript
{
  state: 'PAGINATION_MODE',
  query: 'término de búsqueda',
  filters: null | { author: 'nombre' },
  currentPage: 0,
  totalResults: 25,
  resultsPerPage: 5,
  searchType: 'NORMAL' | 'AUTHOR',
  displayName: 'Autor Name' | null,
  timestamp: Date.now()
}
```

## Orden de Implementación

1. Modificar `searchMeilisearch()` para soportar offset
2. Crear función `buildPaginationKeyboard()`
3. Modificar `buildInlineKeyboard()` para incluir paginación
4. Crear función `buildPaginatedMessage()`
5. Modificar lógica de búsqueda normal
6. Modificar lógica de búsqueda en modo autor
7. Implementar callback handlers `page_prev` y `page_next`
8. Modificar `cleanOldStates()` para limpiar estados PAGINATION_MODE
9. Actualizar `/exit` para salir de paginación
10. Agregar auto-exit de paginación al descargar
11. Actualizar mensajes de ayuda
12. Probar en desarrollo

## Archivos Modificados

- `index.js`: Archivo principal del bot

## Dependencias Externas

No se requieren nuevas dependencias. Todas las funcionalidades usan librerías existentes:
- `node-telegram-bot-api`: Para callbacks y edición de mensajes
- `meilisearch`: Para búsqueda con offset
- `pino`: Para logging
