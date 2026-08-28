import { query } from '../database/postgres.js';

function run(executor, text, params = []) {
  return executor?.query ? executor.query(text, params) : query(text, params);
}

export async function revokeActiveAccountActionTokens(userId, purpose, executor) {
  await run(
    executor,
    `UPDATE account_action_tokens
     SET used_at = COALESCE(used_at, now())
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
}

export async function createAccountActionToken(
  { userId, purpose, tokenHash, expiresAt },
  executor,
) {
  await revokeActiveAccountActionTokens(userId, purpose, executor);
  await run(
    executor,
    `INSERT INTO account_action_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, tokenHash, expiresAt],
  );
}

export async function findAccountActionTokenForUpdate(tokenHash, purpose, executor) {
  return (
    (
      await run(
        executor,
        `SELECT id, user_id, purpose, token_hash, expires_at, used_at
       FROM account_action_tokens
       WHERE token_hash = $1 AND purpose = $2
       FOR UPDATE`,
        [tokenHash, purpose],
      )
    ).rows[0] ?? null
  );
}

export async function markAccountActionTokenUsed(id, executor) {
  await run(
    executor,
    `UPDATE account_action_tokens
     SET used_at = COALESCE(used_at, now())
     WHERE id = $1`,
    [id],
  );
}
