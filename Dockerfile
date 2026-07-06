# ─── Build Frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ─── Backend ─────────────────────────────────────────────────
FROM node:20-alpine AS backend

# Dependências do sharp, Prisma (openssl/libc6-compat) e pacotes que exigem compilação/git
RUN apk add --no-cache openssl libc6-compat git vips-dev python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Diretório de sessões do WhatsApp
RUN mkdir -p /app/auth_state

VOLUME ["/app/auth_state"]

EXPOSE 3000

# Roda migração e inicia o servidor
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server/index.js"]
