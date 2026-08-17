package main

import (
	"colvin/vin-decoder/internal/httpapi"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	port := get("PORT", "8081")
	key := os.Getenv("INTERNAL_API_KEY")
	if len(key) < 24 {
		log.Fatal("INTERNAL_API_KEY must be configured")
	}
	srv := &http.Server{Addr: ":" + port, Handler: httpapi.New(key).Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("vin decoder listening on %s", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}
func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
