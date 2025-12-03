FROM node:20-alpine

RUN apk -U add openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3000
CMD ["node", "server.js"]
