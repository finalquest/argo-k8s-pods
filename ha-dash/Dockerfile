FROM node:20

# Instalar git (ya viene incluido en node:20, pero por si acaso)
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar scripts de entrypoint
COPY entrypoint-backend.sh /entrypoint-backend.sh
COPY entrypoint-frontend.sh /entrypoint-frontend.sh
RUN chmod +x /entrypoint-backend.sh /entrypoint-frontend.sh

# Usar entrypoint-backend.sh por defecto (puede ser sobrescrito con --entrypoint o command en docker run)
CMD ["/entrypoint-backend.sh"]
