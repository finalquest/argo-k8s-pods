FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .

CMD ["node", "index.js"]

# Version: v2.2.1 - Fix: Change search limit from 5 to 100 for proper pagination
