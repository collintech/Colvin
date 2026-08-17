FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY apps/web-client/package.json apps/web-client/package.json
RUN npm install --omit=dev --workspace apps/api-gateway

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api-gateway ./apps/api-gateway
WORKDIR /app/apps/api-gateway
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
