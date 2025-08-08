# Základní image
FROM node:24-alpine AS base
WORKDIR /app
EXPOSE 3000

# Builder stage
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci

# Production stage
FROM base AS production
ENV NODE_ENV=production
COPY . .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
CMD npm run build && npm start

# Development stage
FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm install
COPY . .
CMD npm run dev