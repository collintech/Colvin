package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"colvin/history-service/internal/history"
)

type fakeService struct {
	report    history.Report
	lookupErr error
	pingErr   error
	lastVIN   string
}

func (f *fakeService) Lookup(_ context.Context, vin string) (history.Report, error) {
	f.lastVIN = vin
	return f.report, f.lookupErr
}
func (f *fakeService) Ping(context.Context) error { return f.pingErr }

const testKey = "012345678901234567890123"

func TestHealthDoesNotDependOnDatabase(t *testing.T) {
	s := &fakeService{pingErr: errors.New("db unavailable")}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	res := httptest.NewRecorder()
	New(testKey, s).Handler().ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("expected 200, got %d", res.Code)
	}
}
func TestReadinessFailsWhenDatabaseUnavailable(t *testing.T) {
	s := &fakeService{pingErr: errors.New("db unavailable")}
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	res := httptest.NewRecorder()
	New(testKey, s).Handler().ServeHTTP(res, req)
	if res.Code != 503 {
		t.Fatalf("expected 503, got %d", res.Code)
	}
}
func TestHistoryRequiresInternalAuthentication(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1HGCM82633A004352", nil)
	res := httptest.NewRecorder()
	New(testKey, &fakeService{}).Handler().ServeHTTP(res, req)
	if res.Code != 401 {
		t.Fatalf("expected 401, got %d", res.Code)
	}
}
func TestHistoryRejectsInvalidVIN(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/history/INVALID", nil)
	req.Header.Set("x-internal-api-key", testKey)
	res := httptest.NewRecorder()
	New(testKey, &fakeService{}).Handler().ServeHTTP(res, req)
	if res.Code != 400 {
		t.Fatalf("expected 400, got %d", res.Code)
	}
}
func TestHistoryNormalizesVINAndReturnsReport(t *testing.T) {
	s := &fakeService{report: history.Report{Records: []history.Record{{ID: "1", RecordType: "service", Summary: "Serviced", SourceName: "test", Confidence: 1, EvidenceStatus: "observed", ObservedAt: "2026-01-01T00:00:00Z"}}, Summary: history.Summary{TotalRecords: 1, Counts: map[string]int{"service": 1}, TheftStatus: "unknown", Warnings: []string{}, ProviderChecks: []history.ProviderCheck{}}}}
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1hgcm82633a004352", nil)
	req.Header.Set("x-internal-api-key", testKey)
	res := httptest.NewRecorder()
	New(testKey, s).Handler().ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if s.lastVIN != "1HGCM82633A004352" {
		t.Fatalf("expected normalized VIN, got %q", s.lastVIN)
	}
}
func TestHistoryFailureIsControlled(t *testing.T) {
	s := &fakeService{lookupErr: errors.New("query failed")}
	req := httptest.NewRequest(http.MethodGet, "/v1/history/1HGCM82633A004352", nil)
	req.Header.Set("x-internal-api-key", testKey)
	res := httptest.NewRecorder()
	New(testKey, s).Handler().ServeHTTP(res, req)
	if res.Code != 500 {
		t.Fatalf("expected 500, got %d", res.Code)
	}
}
