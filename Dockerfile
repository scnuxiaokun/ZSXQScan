FROM node:22-alpine

RUN apk add tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo Asia/Shanghai > /etc/timezone && \
    apk del tzdata

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY . .

EXPOSE 80

CMD ["node", "server.js"]
