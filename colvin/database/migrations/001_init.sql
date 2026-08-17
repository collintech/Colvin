CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin CHAR(17) NOT NULL UNIQUE,
  make TEXT,
  model TEXT,
  model_year INTEGER CHECK (model_year IS NULL OR model_year BETWEEN 1886 AND 2100),
  manufacturer TEXT,
  country TEXT,
  body_class TEXT,
  engine TEXT,
  decoded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_history_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('accident', 'mileage', 'ownership', 'auction', 'import', 'theft', 'service')),
  occurred_at DATE,
  country TEXT,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_name TEXT NOT NULL,
  source_reference TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_vehicle_id ON vehicle_history_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_history_type ON vehicle_history_records(record_type);

CREATE TABLE IF NOT EXISTS lookup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  vin CHAR(17) NOT NULL,
  success BOOLEAN NOT NULL,
  source_ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lookup_logs_user_created ON lookup_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lookup_logs_vin_created ON lookup_logs(vin, created_at DESC);
