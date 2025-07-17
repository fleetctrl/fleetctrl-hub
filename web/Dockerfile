FROM node:24-bookworm-slim AS base
RUN apt-get update -y
WORKDIR /app
EXPOSE 3000

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app ./public

CMD npm start

FROM base AS dev
ENV NODE_ENV=development
RUN npm install 
COPY . .
CMD npm run dev