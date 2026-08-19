package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"colvin/history-service/internal/history"
)

type fakeRepo struct {
	records  []history.Record
	byVINErr error
	pingErr  error
	lastVIN  string
}

func (f *fakeRepo) ByVIN(_ context.Context, vin string) ([]history.Record, error) {
	f.lastVIN = vin
	return f.records, f.byVINErr
}
func (f *fakeRepo) Ping(context.Context) error { return f.pingErr }

func TestHealthDoesNotDependOnDatabase(t *testing.T) {
	repo := &fakeRepo{pingErr: errors.New("db unavailable")}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	res := httptest.NewRecorder()
	New("012345678901234567890123", repo).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
}
func TestReadinessFailsWhenDatabaseUnavailable(t *testing.T) {
	repo := &fakeRepo{pingErr: errors.New("db unavailable")}
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	res := httptest.NewRecorder()
	New("012345678901234567890123", repo).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", res.Code)
	}
}
func TestHistoryRequiresInternalAuthentication(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1HGCM82633A004352", nil)
	res := httptest.NewRecorder()
	New("012345678901234567890123", &fakeRepo{}).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", res.Code)
	}
}
func TestHistoryRejectsInvalidVIN(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/history/INVALID", nil)
	req.Header.Set("x-internal-api-key", "012345678901234567890123")
	res := httptest.NewRecorder()
	New("012345678901234567890123", &fakeRepo{}).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}
func TestHistoryNormalizesVINAndReturnsRecords(t *testing.T) {
	repo := &fakeRepo{records: []history.Record{{ID: "1", RecordType: "service", Summary: "Serviced", SourceName: "test", Confidence: 1}}}
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1hgcm82633a004352", nil)
	req.Header.Set("x-internal-api-key", "012345678901234567890123")
	res := httptest.NewRecorder()
	New("012345678901234567890123", repo).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if repo.lastVIN != "1HGCM82633A004352" {
		t.Fatalf("expected normalized VIN, got %q", repo.lastVIN)
	}
}
func TestHistoryRepositoryFailureIsControlled(t *testing.T) {
	repo := &fakeRepo{byVINErr: errors.New("query failed")}
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1HGCM82633A004352", nil)
	req.Header.Set("x-internal-api-key", "012345678901234567890123")
	res := httptest.NewRecorder()
	New("012345678901234567890123", repo).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", res.Code)
	}
}
