import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import pg from 'pg';
import request from 'supertest';

process.env.PASSWORD_COMPROMISE_CHECK = 'hibp';
process.env.AUTH_LIMIT_NAMESPACE = `hibp-${randomUUID()}`;
const { app } = await import('../src/app.js');
const { closePostgres } = await import('../src/database/postgres.js');
const { closeRedis } = await import('../src/cache/redis.js');
const pool = new pg.Pool({ connectionString: process.env.INTEGRATION_DATABASE_URL, max: 2 });
const origin = process.env.WEB_ORIGIN;
const oldPassword = 'ColvinHibpOriginal12345';
const newPassword = 'ColvinHibpReplacement67890';
const breachedPassword = 'Password123!';
const breachedSuffix = createHash('sha1')
  .update(breachedPassword)
  .digest('hex')
  .toUpperCase()
  .slice(5);

test.after(async () => {
  await Promise.allSettled([pool.end(), closePostgres(), closeRedis()]);
});

async function fixture() {
  const email = `hibp-${randomUUID()}@example.invalid`;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .send({ email, password: oldPassword })
    .expect(201);
  const userId = response.body.data.user.id;
  const reset = await request(app)
    .post('/api/v1/auth/password/reset/request')
    .set('Origin', origin)
    .send({ email })
    .expect(202);
  return {
    email,
    userId,
    access: response.body.data.accessToken,
    cookie: response.headers['set-cookie'][0].split(';')[0],
    token: reset.body.data.testToken,
  };
}

async function authRecord(userId) {
  return (
    await pool.query(
      'SELECT password_hash, auth_version, password_changed_at FROM users WHERE id=$1',
      [userId],
    )
  ).rows[0];
}

async function attemptNewPasswords(account, password, expectedStatus, expectedCode) {
  const rejectedEmail = `hibp-rejected-${randomUUID()}@example.invalid`;
  const registration = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .send({ email: rejectedEmail, password })
    .expect(expectedStatus);
  const change = await request(app)
    .post('/api/v1/auth/password/change')
    .set('Origin', origin)
    .set('Authorization', `Bearer ${account.access}`)
    .send({ currentPassword: oldPassword, newPassword: password })
    .expect(expectedStatus);
  const reset = await request(app)
    .post('/api/v1/auth/password/reset/confirm')
    .set('Origin', origin)
    .send({ token: account.token, newPassword: password })
    .expect(expectedStatus);
  for (const response of [registration, change, reset]) {
    assert.equal(response.body.error.code, expectedCode);
    if (expectedStatus >= 500) {
      assert.equal(response.body.error.details, undefined);
      assert.equal(response.body.error.message, 'An unexpected error occurred');
    }
  }
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM users WHERE email=$1', [rejectedEmail]))
      .rows[0].count,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT used_at FROM account_action_tokens WHERE user_id=$1 AND purpose='password_reset'",
        [account.userId],
      )
    ).rows[0].used_at,
    null,
  );
}

async function cleanup(userId) {
  await pool.query('DELETE FROM auth_audit_events WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]);
}

test('HIBP blocks breached registration, change and reset without modifying credentials or consuming the reset link', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new globalThis.Response(`${'F'.repeat(35)}:0`),
  );
  const account = await fixture();
  try {
    assert.ok(account.token);
    const before = await authRecord(account.userId);
    fetch.mock.mockImplementation(async () => new globalThis.Response(`${breachedSuffix}:321`));
    await attemptNewPasswords(account, breachedPassword, 400, 'COMPROMISED_PASSWORD');
    assert.deepEqual(await authRecord(account.userId), before);

    fetch.mock.mockImplementation(async () => new globalThis.Response(`${'F'.repeat(35)}:0`));
    await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .send({ token: account.token, newPassword })
      .expect(204);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: newPassword })
      .expect(200);
    assert.equal((await authRecord(account.userId)).auth_version, before.auth_version + 1);
  } finally {
    await cleanup(account.userId);
  }
});

test('a malformed HIBP response blocks new passwords while existing login and refresh remain available', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new globalThis.Response(`${'F'.repeat(35)}:0`),
  );
  const account = await fixture();
  try {
    const before = await authRecord(account.userId);
    fetch.mock.mockImplementation(
      async () => new globalThis.Response('<html>upstream unavailable</html>'),
    );
    await attemptNewPasswords(account, newPassword, 503, 'PASSWORD_SCREENING_UNAVAILABLE');
    assert.deepEqual(await authRecord(account.userId), before);
    const callsBeforeLogin = fetch.mock.callCount();
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: oldPassword })
      .expect(200);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', account.cookie)
      .expect(200);
    assert.equal(fetch.mock.callCount(), callsBeforeLogin);
  } finally {
    await cleanup(account.userId);
  }
});
