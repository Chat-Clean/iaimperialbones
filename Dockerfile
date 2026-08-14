FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Os mockups são gravados em disco em tempo de execução — o diretório precisa
# existir e pertencer ao usuário não-root. (É efêmero: some no restart do
# container. Para prévias duráveis, montar um volume aqui.)
RUN mkdir -p assets/mockups && chown -R node:node /app

# Não rodar como root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
