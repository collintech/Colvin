package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"colvin/history-service/internal/history"
	"colvin/history-service/internal/httpapi"
	"colvin/history-service/internal/provider"
	"github.com/jackc/pgx/v5/pgxpool"
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
	mode, err := history.ParseMode(get("HISTORY_PROVIDER_MODE", "local"))
	if err != nil {
		log.Fatal(err)
	}
	timeout := time.Duration(getInt("HISTORY_PROVIDER_TIMEOUT_MS", 4000)) * time.Millisecond
	refreshTTL := time.Duration(getInt("HISTORY_PROVIDER_REFRESH_TTL_HOURS", 24)) * time.Hour
	errorTTL := time.Duration(getInt("HISTORY_PROVIDER_ERROR_TTL_MINUTES", 15)) * time.Minute
	var checker provider.Checker = provider.Disabled{}
	if mode != "local" {
		checker = provider.NewVincarioStolenChecker(get("VINCARIO_BASE_URL", "https://api.vincario.com/3.2"), os.Getenv("VINCARIO_API_KEY"), os.Getenv("VINCARIO_SECRET_KEY"), timeout)
	}
	repo := history.NewRepository(db)
	service := history.NewService(repo, checker, mode, refreshTTL, errorTTL)
	port := get("PORT", "8082")
	srv := &http.Server{Addr: ":" + port, Handler: httpapi.New(key, service).Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("history service listening on %s (provider mode=%s)", srv.Addr, mode)
	log.Fatal(srv.ListenAndServe())
}

func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func getInt(k string, d int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return d
}
