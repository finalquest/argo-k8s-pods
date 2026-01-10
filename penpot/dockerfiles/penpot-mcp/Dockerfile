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
