package main

import (
	"colvin/history-service/internal/history"
	"colvin/history-service/internal/httpapi"
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	key := os.Getenv("INTERNAL_API_KEY")
	if len(key) < 24 {
		log.Fatal("INTERNAL_API_KEY must be configured")
	}
	port := get("PORT", "8082")
	srv := &http.Server{Addr: ":" + port, Handler: httpapi.New(key, history.NewRepository(db)).Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("history service listening on %s", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}
func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
