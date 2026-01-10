FROM node:20-bookworm-slim AS build
WORKDIR /app

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Clonar repo con branch específico
# El repo usa 'develop' como branch principal
ARG MCP_VERSION=develop
RUN git clone --depth 1 --branch ${MCP_VERSION} https://github.com/penpot/penpot-mcp.git . || \
    git clone --depth 1 https://github.com/penpot/penpot-mcp.git .

# Instalar dependencias del package.json raíz primero (necesario para concurrently)
RUN npm install

# Modificar el script dev del plugin para que escuche en 0.0.0.0
# Esto permite que el healthcheck de Kubernetes funcione correctamente
# Instalar jq si no está disponible
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/* || true
# Crear un script wrapper que ejecute build inicial y luego preview con watch
# El problema es que vite build --watch nunca termina, así que necesitamos ejecutarlos en paralelo
RUN echo '#!/bin/sh\nset -e\ncd /app/penpot-plugin\n# Build inicial\nvite build\n# Ejecutar watch en background y preview en foreground\nvite build --watch &\nBUILD_PID=$!\nsleep 3\n# Iniciar preview server que escucha en 0.0.0.0\nvite preview --host 0.0.0.0 --port 4400 &\nPREVIEW_PID=$!\n# Esperar a que ambos procesos terminen\nwait $BUILD_PID $PREVIEW_PID' > penpot-plugin/start-dev.sh && \
    chmod +x penpot-plugin/start-dev.sh && \
    jq '.scripts.dev = "/app/penpot-plugin/start-dev.sh"' penpot-plugin/package.json > /tmp/plugin-pkg.json && \
    mv /tmp/plugin-pkg.json penpot-plugin/package.json

# Instalar y build de todos los subproyectos (sin start)
# bootstrap ejecuta install:all + build:all + start:all, pero solo queremos install y build
RUN npm run install:all && npm run build:all

FROM node:20-bookworm-slim
WORKDIR /app

# Instalar curl para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar todo lo necesario (monorepo con múltiples paquetes)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/common ./common
COPY --from=build /app/mcp-server ./mcp-server
COPY --from=build /app/penpot-plugin ./penpot-plugin

ENV NODE_ENV=production
ENV PLUGIN_PORT=4400
ENV MCP_PORT=4401

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4400/manifest.json || exit 1

EXPOSE 4400 4401

# Usar start:all que ejecuta ambos servidores
# Nota: start:all usa 'dev' para el plugin, pero en producción funciona igual
CMD ["npm","run","start:all"]
