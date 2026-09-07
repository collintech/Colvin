FROM node:24.20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web-client/package.json apps/web-client/package.json
COPY apps/api-gateway/package.json apps/api-gateway/package.json
RUN npm ci --workspace apps/web-client

COPY apps/web-client ./apps/web-client
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm --workspace apps/web-client run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY apps/web-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-client/dist /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
