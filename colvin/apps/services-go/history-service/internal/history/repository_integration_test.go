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
