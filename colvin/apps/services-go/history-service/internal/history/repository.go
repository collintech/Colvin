package history

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Record struct {
	ID                string         `json:"id"`
	RecordType        string         `json:"recordType"`
	OccurredAt        *string        `json:"occurredAt"`
	Country           *string        `json:"country"`
	Jurisdiction      *string        `json:"jurisdiction"`
	Summary           string         `json:"summary"`
	Details           map[string]any `json:"details"`
	SourceName        string         `json:"sourceName"`
	SourceReference   *string        `json:"sourceReference"`
	Confidence        float64        `json:"confidence"`
	EvidenceStatus    string         `json:"evidenceStatus"`
	ProviderEventID   *string        `json:"providerEventId"`
	ObservedAt        string         `json:"observedAt"`
	ProviderCheckedAt *string        `json:"providerCheckedAt"`
}

type ProviderCheck struct {
	Provider   string         `json:"provider"`
	CheckType  string         `json:"checkType"`
	Status     string         `json:"status"`
	CheckedAt  string         `json:"checkedAt"`
	ValidUntil string         `json:"validUntil"`
	Warning    *string        `json:"warning"`
	Details    map[string]any `json:"details"`
}

type EvidenceInput struct {
	RecordType      string
	OccurredAt      *time.Time
	Country         *string
	Jurisdiction    *string
	Summary         string
	Details         map[string]any
	SourceName      string
	SourceReference *string
	Confidence      float64
	EvidenceStatus  string
	ProviderEventID *string
	Fingerprint     string
	CheckedAt       time.Time
}

type ProviderCheckInput struct {
	Provider   string
	CheckType  string
	Status     string
	CheckedAt  time.Time
	ValidUntil time.Time
	Warning    *string
	Details    map[string]any
}

type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository     { return &Repository{db: db} }
func (r *Repository) Ping(ctx context.Context) error { return r.db.Ping(ctx) }

func (r *Repository) ByVIN(ctx context.Context, vin string) ([]Record, error) {
	rows, err := r.db.Query(ctx, `
		SELECT h.id::text,h.record_type,to_char(h.occurred_at,'YYYY-MM-DD'),h.country,h.jurisdiction,
		       h.summary,h.details,h.source_name,h.source_reference,h.confidence::float8,h.evidence_status,
		       h.provider_event_id,to_char(h.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       CASE WHEN h.provider_checked_at IS NULL THEN NULL ELSE to_char(h.provider_checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END
		FROM vehicle_history_records h
		JOIN vehicles v ON v.id=h.vehicle_id
		WHERE v.vin=$1
		ORDER BY h.occurred_at DESC NULLS LAST,h.observed_at DESC,h.created_at DESC`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []Record{}
	for rows.Next() {
		var rec Record
		var details []byte
		if err := rows.Scan(&rec.ID, &rec.RecordType, &rec.OccurredAt, &rec.Country, &rec.Jurisdiction, &rec.Summary, &details, &rec.SourceName, &rec.SourceReference, &rec.Confidence, &rec.EvidenceStatus, &rec.ProviderEventID, &rec.ObservedAt, &rec.ProviderCheckedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(details, &rec.Details); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}

func (r *Repository) ProviderChecksByVIN(ctx context.Context, vin string) ([]ProviderCheck, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.provider,c.check_type,c.status,
		       to_char(c.checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(c.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),c.warning,c.details
		FROM history_provider_checks c JOIN vehicles v ON v.id=c.vehicle_id
		WHERE v.vin=$1 ORDER BY c.checked_at DESC`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	checks := []ProviderCheck{}
	for rows.Next() {
		var check ProviderCheck
		var details []byte
		if err := rows.Scan(&check.Provider, &check.CheckType, &check.Status, &check.CheckedAt, &check.ValidUntil, &check.Warning, &details); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(details, &check.Details); err != nil {
			return nil, err
		}
		checks = append(checks, check)
	}
	return checks, rows.Err()
}

func (r *Repository) FreshProviderCheck(ctx context.Context, vin, providerName, checkType string, now time.Time) (bool, error) {
	var fresh bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM history_provider_checks c JOIN vehicles v ON v.id=c.vehicle_id
		WHERE v.vin=$1 AND c.provider=$2 AND c.check_type=$3 AND c.valid_until>$4
	)`, vin, providerName, checkType, now).Scan(&fresh)
	return fresh, err
}

func (r *Repository) SaveProviderResult(ctx context.Context, vin string, evidence []EvidenceInput, check ProviderCheckInput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // no-op after commit

	var vehicleID string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM vehicles WHERE vin=$1`, vin).Scan(&vehicleID); err != nil {
		return fmt.Errorf("history vehicle lookup: %w", err)
	}

	for _, item := range evidence {
		details, err := json.Marshal(item.Details)
		if err != nil {
			return fmt.Errorf("history evidence details: %w", err)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO vehicle_history_records
			(vehicle_id,record_type,occurred_at,country,jurisdiction,summary,details,source_name,source_reference,
			 confidence,evidence_status,provider_event_id,evidence_fingerprint,observed_at,provider_checked_at)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)
			ON CONFLICT (vehicle_id,source_name,evidence_fingerprint) WHERE evidence_fingerprint IS NOT NULL
			DO UPDATE SET occurred_at=EXCLUDED.occurred_at,country=EXCLUDED.country,jurisdiction=EXCLUDED.jurisdiction,
			 summary=EXCLUDED.summary,details=EXCLUDED.details,source_reference=EXCLUDED.source_reference,
			 confidence=EXCLUDED.confidence,evidence_status=EXCLUDED.evidence_status,provider_event_id=EXCLUDED.provider_event_id,
			 observed_at=now(),provider_checked_at=EXCLUDED.provider_checked_at`,
			vehicleID, item.RecordType, item.OccurredAt, item.Country, item.Jurisdiction, item.Summary, details, item.SourceName, item.SourceReference,
			item.Confidence, item.EvidenceStatus, item.ProviderEventID, item.Fingerprint, item.CheckedAt)
		if err != nil {
			return fmt.Errorf("history evidence upsert: %w", err)
		}
	}

	details, err := json.Marshal(check.Details)
	if err != nil {
		return fmt.Errorf("history provider check details: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO history_provider_checks(vehicle_id,provider,check_type,status,checked_at,valid_until,warning,details)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT(vehicle_id,provider,check_type)
		DO UPDATE SET status=EXCLUDED.status,checked_at=EXCLUDED.checked_at,valid_until=EXCLUDED.valid_until,
		 warning=EXCLUDED.warning,details=EXCLUDED.details,updated_at=now()`,
		vehicleID, check.Provider, check.CheckType, check.Status, check.CheckedAt, check.ValidUntil, check.Warning, details)
	if err != nil {
		return fmt.Errorf("history provider check upsert: %w", err)
	}
	return tx.Commit(ctx)
}
