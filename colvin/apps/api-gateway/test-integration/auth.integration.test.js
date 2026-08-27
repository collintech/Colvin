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
