FROM node:24.20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY apps/web-client/package.json apps/web-client/package.json
RUN npm ci --omit=dev --workspace apps/api-gateway

FROM node:24.20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node apps/api-gateway ./apps/api-gateway
COPY --chown=node:node database/migrations ./database/migrations

WORKDIR /app/apps/api-gateway
USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
