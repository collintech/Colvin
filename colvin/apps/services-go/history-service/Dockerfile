FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /history-service ./cmd/server
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && adduser -D -H app
COPY --from=build /history-service /usr/local/bin/history-service
USER app
EXPOSE 8082
CMD ["history-service"]
