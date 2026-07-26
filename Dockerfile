# tradePulseNode — ローカル確認用（Web UI のみ）
# ※ gsaxo 本番Botは起動しない（ConoHa の pm2 と二重発注を避ける）
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=3052
EXPOSE 3052

CMD ["node", "app.js"]
