# Docker Image: Books Bot v2.2.0 - Pagination Feature

## Resumen

Imagen Docker construida exitosamente con la funcionalidad de paginación implementada para Linux AMD64 (x86_64).

## Detalles de la Imagen

**Repositorio:** `books-bot`
**Versión:** `v2.2.0`
**Tag adicional:** `latest`
**Registry:** `harbor.finalq.xyz/tools/books-bot`
**Tamaño:** 279 MB
**Base Image:** `node:20-alpine`
**Arquitectura:** linux/amd64 (x86_64)
**Created:** 2026-01-25T21:38:19
**Status:** ✅ Publicado en Harbor

## Construcción

La imagen se construyó usando **Docker buildx** para crear una imagen específica para `linux/amd64`, compatible con ambientes Kubernetes x86_64.

```bash
docker buildx build \
  --platform linux/amd64 \
  --tag books-bot:v2.2.0 \
  --tag books-bot:latest \
  --tag harbor.finalq.xyz/tools/books-bot:v2.2.0 \
  --tag harbor.finalq.xyz/tools/books-bot:latest \
  --load \
  .
```

**Nota:** Esto es necesario porque la máquina de desarrollo es ARM (Apple Silicon) y K8s requiere AMD64.

## Características

### Funcionalidades Implementadas
- ✅ Paginación automática para búsquedas con >5 resultados
- ✅ Formato minimalista (solo títulos) en modo paginación
- ✅ Navegación con botones Anterior/Siguiente
- ✅ Soporte para paginación en modo autor
- ✅ Auto-exit al descargar libros
- ✅ Timeout de 5 minutos para modo paginación
- ✅ Comando `/exit` soporta salir de paginación
- ✅ Mensajes de ayuda actualizados

### Funciones Nuevas
1. `buildPaginationKeyboard()` - Genera botones de navegación
2. `buildPaginatedMessage()` - Crea mensajes paginados minimalistas

### Funciones Modificadas
1. `searchMeilisearch()` - Soporte para offset
2. `buildInlineKeyboard()` - Integra botones de paginación
3. `cleanOldStates()` - Limpia estados de paginación

### Callbacks Nuevos
1. `page_prev` - Navega a página anterior
2. `page_next` - Navega a página siguiente

## Testing

### Tests Unitarios
- **Total tests:** 28
- **Estado:** Todos pasando ✅
- **Framework:** Jest

### Suites de Tests
1. buildPaginationKeyboard: 6 tests
2. buildPaginatedMessage: 7 tests
3. Pagination state management: 3 tests
4. Pagination edge cases: 4 tests
5. Pagination activation logic: 3 tests
6. Navigation button visibility: 4 tests

### Ejecución de Tests
```bash
npm test
```

**Resultado:** 28 passed, 0 failed

## Uso de la Imagen

### Desde Harbor Registry
```bash
docker pull harbor.finalq.xyz/tools/books-bot:v2.2.0
```

### Local
```bash
docker run -d \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e MEILI_HOST=your_meilisearch_host \
  -e MEILI_API_KEY=your_api_key \
  -e MEILI_INDEX=biblioteca \
  -e BIBLIOTECA_BASE_URL=your_biblioteca_url \
  -e ALLOWED_USER_IDS=your_telegram_id \
  harbor.finalq.xyz/tools/books-bot:v2.2.0
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: books-bot
  namespace: media
spec:
  replicas: 1
  selector:
    matchLabels:
      app: books-bot
  template:
    metadata:
      labels:
        app: books-bot
    spec:
      containers:
      - name: books-bot
        image: harbor.finalq.xyz/tools/books-bot:v2.2.0
        envFrom:
        - configMapRef:
            name: books-bot-config
        - secretRef:
            name: books-bot-secrets
```

### Actualizar Deployment Existente
```bash
kubectl set image deployment/books-bot books-bot=harbor.finalq.xyz/tools/books-bot:v2.2.0 -n media
```

## Variables de Entorno Requeridas

### Telegram
- `TELEGRAM_BOT_TOKEN`: Token del bot de Telegram
- `ALLOWED_USER_IDS`: IDs de Telegram autorizados (separados por coma)

