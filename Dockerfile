# syntax=docker/dockerfile:1

# ---------- Base with system deps (for puppeteer/chromium etc.) ----------
FROM node:20-bullseye AS base

# Install fonts and chromium for puppeteer compatibility
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       libatk-bridge2.0-0 \
       libnss3 \
       libxss1 \
       libasound2 \
       libxshmfence1 \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ---------- Build client ----------
FROM base AS build-client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- Build server (TypeScript -> JS) ----------
FROM base AS build-server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---------- Production runtime ----------
FROM node:20-bullseye-slim AS runtime

# Install chromium and minimal deps for runtime puppeteer usage
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       libnss3 \
       libxss1 \
       libasound2 \
       libxshmfence1 \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=8080

WORKDIR /app

# Install only production deps for server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server build output
COPY --from=build-server /app/server/dist ./server/dist

# Copy client build into server public dir to be served by Express
COPY --from=build-client /app/client/build ./server/dist/public

EXPOSE 8080

# Run as non-root user
RUN chown -R node:node /app
USER node

CMD ["node", "server/dist/index.js"]
