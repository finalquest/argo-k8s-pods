FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY index.js .

CMD ["node", "index.js"]

# Version: v2.1.3 - Fix: Show 5 results when >5 available, remove refinement barrier
