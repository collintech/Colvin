ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0);

CREATE TABLE IF NOT EXISTS account_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user_purpose_active
  ON account_action_tokens(user_id, purpose, expires_at DESC)
  WHERE used_at IS NULL;

-- Existing refresh JWTs predate the auth_version claim introduced by Gate 5C.
-- Revoke them explicitly so deployment semantics are a deliberate re-login, not an ambiguous mismatch.
UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;
