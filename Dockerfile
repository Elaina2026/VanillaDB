# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Runtime Stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_NO_WARNINGS=1
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

# Create data and backups storage directories
RUN mkdir -p /app/data /app/data/storage /app/data/backups

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "dist/src/server/index.js"]
