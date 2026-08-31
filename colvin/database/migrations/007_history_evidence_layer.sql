ALTER TABLE vehicle_history_records
  ADD COLUMN IF NOT EXISTS evidence_status TEXT NOT NULL DEFAULT 'observed'
    CHECK (evidence_status IN ('observed','reported','confirmed','cleared','unknown')),
  ADD COLUMN IF NOT EXISTS jurisdiction TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider_checked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_history_provider_evidence
  ON vehicle_history_records(vehicle_id, source_name, evidence_fingerprint)
  WHERE evidence_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_history_vehicle_type_occurred
  ON vehicle_history_records(vehicle_id, record_type, occurred_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS history_provider_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('clear','match','unknown','error')),
  checked_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  warning TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, provider, check_type)
);

CREATE INDEX IF NOT EXISTS idx_history_provider_checks_vehicle
  ON history_provider_checks(vehicle_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_provider_checks_valid_until
  ON history_provider_checks(valid_until);
