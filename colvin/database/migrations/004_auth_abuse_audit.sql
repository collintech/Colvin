CREATE TABLE IF NOT EXISTS auth_audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
  subject_hash CHAR(64),
  ip_hash CHAR(64),
  request_id VARCHAR(128),
  user_agent VARCHAR(512),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user_created_at
  ON auth_audit_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_audit_event_created_at
  ON auth_audit_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_subject_created_at
  ON auth_audit_events(subject_hash, created_at DESC)
  WHERE subject_hash IS NOT NULL;
