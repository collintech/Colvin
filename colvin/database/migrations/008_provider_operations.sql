CREATE TABLE IF NOT EXISTS provider_usage_daily (
  provider TEXT NOT NULL,
  usage_date DATE NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(provider, usage_date)
);

CREATE TABLE IF NOT EXISTS provider_runtime_state (
  provider TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  circuit_open_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  total_successes BIGINT NOT NULL DEFAULT 0 CHECK (total_successes >= 0),
  total_failures BIGINT NOT NULL DEFAULT 0 CHECK (total_failures >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_daily_date
  ON provider_usage_daily(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_provider_runtime_circuit
  ON provider_runtime_state(circuit_open_until)
  WHERE circuit_open_until IS NOT NULL;
