FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Unprivileged nginx: runs as a non-root user and keeps pid/temp files under /tmp, so only the
# server block needs replacing. Port 3000 is above 1024, so no extra capabilities are needed.
FROM nginxinc/nginx-unprivileged:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
