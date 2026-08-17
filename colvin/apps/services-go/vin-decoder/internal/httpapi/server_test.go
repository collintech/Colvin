package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testAPIKey = "01234567890123456789012345678901"

func TestHealthDoesNotRequireInternalKey(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	res := httptest.NewRecorder()
	New(testAPIKey).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
}

func TestDecodeRequiresInternalKey(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/decode", strings.NewReader(`{"vin":"1HGCM82633A004352"}`))
	res := httptest.NewRecorder()
	New(testAPIKey).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}

func TestDecodeRejectsUnknownJSONFields(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/decode", strings.NewReader(`{"vin":"1HGCM82633A004352","extra":true}`))
	req.Header.Set("x-internal-api-key", testAPIKey)
	res := httptest.NewRecorder()
	New(testAPIKey).Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadRequest)
	}
}
