import { query } from '../database/postgres.js';
export async function findUserByEmail(email) {
  return (
    (
      await query('SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1', [
        email,
      ])
    ).rows[0] ?? null
  );
}
export async function findUserById(id) {
  return (
    (await query('SELECT id, email, role, created_at FROM users WHERE id = $1', [id])).rows[0] ??
    null
  );
}
export async function createUser({ email, passwordHash }) {
  return (
    await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at',
      [email, passwordHash],
    )
  ).rows[0];
}
export async function saveRefreshToken({ userId, tokenHash, expiresAt }) {
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    tokenHash,
    expiresAt,
  ]);
}
export async function findRefreshToken(tokenHash) {
  return (
    (
      await query(
        'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1',
        [tokenHash],
      )
    ).rows[0] ?? null
  );
}
export async function revokeRefreshToken(tokenHash) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
}
