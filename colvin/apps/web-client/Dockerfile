FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/web-client/package.json apps/web-client/package.json
COPY apps/api-gateway/package.json apps/api-gateway/package.json
RUN npm install --workspace apps/web-client
COPY apps/web-client ./apps/web-client
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm --workspace apps/web-client run build
FROM nginx:1.27-alpine
COPY apps/web-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-client/dist /usr/share/nginx/html
EXPOSE 80
