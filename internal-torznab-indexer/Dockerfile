FROM node:20-alpine

WORKDIR /app

COPY package.json ./package.json
RUN apk add --no-cache curl && npm install --omit=dev
COPY src ./src
COPY data_dir ./data_dir

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data_dir

EXPOSE 8080

CMD ["node", "src/index.js"]
