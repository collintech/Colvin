ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS provider_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS provider_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS provider_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS provider_refreshed_at timestamptz;
