FROM node:20-bullseye AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update && \
    apt-get install -y python3 make g++ openssl && \
    rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

FROM deps AS build
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bullseye AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN npm install --omit=dev --ignore-scripts && \
  npx prisma generate
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
