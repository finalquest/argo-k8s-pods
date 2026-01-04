FROM node:20-bullseye AS base
ARG LIBSSL11_DEB_URL="https://snapshot.debian.org/archive/debian-security/20211022T150748Z/pool/updates/main/o/openssl/libssl1.1_1.1.1d-0+deb10u7_amd64.deb"
ENV LIBSSL11_DEB_URL=${LIBSSL11_DEB_URL}
WORKDIR /app

FROM base AS deps
RUN apt-get update && \
    apt-get install -y python3 make g++ openssl wget ca-certificates && \
    wget -q -O /tmp/libssl1.1.deb "${LIBSSL11_DEB_URL}" && \
    dpkg-deb -x /tmp/libssl1.1.deb /tmp/libssl && \
    cp /tmp/libssl/usr/lib/x86_64-linux-gnu/libssl.so.1.1 /usr/lib/x86_64-linux-gnu/ && \
    cp /tmp/libssl/usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /usr/lib/x86_64-linux-gnu/ && \
    rm -rf /tmp/libssl /tmp/libssl1.1.deb && \
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
ARG LIBSSL11_DEB_URL="https://snapshot.debian.org/archive/debian-security/20211022T150748Z/pool/updates/main/o/openssl/libssl1.1_1.1.1d-0+deb10u7_amd64.deb"
ENV LIBSSL11_DEB_URL=${LIBSSL11_DEB_URL}
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && \
    apt-get install -y openssl wget ca-certificates && \
    wget -q -O /tmp/libssl1.1.deb "${LIBSSL11_DEB_URL}" && \
    dpkg-deb -x /tmp/libssl1.1.deb /tmp/libssl && \
    cp /tmp/libssl/usr/lib/x86_64-linux-gnu/libssl.so.1.1 /usr/lib/x86_64-linux-gnu/ && \
    cp /tmp/libssl/usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /usr/lib/x86_64-linux-gnu/ && \
    rm -rf /tmp/libssl /tmp/libssl1.1.deb && \
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
