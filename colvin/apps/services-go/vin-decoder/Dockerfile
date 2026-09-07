FROM golang:1.27.1-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/vin-decoder ./cmd/server

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates wget \
    && addgroup -S -g 10001 colvin \
    && adduser -S -D -H -u 10001 -G colvin colvin
COPY --from=build /out/vin-decoder /usr/local/bin/vin-decoder
USER 10001:10001
EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8081/health >/dev/null || exit 1

CMD ["vin-decoder"]
