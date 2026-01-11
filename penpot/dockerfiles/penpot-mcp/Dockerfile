FROM node:20-bookworm-slim AS build
WORKDIR /app

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Clonar fork desde GitHub
ARG MCP_VERSION=develop
RUN git clone --depth 1 --branch ${MCP_VERSION} https://github.com/finalquest/penpot-mcp.git . || \
    git clone --depth 1 https://github.com/finalquest/penpot-mcp.git .

# Instalar dependencias del package.json raíz primero (necesario para concurrently)
RUN npm install

# Variables de entorno para la configuración del plugin
ARG VITE_MCP_WS_URL=wss://penpot-mcp.finalq.xyz/ws
ENV VITE_MCP_WS_URL=${VITE_MCP_WS_URL}
ARG VITE_ALLOWED_HOSTS=penpot-plugin.finalq.xyz,localhost,0.0.0.0
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}

# Crear script wrapper para el plugin que use --host 0.0.0.0
RUN echo '#!/bin/sh\nset -e\nexport VITE_MCP_WS_URL=${VITE_MCP_WS_URL}\nexport VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}\ncd /app/penpot-plugin\n# Build inicial\nvite build\n# Ejecutar watch en background y preview en foreground\nvite build --watch &\nBUILD_PID=$!\nsleep 3\n# Iniciar preview server que escucha en 0.0.0.0 con las variables de entorno exportadas\nvite preview --host 0.0.0.0 --port 4400 &\nPREVIEW_PID=$!\n# Esperar a que ambos procesos terminen\nwait $BUILD_PID $PREVIEW_PID' > penpot-plugin/start-dev.sh && \
    chmod +x penpot-plugin/start-dev.sh

# Modificar package.json para usar el script
RUN cd penpot-plugin && \
    node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json')); pkg.scripts.dev = 'sh start-dev.sh'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

# Instalar y build de todos los subproyectos (sin start)
RUN npm run install:all && npm run build:all

FROM node:20-bookworm-slim
WORKDIR /app

# Instalar curl para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Variables de entorno para el plugin (necesarias en runtime para vite preview)
ARG VITE_MCP_WS_URL=wss://penpot-mcp.finalq.xyz/ws
ARG VITE_ALLOWED_HOSTS=penpot-plugin.finalq.xyz,localhost,0.0.0.0

# Copiar todo lo necesario (monorepo con múltiples paquetes)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/common ./common
COPY --from=build /app/mcp-server ./mcp-server
COPY --from=build /app/penpot-plugin ./penpot-plugin

ENV NODE_ENV=production
ENV PLUGIN_PORT=4400
ENV MCP_PORT=4401
# Variables de entorno para el plugin (necesarias en runtime para vite preview)
ENV VITE_MCP_WS_URL=${VITE_MCP_WS_URL}
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4400/manifest.json || exit 1

EXPOSE 4400 4401

# Usar start:all que ejecuta ambos servidores
CMD ["npm","run","start:all"]
