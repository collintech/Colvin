package main

import (
	"colvin/vin-decoder/internal/httpapi"
	"colvin/vin-decoder/internal/provider"
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
	mode := get("VIN_PROVIDER_MODE", "local")
	if err := provider.ValidateMode(mode); err != nil {
		log.Fatal(err)
	}
	timeout := durationMS(get("VIN_PROVIDER_TIMEOUT_MS", "4000"), 4*time.Second)
	remote := provider.NewVincarioDecoder(
		get("VINCARIO_BASE_URL", "https://api.vincario.com/3.2"),
		os.Getenv("VINCARIO_API_KEY"),
		os.Getenv("VINCARIO_SECRET_KEY"),
		timeout,
	)
	if (mode == "hybrid" || mode == "vincario") && (remote.APIKey == "" || remote.SecretKey == "") {
		log.Fatal("VINCARIO_API_KEY and VINCARIO_SECRET_KEY must be configured for hybrid/vincario mode")
	}

	var decoder provider.Decoder = provider.LocalDecoder{}
	if mode == "hybrid" {
		decoder = provider.HybridDecoder{Local: provider.LocalDecoder{}, Remote: remote}
	}
	if mode == "vincario" {
		decoder = provider.HybridDecoder{Local: provider.LocalDecoder{}, Remote: remote, Strict: true}
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.New(key, decoder).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("vin decoder listening on %s provider_mode=%s", srv.Addr, mode)
	log.Fatal(srv.ListenAndServe())
}

func get(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func durationMS(raw string, fallback time.Duration) time.Duration {
	d, err := time.ParseDuration(raw + "ms")
	if err != nil {
		return fallback
	}
	return d
}
