//go:build integration

package history

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRepositoryByVINAgainstPostgres(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	vin := "1HGCM82633A004352"
	_, _ = db.Exec(ctx, "DELETE FROM vehicles WHERE vin=$1", vin)
	defer db.Exec(context.Background(), "DELETE FROM vehicles WHERE vin=$1", vin)

	var vehicleID string
	err = db.QueryRow(ctx, `INSERT INTO vehicles(vin, make) VALUES($1, 'Honda') RETURNING id::text`, vin).Scan(&vehicleID)
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.Exec(ctx, `
		INSERT INTO vehicle_history_records
		(vehicle_id, record_type, occurred_at, summary, details, source_name, confidence)
		VALUES
		($1, 'service', '2025-01-02', 'Newer service', '{"mileage":42000}', 'integration-test', 0.900),
		($1, 'accident', '2024-01-02', 'Older accident', '{"severity":"minor"}', 'integration-test', 0.800)
	`, vehicleID)
	if err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(db)
	records, err := repo.ByVIN(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	if records[0].Summary != "Newer service" || records[1].Summary != "Older accident" {
		t.Fatalf("records were not returned newest first: %#v", records)
	}
	if records[0].Details["mileage"] != float64(42000) {
		t.Fatalf("unexpected JSON details: %#v", records[0].Details)
	}
}

func TestRepositoryByVINReturnsEmptySliceForUnknownVIN(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	records, err := NewRepository(db).ByVIN(ctx, "JH4KA8260MC000001")
	if err != nil {
		t.Fatal(err)
	}
	if records == nil || len(records) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", records)
	}
}

func TestRepositoryByVINReturnsErrorWhenContextIsCancelled(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}

	db, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = NewRepository(db).ByVIN(ctx, "1HGCM82633A004352")
	if err == nil {
		t.Fatal("expected cancelled context to return an error")
	}
}

func TestRepositoryByVINReturnsErrorAfterPoolIsClosed(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}

	db, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err = NewRepository(db).ByVIN(ctx, "1HGCM82633A004352")
	if err == nil {
		t.Fatal("expected closed pool to return an error")
	}
}

func TestRepositoryPersistsProviderChecksAndDeduplicatesEvidence(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	vin := "WVWZZZ1JZXW000001"
	_, _ = db.Exec(ctx, "DELETE FROM vehicles WHERE vin=$1", vin)
	defer db.Exec(context.Background(), "DELETE FROM vehicles WHERE vin=$1", vin)
	if _, err := db.Exec(ctx, `INSERT INTO vehicles(vin, make) VALUES($1,'Volkswagen')`, vin); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(db)
	checkedAt := time.Now().UTC().Truncate(time.Second)
	evidence := []EvidenceInput{{
		RecordType: "theft", Summary: "Reported stolen", Details: map[string]any{"providerStatus": "match"},
		SourceName: "vincario-stolen", Confidence: 0.95, EvidenceStatus: "reported", Fingerprint: "fixture-fingerprint", CheckedAt: checkedAt,
	}}
	check := ProviderCheckInput{Provider: "vincario-stolen", CheckType: "theft", Status: "match", CheckedAt: checkedAt, ValidUntil: checkedAt.Add(24 * time.Hour), Details: map[string]any{"matchedRecords": 1}}
	if err := repo.SaveProviderResult(ctx, vin, evidence, check); err != nil {
		t.Fatal(err)
	}
	if err := repo.SaveProviderResult(ctx, vin, evidence, check); err != nil {
		t.Fatal(err)
	}

	records, err := repo.ByVIN(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 {
		t.Fatalf("expected deduplicated evidence, got %d records", len(records))
	}
	if records[0].EvidenceStatus != "reported" || records[0].SourceName != "vincario-stolen" {
		t.Fatalf("unexpected record %#v", records[0])
	}
	checks, err := repo.ProviderChecksByVIN(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	if len(checks) != 1 || checks[0].Status != "match" {
		t.Fatalf("unexpected checks %#v", checks)
	}
	fresh, err := repo.FreshProviderCheck(ctx, vin, "vincario-stolen", "theft", checkedAt, true)
	if err != nil {
		t.Fatal(err)
	}
	if !fresh {
		t.Fatal("expected provider check to be fresh")
	}
}

func TestRepositoryProviderBudgetAndCircuitState(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("INTEGRATION_DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	providerName := "integration-provider-budget"
	_, _ = db.Exec(ctx, "DELETE FROM provider_usage_daily WHERE provider=$1", providerName)
	_, _ = db.Exec(ctx, "DELETE FROM provider_runtime_state WHERE provider=$1", providerName)
	defer db.Exec(context.Background(), "DELETE FROM provider_usage_daily WHERE provider=$1", providerName)
	defer db.Exec(context.Background(), "DELETE FROM provider_runtime_state WHERE provider=$1", providerName)

	repo := NewRepository(db)
	now := time.Now().UTC()
	allowed, used, err := repo.ReserveProviderCall(ctx, providerName, now, 2)
	if err != nil || !allowed || used != 1 {
		t.Fatalf("unexpected first reservation allowed=%v used=%d err=%v", allowed, used, err)
	}
	allowed, used, err = repo.ReserveProviderCall(ctx, providerName, now, 2)
	if err != nil || !allowed || used != 2 {
		t.Fatalf("unexpected second reservation allowed=%v used=%d err=%v", allowed, used, err)
	}
	allowed, used, err = repo.ReserveProviderCall(ctx, providerName, now, 2)
	if err != nil || allowed || used != 2 {
		t.Fatalf("expected exhausted budget allowed=%v used=%d err=%v", allowed, used, err)
	}

	if _, err := repo.RecordProviderFailure(ctx, providerName, now, 2, time.Minute); err != nil {
		t.Fatal(err)
	}
	runtime, err := repo.RecordProviderFailure(ctx, providerName, now.Add(time.Second), 2, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.ConsecutiveFailures != 2 || runtime.CircuitOpenUntil == nil {
		t.Fatalf("expected open circuit after threshold, got %#v", runtime)
	}
	if err := repo.RecordProviderSuccess(ctx, providerName, now.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	runtime, err = repo.ProviderRuntime(ctx, providerName)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.ConsecutiveFailures != 0 || runtime.CircuitOpenUntil != nil || runtime.TotalSuccesses != 1 || runtime.TotalFailures != 2 {
		t.Fatalf("unexpected reset runtime %#v", runtime)
	}
}
