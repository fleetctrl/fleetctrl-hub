# Go Builder
FROM golang:1.25-alpine AS go-builder
WORKDIR /app
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ .
# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-X 'main.runningInDocker=true'" -o fleetctrl-api ./cmd/api/

# Base image
FROM node:24-bookworm-slim AS base
WORKDIR /app
EXPOSE 3000
EXPOSE 8080

# Install Postgres client tools needed by the startup migration script
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
COPY . /app

# Copy API binary
COPY --from=go-builder /app/fleetctrl-api /app/fleetctrl-api

RUN chmod +x /app/scripts/migrate_with_backup.sh

# Generate build at startup and run Next.js once migrations have been applied
# Run API in background
# Run migrations, then start API in background and Next.js in foreground
CMD /app/scripts/migrate_with_backup.sh && /app/fleetctrl-api & pnpm build && pnpm start

# Development stage
FROM base AS dev
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
CMD ["pnpm", "dev"]