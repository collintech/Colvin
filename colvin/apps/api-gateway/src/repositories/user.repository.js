import { query } from '../database/postgres.js';

function run(executor, text, params = []) {
  return executor?.query ? executor.query(text, params) : query(text, params);
}

export async function findUserByEmail(email, executor) {
  return (
    (
      await run(
        executor,
        'SELECT id, email, password_hash, role, email_verified_at, password_changed_at, auth_version, created_at FROM users WHERE email = $1',
        [email],
      )
    ).rows[0] ?? null
  );
}

export async function findUserById(id, executor) {
  return (
    (
      await run(
        executor,
        'SELECT id, email, role, email_verified_at, password_changed_at, auth_version, created_at FROM users WHERE id = $1',
        [id],
      )
    ).rows[0] ?? null
  );
}

export async function createUser({ email, passwordHash }, executor) {
  return (
    await run(
      executor,
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, email_verified_at, password_changed_at, auth_version, created_at',
      [email, passwordHash],
    )
  ).rows[0];
}

export async function saveRefreshToken({ userId, tokenHash, expiresAt, familyId }, executor) {
  await run(
    executor,
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, expiresAt, familyId],
  );
}

export async function findRefreshTokenForUpdate(tokenHash, executor) {
  return (
    (
      await run(
        executor,
        `SELECT id, user_id, token_hash, expires_at, revoked_at, family_id, replaced_by_hash
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
        [tokenHash],
      )
    ).rows[0] ?? null
  );
}

export async function rotateRefreshToken(
  { tokenHash, replacementHash, replacementExpiresAt, userId, familyId },
  executor,
) {
  await run(
    executor,
    `UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by_hash = $2
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash, replacementHash],
  );

  await saveRefreshToken(
    {
      userId,
      tokenHash: replacementHash,
      expiresAt: replacementExpiresAt,
      familyId,
    },
    executor,
  );
}

export async function revokeRefreshFamily(familyId, executor) {
  await run(
    executor,
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE family_id = $1`,
    [familyId],
  );
}

export async function revokeAllUserRefreshTokens(userId, executor) {
  await run(
    executor,
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE user_id = $1`,
    [userId],
  );
}

export async function findUserAuthRecordByEmail(email, executor) {
  return (
    (
      await run(
        executor,
        `SELECT id, email, password_hash, role, email_verified_at, password_changed_at, auth_version, created_at
       FROM users WHERE email = $1`,
        [email],
      )
    ).rows[0] ?? null
  );
}

export async function findUserAuthRecordById(id, executor) {
  return (
    (
      await run(
        executor,
        `SELECT id, email, password_hash, role, email_verified_at, password_changed_at, auth_version, created_at
       FROM users WHERE id = $1`,
        [id],
      )
    ).rows[0] ?? null
  );
}

export async function changeUserPassword(userId, passwordHash, executor) {
  return (
    (
      await run(
        executor,
        `UPDATE users
       SET password_hash = $2, password_changed_at = now(), auth_version = auth_version + 1, updated_at = now()
       WHERE id = $1
       RETURNING id, email, role, email_verified_at, password_changed_at, auth_version, created_at`,
        [userId, passwordHash],
      )
    ).rows[0] ?? null
  );
}

export async function markUserEmailVerified(userId, executor) {
  return (
    (
      await run(
        executor,
        `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING id, email, role, email_verified_at, password_changed_at, auth_version, created_at`,
        [userId],
      )
    ).rows[0] ?? null
  );
}
