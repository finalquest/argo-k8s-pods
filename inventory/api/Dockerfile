FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

FROM deps AS build
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev --ignore-scripts && \
  npx prisma generate

EXPOSE 3000
CMD ["node", "dist/src/main"]
