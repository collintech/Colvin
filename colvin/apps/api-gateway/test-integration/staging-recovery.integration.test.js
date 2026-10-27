import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import pg from 'pg';
import request from 'supertest';

import { openStagingRecovery } from '../scripts/lib/staging-recovery.js';
import { sha256 } from '../src/utils/hash.js';

const pool = new pg.Pool({ connectionString: process.env.INTEGRATION_DATABASE_URL, max: 2 });
const target = { projectId: randomUUID(), environmentId: randomUUID(), serviceId: randomUUID() };
Object.assign(process.env, {
  AUTH_LIMIT_NAMESPACE: `recovery-${randomUUID()}`,
  RAILWAY_PROJECT_ID: target.projectId,
  RAILWAY_ENVIRONMENT_ID: target.environmentId,
  RAILWAY_SERVICE_ID: target.serviceId,
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  RAILWAY_SERVICE_NAME: 'api-gateway',
  RAILWAY_DEPLOYMENT_ID: randomUUID(),
});
const { closeRedis } = await import('../src/cache/redis.js');
const recovery = await openStagingRecovery(target);
const { app } = await import('../src/app.js');
const origin = process.env.WEB_ORIGIN;
const oldPassword = 'ColvinRecoveryOriginal12345';
const newPassword = 'ColvinRecoveryReplacement67890';

test.after(async () => {
  await Promise.allSettled([pool.end(), recovery.close(), closeRedis()]);
});

async function fixture() {
  const email = `recover-${randomUUID()}@example.test`;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .send({ email, password: oldPassword })
    .expect(201);
  const userId = response.body.data.user.id;
  await pool.query(
    `INSERT INTO account_action_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'password_reset', $2, now() + interval '5 minutes')`,
    [userId, sha256(randomUUID())],
  );
  return {
    email,
    userId,
    access: response.body.data.accessToken,
    cookie: response.headers['set-cookie'][0].split(';')[0],
  };
}

async function cleanup(userId) {
  await pool.query('DELETE FROM auth_audit_events WHERE user_id=$1', [userId]);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]);
}

test('operator recovery preserves the account, revokes old credentials and records a secret-free audit', async () => {
  const account = await fixture();
  const otherAccount = await fixture();
  try {
    const before = (await pool.query('SELECT * FROM users WHERE id=$1', [account.userId])).rows[0];
    const otherBefore = (await pool.query('SELECT * FROM users WHERE id=$1', [otherAccount.userId]))
      .rows[0];
    const confirmed = await recovery.findAccount(account.email);
    assert.equal(confirmed.id, account.userId);
    await recovery.resetPassword({ ...account, newPassword });
    const after = (await pool.query('SELECT * FROM users WHERE id=$1', [account.userId])).rows[0];
    for (const key of ['id', 'email', 'role', 'email_verified_at', 'created_at']) {
      assert.deepEqual(after[key], before[key]);
    }
    assert.equal(after.auth_version, before.auth_version + 1);
    assert.ok(after.password_changed_at);
    const sessions = await pool.query(
      'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL',
      [account.userId],
    );
    const links = await pool.query(
      "SELECT count(*)::int AS count FROM account_action_tokens WHERE user_id=$1 AND purpose='password_reset' AND used_at IS NULL",
      [account.userId],
    );
    assert.equal(sessions.rows[0].count, 0);
    assert.equal(links.rows[0].count, 0);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${account.access}`)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', account.cookie)
      .expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: oldPassword })
      .expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: account.email, password: newPassword })
      .expect(200);
    const audit = (
      await pool.query(
        "SELECT * FROM auth_audit_events WHERE user_id=$1 AND event_type='auth.password_reset.operator'",
        [account.userId],
      )
    ).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].metadata.channel, 'staging-cli');
    const rendered = JSON.stringify(audit);
    for (const secret of [
      account.email,
      oldPassword,
      newPassword,
      before.password_hash,
      after.password_hash,
    ]) {
      assert.equal(rendered.includes(secret), false);
    }
    assert.deepEqual(
      (await pool.query('SELECT * FROM users WHERE id=$1', [otherAccount.userId])).rows[0],
      otherBefore,
    );
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${otherAccount.access}`)
      .expect(200);
  } finally {
    await cleanup(account.userId);
    await cleanup(otherAccount.userId);
  }
});

test('invalid, compromised, reused and mismatched-account passwords leave the account untouched', async () => {
  const account = await fixture();
  try {
    const before = (
      await pool.query('SELECT password_hash, auth_version FROM users WHERE id=$1', [
        account.userId,
      ])
    ).rows[0];
    for (const password of ['short', 'é'.repeat(40), 'password12345', oldPassword]) {
      await assert.rejects(recovery.resetPassword({ ...account, newPassword: password }));
    }
    await assert.rejects(recovery.resetPassword({ ...account, userId: randomUUID(), newPassword }));
    const after = (
      await pool.query('SELECT password_hash, auth_version FROM users WHERE id=$1', [
        account.userId,
      ])
    ).rows[0];
    assert.deepEqual(after, before);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL',
          [account.userId],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM account_action_tokens WHERE user_id=$1 AND used_at IS NULL',
          [account.userId],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await cleanup(account.userId);
  }
});

test('audit failure rolls back the password update and both revocations', async () => {
  const account = await fixture();
  const functionName = `recovery_fail_${randomUUID().replaceAll('-', '')}`;
  const triggerName = `${functionName}_trigger`;
  try {
    const before = (
      await pool.query(
        'SELECT password_hash, auth_version, password_changed_at FROM users WHERE id=$1',
        [account.userId],
      )
    ).rows[0];
    // This trigger affects only this fixture's operator event, including during parallel test files.
    await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.user_id = '${account.userId}'::uuid AND NEW.event_type = 'auth.password_reset.operator' THEN
          RAISE EXCEPTION 'simulated recovery audit failure';
        END IF;
        RETURN NEW;
      END $$`);
    await pool.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON auth_audit_events FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    await assert.rejects(
      recovery.resetPassword({ ...account, newPassword }),
      /simulated recovery audit failure/,
    );
    const after = (
      await pool.query(
        'SELECT password_hash, auth_version, password_changed_at FROM users WHERE id=$1',
        [account.userId],
      )
    ).rows[0];
    assert.deepEqual(after, before);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL',
          [account.userId],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM account_action_tokens WHERE user_id=$1 AND used_at IS NULL',
          [account.userId],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON auth_audit_events`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await cleanup(account.userId);
  }
});
