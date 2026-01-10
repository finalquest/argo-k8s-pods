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

# Modificar la configuración de Vite para permitir el host del plugin
# Instalar jq si no está disponible
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/* || true
# Agregar allowedHosts a la configuración de Vite (archivo TypeScript)
RUN sed -i '/preview: {/a\        allowedHosts: ["penpot-plugin.finalq.xyz", "localhost", "0.0.0.0"],' penpot-plugin/vite.config.ts

# Modificar main.ts para que use el host correcto del MCP Server en lugar de localhost
# El plugin se carga desde penpot-plugin.finalq.xyz, así que el MCP está en penpot-mcp.finalq.xyz
# El WebSocket se expone a través del ingress en /ws, así que usamos el mismo dominio
RUN sed -i 's|new WebSocket("ws://localhost:4402")|new WebSocket((window.location.protocol === "https:" ? "wss://" : "ws://") + "penpot-mcp.finalq.xyz/ws")|g' penpot-plugin/src/main.ts

# Modificar main.ts para que use el host correcto del MCP Server en lugar de localhost
# El plugin se carga desde penpot-plugin.finalq.xyz, así que el MCP está en penpot-mcp.finalq.xyz
RUN sed -i 's|ws://localhost:4402|wss://penpot-mcp.finalq.xyz:4402|g' penpot-plugin/src/main.ts || \
    sed -i 's|new WebSocket("ws://localhost:4402")|new WebSocket("wss://penpot-mcp.finalq.xyz:4402")|g' penpot-plugin/src/main.ts

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
