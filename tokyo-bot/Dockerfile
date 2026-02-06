FROM node:20-slim

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false update \
  && apt-get -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    openssh-client \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN useradd --create-home --shell /bin/bash bot \
  && mkdir -p /data/repos \
  && chown -R bot:bot /app /data

USER bot
ENV TOKYO_REPO_DIR=/data/repos \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

VOLUME ["/data"]

CMD ["node", "src/index.js"]
