FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .

CMD ["node", "index.js"]

# Version: v2.2.0 - Feature: Add pagination for >5 results
