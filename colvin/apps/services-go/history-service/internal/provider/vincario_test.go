package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVincarioStolenCheckerNormalizesMatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/stolen-check/1HGCM82633A004352.json") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"stolen":true,"records":[{"country":"IT"}]}`))
	}))
	defer server.Close()

	checker := NewVincarioStolenChecker(server.URL, "key", "secret", time.Second, 2, time.Millisecond)
	result, err := checker.Check(context.Background(), "1hgcm82633a004352", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "match" || len(result.Findings) != 1 {
		t.Fatalf("unexpected result %#v", result)
	}
	if result.Findings[0].RecordType != "theft" || result.Findings[0].EvidenceStatus != "reported" {
		t.Fatalf("unexpected finding %#v", result.Findings[0])
	}
}

func TestVincarioStolenCheckerClearResultCarriesCoverageWarning(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"stolen":false}`))
	}))
	defer server.Close()

	result, err := NewVincarioStolenChecker(server.URL, "key", "secret", time.Second, 2, time.Millisecond).Check(context.Background(), "1HGCM82633A004352", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "clear" || len(result.Findings) != 0 || len(result.Warnings) != 1 {
		t.Fatalf("unexpected result %#v", result)
	}
}

func TestVincarioStolenCheckerRetriesTransientFailure(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"stolen":false}`))
	}))
	defer server.Close()

	result, err := NewVincarioStolenChecker(server.URL, "key", "secret", time.Second, 2, time.Millisecond).Check(context.Background(), "1HGCM82633A004352", nil)
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || result.Attempts != 2 {
		t.Fatalf("expected two attempts, server=%d result=%d", attempts, result.Attempts)
	}
}

func TestVincarioRetriesConsumeAttemptGatePerHTTPCall(t *testing.T) {
	serverAttempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		serverAttempts++
		if serverAttempts == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"stolen":false}`))
	}))
	defer server.Close()

	gateCalls := 0
	gate := func(context.Context) (int, error) {
		gateCalls++
		return gateCalls, nil
	}
	_, err := NewVincarioStolenChecker(server.URL, "key", "secret", time.Second, 2, time.Millisecond).Check(context.Background(), "1HGCM82633A004352", gate)
	if err != nil {
		t.Fatal(err)
	}
	if serverAttempts != 2 || gateCalls != 2 {
		t.Fatalf("expected each HTTP attempt to consume budget, server=%d gate=%d", serverAttempts, gateCalls)
	}
}
