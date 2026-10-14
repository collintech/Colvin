-- Expand-only to remain compatible with old API replicas during deploy.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ;
WITH origins AS (SELECT family_id, MIN(created_at) AS started_at FROM refresh_tokens GROUP BY family_id)
UPDATE refresh_tokens AS t SET family_expires_at = origins.started_at + INTERVAL '30 days'
FROM origins WHERE t.family_id = origins.family_id AND t.family_expires_at IS NULL;
