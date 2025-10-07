# Base image
FROM node:24-alpine AS base
WORKDIR /app
RUN apk update && \
    apk add bash
EXPOSE 3000

# Make pnpm available in all stages
RUN corepack enable && corepack prepare pnpm@9 --activate

# Builder stage
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
# Install all dependencies (including dev) in builder
RUN pnpm install --frozen-lockfile

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy dependencies and source (build happens at container start)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN chmod +x /app/scripts/migrate_with_backup.sh

# Generate build at startup and run Next.js
ENTRYPOINT ["sh", "-c", "POSTGRES_URL=$POSTGRES_URL /app/scripts/migrate_with_backup.sh && pnpm run build && pnpm start"]

# Development stage
FROM base AS dev
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
CMD ["pnpm", "dev"]