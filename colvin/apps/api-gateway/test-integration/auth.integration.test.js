import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import pg from 'pg';
import request from 'supertest';

import { closeRedis } from '../src/cache/redis.js';
import { closePostgres } from '../src/database/postgres.js';

const { Pool } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('INTEGRATION_DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
const { app } = await import('../src/app.js');
const origin = process.env.WEB_ORIGIN;

function cookiePair(response) {
  return response.headers['set-cookie']?.[0]?.split(';')[0];
}

test.after(async () => {
  await Promise.allSettled([pool.end(), closePostgres(), closeRedis()]);
});

test('browser auth keeps refresh token HttpOnly and rotates/revokes token families', async () => {
  const email = `gate5-${randomUUID()}@example.test`;
  let userId;

  try {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email, password: 'ColvinSecure12345' })
      .expect(201);

    userId = registration.body.data.user.id;
    assert.ok(registration.body.data.accessToken);
    assert.equal(registration.body.data.refreshToken, undefined);
    assert.match(registration.headers['set-cookie'][0], /HttpOnly/);

    const firstCookie = cookiePair(registration);
    assert.ok(firstCookie);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: 'ColvinSecure12345' })
      .expect(200);
    assert.ok(login.body.data.accessToken);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .expect(200);
    assert.equal(me.body.data.user.email, email);

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', firstCookie)
      .expect(200);

    const secondCookie = cookiePair(rotated);
    assert.ok(secondCookie);
    assert.notEqual(secondCookie, firstCookie);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', firstCookie)
      .expect(401);
    assert.equal(reuse.body.error.code, 'REFRESH_TOKEN_REUSED');

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', secondCookie)
      .expect(401);

    const audit = await pool.query(
      `SELECT event_type, outcome
       FROM auth_audit_events
       WHERE user_id = $1
       ORDER BY id`,
      [userId],
    );
    assert.ok(
      audit.rows.some((row) => row.event_type === 'auth.register' && row.outcome === 'success'),
    );
    assert.ok(
      audit.rows.some((row) => row.event_type === 'auth.login' && row.outcome === 'success'),
    );
    assert.ok(
      audit.rows.some((row) => row.event_type === 'auth.refresh' && row.outcome === 'success'),
    );
  } finally {
    if (userId) {
      await pool.query('DELETE FROM auth_audit_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  }
});

test('cross-origin browser auth request is rejected before account creation', async () => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'https://attacker.example')
    .send({
      email: `cross-origin-${randomUUID()}@example.test`,
      password: 'ColvinSecure12345',
    })
    .expect(403);

  assert.equal(response.body.error.code, 'UNTRUSTED_ORIGIN');
});

test('password change invalidates old access and refresh sessions', async () => {
  const email = `password-change-${randomUUID()}@example.test`;
  const oldPassword = 'ColvinSecure12345';
  const newPassword = 'ColvinSecure67890';
  let userId;

  try {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email, password: oldPassword })
      .expect(201);

    userId = registration.body.data.user.id;
    const oldAccess = registration.body.data.accessToken;
    const oldCookie = cookiePair(registration);

    await request(app)
      .post('/api/v1/auth/password/change')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${oldAccess}`)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(204);

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`)
      .expect(401);

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: oldPassword })
      .expect(401);

    const freshLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: newPassword })
      .expect(200);

    assert.ok(freshLogin.body.data.accessToken);
  } finally {
    if (userId) {
      await pool.query('DELETE FROM auth_audit_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  }
});

test('password reset is single-use and revokes existing sessions without leaking unknown accounts', async () => {
  const email = `password-reset-${randomUUID()}@example.test`;
  const oldPassword = 'ColvinSecure12345';
  const newPassword = 'ColvinReset67890';
  let userId;

  try {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email, password: oldPassword })
      .expect(201);

    userId = registration.body.data.user.id;
    const oldAccess = registration.body.data.accessToken;
    const oldCookie = cookiePair(registration);

    const unknown = await request(app)
      .post('/api/v1/auth/password/reset/request')
      .set('Origin', origin)
      .send({ email: `unknown-${randomUUID()}@example.test` })
      .expect(202);
    assert.equal(unknown.body.data.accepted, true);
    assert.equal(unknown.body.data.testToken, undefined);

    const resetRequest = await request(app)
      .post('/api/v1/auth/password/reset/request')
      .set('Origin', origin)
      .send({ email })
      .expect(202);

    const resetToken = resetRequest.body.data.testToken;
    assert.ok(resetToken);

    await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .send({ token: resetToken, newPassword })
      .expect(204);

    await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .send({ token: resetToken, newPassword: 'AnotherSecure12345' })
      .expect(400);

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`)
      .expect(401);

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: oldPassword })
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: newPassword })
      .expect(200);
  } finally {
    if (userId) {
      await pool.query('DELETE FROM auth_audit_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  }
});

test('email verification token is single-use and marks the account verified', async () => {
  const email = `verify-${randomUUID()}@example.test`;
  let userId;

  try {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email, password: 'ColvinSecure12345' })
      .expect(201);

    userId = registration.body.data.user.id;
    const accessToken = registration.body.data.accessToken;

    const verificationRequest = await request(app)
      .post('/api/v1/auth/email/verification/request')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);

    const verificationToken = verificationRequest.body.data.testToken;
    assert.ok(verificationToken);

    await request(app)
      .post('/api/v1/auth/email/verification/confirm')
      .set('Origin', origin)
      .send({ token: verificationToken })
      .expect(204);

    await request(app)
      .post('/api/v1/auth/email/verification/confirm')
      .set('Origin', origin)
      .send({ token: verificationToken })
      .expect(400);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    assert.ok(me.body.data.user.email_verified_at);
  } finally {
    if (userId) {
      await pool.query('DELETE FROM auth_audit_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  }
});
