# Penpot MCP Docker Image

Este directorio contiene el Dockerfile para construir la imagen de Penpot MCP.

## Build y Push

Para construir y pushear la imagen a Harbor:

```bash
# Asegurarse de tener buildx configurado
docker buildx create --name multi --use || docker buildx use multi

# Build y push (ajustar la plataforma según tus nodos)
docker buildx build \
  --platform linux/amd64 \
  -t harbor.finalq.xyz/tools/penpot-mcp:0.1.0 \
  --push \
  ./penpot/dockerfiles/penpot-mcp
```

Si tus nodos son ARM64, cambiar a:
```bash
--platform linux/arm64
```

O para multiarch:
```bash
--platform linux/amd64,linux/arm64
```

## Versión

El Dockerfile usa el branch `develop` del repo oficial. Para usar una versión específica:

1. Cambiar `ARG MCP_VERSION=develop` a un tag específico (si existe)
2. O usar un commit SHA específico modificando el RUN del git clone

## Estructura

El repo penpot-mcp tiene:
- `npm run bootstrap`: instala y build todo
- `npm run start:all`: inicia ambos servidores (plugin en 4400, MCP en 4401)
