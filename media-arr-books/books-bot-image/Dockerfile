FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .

CMD ["node", "index.js"]

# Version: v2.1.1 - Fix: Correct bookCount when selecting author from menu
