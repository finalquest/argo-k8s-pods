# Plan: Modo “Búsqueda Inglés” vía LazyLibrarian (Anna‑Archive)

Fecha: 2026-01-26  
Servicio: `media-arr-books/books-bot-image`

## Objetivo
Agregar un modo de búsqueda en inglés que:
1) Consulte LazyLibrarian (provider: Anna‑Archive).
2) Si el libro existe en Lazy, lo entregue al usuario.
3) Si no existe, dispare búsqueda/descarga y notifique cuando esté listo.
4) Entregue el EPUB con los mismos 3 botones actuales.

## Supuestos
- Lazy mueve el archivo final a `/books` tras post‑process.
- El bot debe leer el EPUB desde un volumen compartido (`books-nfs`).

## Cambios de Infra (K8s)
**Archivo:** `media-arr-books/deployment-books-bot.yaml`
- Montar `books-nfs` en el bot:
  - `volumeMounts` → `/books`
  - `volumes` → `books-nfs`

## Flujo Propuesto

### 1) Activar modo inglés
Comando sugerido: `/english <query>`
- Si no hay query, mostrar uso.
- Guardar estado `ENGLISH_MODE` (opcional) o manejar por comando.

### 2) Buscar en Lazy
Usar Lazy API para:
- Buscar el libro por título/autor.
- Si existe y tiene archivo final → devolver EPUB.
- Si no existe, crear solicitud de búsqueda/descarga.

### 3) Esperar y notificar
- Guardar una “job” en memoria (chatId, userId, query, lazyId).
- Poll cada N segundos (ej. 30–60s):
  - Consultar Lazy API por estado.
  - Verificar si el archivo existe en `/books`.
  - Si aparece, enviar mensaje + botones (descarga/info/email).

### 4) Entrega al usuario
- Reusar el mismo flujo de envío que hoy (file + botones).

## API LazyLibrarian (a confirmar)
- Obtener/usar API key (ya configurada).
- Endpoints típicos (varía por versión):
  - `getBooks` / `findBooks` / `searchBook`
  - `searchBook` / `addBook` / `downloadBook`
  - `getBook` (para ver estado y path final)

Se validará con un `curl` real a Lazy antes de codificar.

## Tests
1) Unitarios con mocks:
   - “Job” de búsqueda en Lazy → transición a “listo”.
   - Verificación de path en `/books`.
2) Integración (opcional):
   - Simular búsqueda real con Lazy (si API disponible).

## Criterios de Éxito
1) `/english <query>` dispara Lazy y responde cuando el EPUB está listo.
2) El bot usa `/books` para acceder al archivo final.
3) El usuario recibe el EPUB con los 3 botones actuales.
4) No rompe el flujo de búsqueda actual.
