FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY index.js .
COPY tsconfig.json .
COPY src ./src

CMD ["npm", "start"]

# Version: v2.2.1 - Fix: Change search limit from 5 to 100 for proper pagination
