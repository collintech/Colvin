package httpapi

import (
	"colvin/history-service/internal/history"
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var vinRE = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)

type Server struct {
	apiKey string
	repo   *history.Repository
}

func New(apiKey string, repo *history.Repository) *Server { return &Server{apiKey: apiKey, repo: repo} }
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.Handle("GET /v1/history/{vin}", s.internal(http.HandlerFunc(s.get)))
	return mux
}
func (s *Server) internal(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-internal-api-key") != s.apiKey {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	vin := strings.ToUpper(r.PathValue("vin"))
	if !vinRE.MatchString(vin) {
		writeJSON(w, 400, map[string]string{"error": "invalid VIN"})
		return
	}
	ctx, cancel := contextWithTimeout(r, 3*time.Second)
	defer cancel()
	records, err := s.repo.ByVIN(ctx, vin)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "history lookup failed"})
		return
	}
	writeJSON(w, 200, map[string]any{"records": records, "summary": map[string]any{"totalRecords": len(records)}})
}
func contextWithTimeout(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
