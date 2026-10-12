FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: the only native install step is the optional `bufferutil` WebSocket speed-up
# (via xumm-sdk), which has no musl/arm64 prebuild and would need a compiler. It is not required.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/index.js"]
