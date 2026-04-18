# Base com Playwright e Chromium prontos (compatível com ^1.56.0)
FROM mcr.microsoft.com/playwright:v1.56.0-jammy

# Diretório de trabalho
WORKDIR /app

# Copiar apenas manifestos para otimizar cache de dependências
COPY package*.json ./

# Instalar dependências (omitindo dev)
RUN npm ci --omit=dev

# Copiar o restante do código
COPY . .

# Ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Expor porta da API
EXPOSE 3000

# Comando de inicialização (API local) sem npm wrapper
# Evita logs de "npm error signal SIGTERM" em reinícios controlados
CMD ["node", "api-server.js"]
