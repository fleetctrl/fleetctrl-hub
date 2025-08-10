# Base image
FROM node:24-alpine AS base
WORKDIR /app
EXPOSE 3000

# Builder stage
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Zkopíruj buildnutý Next.js a potřebné soubory
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN npm ci --omit=dev

# Zkopíruj skript pro generování env.js
COPY scripts/generate-env.ts ./scripts/generate-env.ts

# Při startu vygeneruj env.js a spusť Next.js
ENTRYPOINT ["sh", "-c", "node scripts/generate-env.ts && npm start"]

# Development stage
FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm install
COPY . .
CMD npm run dev