FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /vin-decoder ./cmd/server
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && adduser -D -H app
COPY --from=build /vin-decoder /usr/local/bin/vin-decoder
USER app
EXPOSE 8081
CMD ["vin-decoder"]
