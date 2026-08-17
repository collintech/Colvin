package history

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Record struct {
	ID              string         `json:"id"`
	RecordType      string         `json:"recordType"`
	OccurredAt      *string        `json:"occurredAt"`
	Country         *string        `json:"country"`
	Summary         string         `json:"summary"`
	Details         map[string]any `json:"details"`
	SourceName      string         `json:"sourceName"`
	SourceReference *string        `json:"sourceReference"`
	Confidence      float64        `json:"confidence"`
}
type Repository struct{ db *pgxpool.Pool }

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }
func (r *Repository) ByVIN(ctx context.Context, vin string) ([]Record, error) {
	rows, err := r.db.Query(ctx, `SELECT h.id::text,h.record_type,to_char(h.occurred_at,'YYYY-MM-DD'),h.country,h.summary,h.details,h.source_name,h.source_reference,h.confidence::float8 FROM vehicle_history_records h JOIN vehicles v ON v.id=h.vehicle_id WHERE v.vin=$1 ORDER BY h.occurred_at DESC NULLS LAST,h.created_at DESC`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []Record{}
	for rows.Next() {
		var rec Record
		var details []byte
		if err := rows.Scan(&rec.ID, &rec.RecordType, &rec.OccurredAt, &rec.Country, &rec.Summary, &details, &rec.SourceName, &rec.SourceReference, &rec.Confidence); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(details, &rec.Details)
		records = append(records, rec)
	}
	return records, rows.Err()
}
