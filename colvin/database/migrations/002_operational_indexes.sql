-- Gate 4: indexes supporting token cleanup and common vehicle-history ordering.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON refresh_tokens(expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_history_vehicle_occurred
  ON vehicle_history_records(vehicle_id, occurred_at DESC, created_at DESC);
