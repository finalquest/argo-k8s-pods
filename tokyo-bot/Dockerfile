FROM node:20-bullseye

RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN useradd --create-home --shell /bin/bash bot \
  && mkdir -p /data/repos /home/bot/.codex \
  && chown -R bot:bot /app /data /home/bot/.codex

USER bot
ENV TOKYO_REPO_DIR=/data/repos \
    NODE_ENV=production

VOLUME ["/data"]

CMD ["node", "src/index.js"]