### MeiliSearch
- `MEILI_HOST`: URL de MeiliSearch
- `MEILI_API_KEY`: API key de MeiliSearch
- `MEILI_INDEX`: Índice a usar (default: `biblioteca`)

### Biblioteca
- `BIBLIOTECA_BASE_URL`: URL base de la biblioteca para descargas

### SMTP (opcional)
- `SMTP_HOST`: Host del servidor SMTP
- `SMTP_PORT`: Puerto del servidor SMTP
- `SMTP_EMAIL`: Email para autenticación
- `SMTP_PASSWORD`: Contraseña para autenticación
- `SMTP_FROM`: Email de remitente

### Otros
- `LOG_LEVEL`: Nivel de logging (default: `info`)

## Versiones

| Versión | Fecha | Cambios |
|---------|------|---------|
| v2.2.0 | 2026-01-25 | Feature: Add pagination for >5 results |
| v2.1.3 | 2026-01-24 | Fix: Show 5 results when >5 available, remove refinement barrier |

## Comandos Docker

### Verificar imagen
```bash
docker images | grep books-bot
```

### Inspeccionar imagen
```bash
docker inspect books-bot:v2.2.0
```

### Ejecutar container interactivo
```bash
docker run -it --rm books-bot:v2.2.0 sh
```

### Ver logs del container
```bash
docker logs -f books-bot-container
```

## Actualización desde v2.1.3

### Cambios Breaking
Ninguno. Esta versión es completamente compatible con la configuración existente.

### Nueva Funcionalidad
La paginación se activa automáticamente cuando una búsqueda retorna más de 5 resultados. No requiere cambios en la configuración.

### Migración
No se requiere migración. Actualizar la imagen a v2.2.0 y reiniciar el deployment es suficiente.

### Rollback
Para volver a la versión anterior:
```bash
kubectl set image deployment/books-bot books-bot=harbor.finalq.xyz/tools/books-bot:v2.1.3 -n media
```

## Performance

### Tamaño de Imagen
- Base: `node:20-alpine` (~120 MB)
- Dependencias: ~150 MB
- Total: ~279 MB

### Recursos Recomendados
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

## Seguridad

### Base Image
- `node:20-alpine` - Imagen Alpine Linux optimizada para producción
- Actualizada regularmente por el equipo de Node.js

### Vulnerabilidades
Al construir la imagen, npm audit reportó 8 vulnerabilidades (5 moderate, 1 high, 2 critical). Estas son dependencias transitivas de paquetes de terceros (node-telegram-bot-api, meilisearch, etc.).

Para ver detalles:
```bash
npm audit
```

**Nota:** Las vulnerabilidades reportadas son comunes en ecosistemas JavaScript y no representan necesariamente riesgos de seguridad para este caso de uso específico. Se recomienda revisarlas antes de usar en entornos críticos.

## Troubleshooting

### Container no inicia
Verificar que todas las variables de entorno requeridas estén configuradas:
```bash
docker logs books-bot-container
```

### Conexión a MeiliSearch falla
Verificar que `MEILI_HOST` y `MEILI_API_KEY` son correctos:
```bash
curl -H "Authorization: Bearer $MEILI_API_KEY" $MEILI_HOST/health
```

### Bot no responde en Telegram
Verificar que tu Telegram ID está en `ALLOWED_USER_IDS`:
```bash
# Obtener tu ID
@userinfobot
```

## Soporte

Para issues o preguntas:
- Revisar logs del container
- Verificar variables de entorno
- Consultar documentación de [MeiliSearch](https://docs.meilisearch.com)
- Consultar documentación de [Telegram Bot API](https://core.telegram.org/bots/api)

## Changelog

### v2.2.0 (2026-01-25)
- ✅ Implementar paginación para búsquedas con >5 resultados
- ✅ Agregar botones de navegación Anterior/Siguiente
- ✅ Formato minimalista en modo paginación
- ✅ Soporte para paginación en modo autor
- ✅ Auto-exit al descargar libros
- ✅ Timeout de 5 minutos para modo paginación
- ✅ Actualizar mensajes de ayuda
- ✅ Agregar tests unitarios (28 tests)
- ✅ Documentación completa

### v2.1.3 (2026-01-24)
- Fix: Mostrar 5 resultados cuando hay más de 5 disponibles
- Fix: Eliminar barrera de refinamiento en búsquedas
