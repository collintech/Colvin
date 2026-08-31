package httpapi

import (
	"colvin/vin-decoder/internal/provider"
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type Server struct {
	apiKey  string
	decoder provider.Decoder
}

func New(apiKey string, decoders ...provider.Decoder) *Server {
	d := provider.Decoder(provider.LocalDecoder{})
	if len(decoders) > 0 && decoders[0] != nil {
		d = decoders[0]
	}
	return &Server{apiKey: apiKey, decoder: d}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.Handle("POST /v1/decode", s.internal(http.HandlerFunc(s.decode)))
	return security(mux)
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
func (s *Server) decode(w http.ResponseWriter, r *http.Request) {
	var in struct {
		VIN string `json:"vin"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	d.DisallowUnknownFields()
	if d.Decode(&in) != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid JSON body"})
		return
	}
	out, err := s.decoder.Decode(context.Background(), in.VIN)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if strings.Contains(r.URL.Path, "..") {
			writeJSON(w, 400, map[string]string{"error": "invalid path"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
