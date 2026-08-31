package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"colvin/history-service/internal/history"
)

var vinRE = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)

type historyLookup interface {
	Lookup(context.Context, string) (history.Report, error)
	Ping(context.Context) error
}

type Server struct {
	apiKey  string
	service historyLookup
}

func New(apiKey string, service historyLookup) *Server {
	return &Server{apiKey: apiKey, service: service}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /ready", s.ready)
	mux.Handle("GET /v1/history/{vin}", s.internal(http.HandlerFunc(s.get)))
	return mux
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.service.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) internal(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.apiKey == "" || r.Header.Get("x-internal-api-key") != s.apiKey {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	vinValue := strings.ToUpper(strings.TrimSpace(r.PathValue("vin")))
	if !vinRE.MatchString(vinValue) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid VIN"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	report, err := s.service.Lookup(ctx, vinValue)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history lookup failed"})
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
