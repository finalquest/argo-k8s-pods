FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY index.js .
COPY tsconfig.json .
COPY src ./src

CMD ["npm", "start"]

# Version: v3.2.0 - Add email support for async/lazy downloads
