import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { URL } from 'node:url';

import pg from 'pg';
import request from 'supertest';

import { readAccountActionToken } from '../../web-client/src/features/auth/account-action-link.js';

process.env.AUTH_LIMIT_NAMESPACE = `email-links-${randomUUID()}`;
process.env.EMAIL_PROVIDER = 'resend';
process.env.RESEND_API_KEY = 're_synthetic_link_fixture_never_sent';
process.env.EMAIL_FROM = 'Colvin <onboarding@resend.dev>';
process.env.ACCOUNT_WEB_URL = 'https://colvin.example.invalid';
process.env.PASSWORD_COMPROMISE_CHECK = 'disabled';

const { app } = await import('../src/app.js');
const { closePostgres } = await import('../src/database/postgres.js');
const { closeRedis } = await import('../src/cache/redis.js');
const pool = new pg.Pool({ connectionString: process.env.INTEGRATION_DATABASE_URL, max: 2 });
const origin = process.env.WEB_ORIGIN;
const originalPassword = 'ColvinEmailLinkOriginal12345';
const replacementPassword = 'ColvinEmailLinkReplacement67890';

test.after(async () => {
  await Promise.allSettled([pool.end(), closePostgres(), closeRedis()]);
});

function captureMail(t) {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer re_synthetic_link_fixture_never_sent');
    sent.push(JSON.parse(options.body));
    return globalThis.Response.json({ id: `fixture-email-${sent.length}` });
  });
  return sent;
}

async function fixture(ids) {
  const email = `email-link-${randomUUID()}@example.invalid`;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .send({ email, password: originalPassword })
    .expect(201);
  const id = response.body.data.user.id;
  ids.push(id);
  return {
    id,
    email,
    access: response.body.data.accessToken,
    cookie: response.headers['set-cookie'][0].split(';')[0],
  };
}

async function record(id) {
  return (
    await pool.query(
      'SELECT password_hash, auth_version, password_changed_at, email_verified_at FROM users WHERE id=$1',
      [id],
    )
  ).rows[0];
}

async function cleanup(ids) {
  for (const id of ids) {
    await pool.query('DELETE FROM auth_audit_events WHERE user_id=$1', [id]);
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
  }
}

function tokenFromEmail(mail, account, path) {
  assert.deepEqual(mail.to, [account.email]);
  const href = /href="([^"]+)"/.exec(mail.html)?.[1];
  assert.ok(href);
  const link = new URL(href);
  assert.equal(link.origin, 'https://colvin.example.invalid');
  assert.equal(link.pathname, path);
  assert.equal(link.search, '');
  assert.match(link.hash, /^#token=[A-Za-z0-9_-]{43}$/);
  const token = readAccountActionToken(link);
  assert.equal(token.length, 43);
  return token;
}

test('an emailed reset fragment changes only its target account and preserves the other account server-side sessions', async (t) => {
  const sent = captureMail(t);
  const ids = [];
  try {
    const main = await fixture(ids);
    const target = await fixture(ids);
    const mainBefore = await record(main.id);
    const targetBefore = await record(target.id);
    const accepted = await request(app)
      .post('/api/v1/auth/password/reset/request')
      .set('Origin', origin)
      .send({ email: target.email })
      .expect(202);
    assert.equal(accepted.body.data.testToken, undefined);
    const token = tokenFromEmail(sent.at(-1), target, '/reset-password');

    const reset = await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${main.access}`)
      .send({ token, newPassword: replacementPassword })
      .expect(204);
    assert.match(reset.headers['set-cookie'][0], /Max-Age=0/);
    assert.deepEqual(await record(main.id), mainBefore);
    assert.equal((await record(target.id)).auth_version, targetBefore.auth_version + 1);

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', target.cookie)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', main.cookie)
      .expect(200);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: target.email, password: replacementPassword })
      .expect(200);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: target.email, password: originalPassword })
      .expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: main.email, password: originalPassword })
      .expect(200);
    const replay = await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .send({ token, newPassword: replacementPassword })
      .expect(400);
    assert.equal(replay.body.error.code, 'INVALID_ACCOUNT_TOKEN');
  } finally {
    await cleanup(ids);
  }
});

test('an emailed verification fragment is purpose-bound, single-use and verifies only its target account', async (t) => {
  const sent = captureMail(t);
  const ids = [];
  try {
    const main = await fixture(ids);
    const target = await fixture(ids);
    const mainBefore = await record(main.id);
    const targetBefore = await record(target.id);
    const accepted = await request(app)
      .post('/api/v1/auth/email/verification/request')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${target.access}`)
      .expect(202);
    assert.equal(accepted.body.data.testToken, undefined);
    const token = tokenFromEmail(sent.at(-1), target, '/verify-email');

    const wrongPurpose = await request(app)
      .post('/api/v1/auth/password/reset/confirm')
      .set('Origin', origin)
      .send({ token, newPassword: replacementPassword })
      .expect(400);
    assert.equal(wrongPurpose.body.error.code, 'INVALID_ACCOUNT_TOKEN');
    await request(app)
      .post('/api/v1/auth/email/verification/confirm')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${main.access}`)
      .send({ token })
      .expect(204);
    const targetAfter = await record(target.id);
    assert.ok(targetAfter.email_verified_at);
    assert.equal(targetAfter.password_hash, targetBefore.password_hash);
    assert.equal(targetAfter.auth_version, targetBefore.auth_version);
    assert.deepEqual(await record(main.id), mainBefore);
    const replay = await request(app)
      .post('/api/v1/auth/email/verification/confirm')
      .set('Origin', origin)
      .send({ token })
      .expect(400);
    assert.equal(replay.body.error.code, 'INVALID_ACCOUNT_TOKEN');
  } finally {
    await cleanup(ids);
  }
});
