import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import Redis from 'ioredis';
import pg from 'pg';

import { withTransaction } from '../src/database/transaction.js';

const { Pool } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error('INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are required');
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000 });

test.after(async () => {
  await Promise.allSettled([pool.end(), redis.quit()]);
});

test('database migrations and core tables are present', async () => {
  const tables = await pool.query(`
    SELECT to_regclass('public.users') AS users,
           to_regclass('public.vehicles') AS vehicles,
           to_regclass('public.vehicle_history_records') AS history,
           to_regclass('public.schema_migrations') AS migrations,
           to_regclass('public.auth_audit_events') AS auth_audit
  `);

  assert.equal(tables.rows[0].users, 'users');
  assert.equal(tables.rows[0].vehicles, 'vehicles');
  assert.equal(tables.rows[0].history, 'vehicle_history_records');
  assert.equal(tables.rows[0].migrations, 'schema_migrations');
  assert.equal(tables.rows[0].auth_audit, 'auth_audit_events');

  const migrations = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(
    migrations.rows.map((row) => row.filename),
    [
      '001_init.sql',
      '002_operational_indexes.sql',
      '003_auth_session_hardening.sql',
      '004_auth_abuse_audit.sql',
    ],
  );

  const refreshColumns = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'refresh_tokens'
      AND column_name IN ('family_id', 'replaced_by_hash')
    ORDER BY column_name
  `);
  assert.deepEqual(
    refreshColumns.rows.map((row) => row.column_name),
    ['family_id', 'replaced_by_hash'],
  );
});

test('transactions commit successful writes', async () => {
  const vin = `1HGCM8263${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`.slice(0, 17);

  try {
    await withTransaction(pool, async (client) => {
      await client.query('INSERT INTO vehicles(vin, make) VALUES($1, $2)', [
        vin,
        'TransactionTest',
      ]);
    });

    const result = await pool.query('SELECT make FROM vehicles WHERE vin=$1', [vin]);
    assert.equal(result.rows[0]?.make, 'TransactionTest');
  } finally {
    await pool.query('DELETE FROM vehicles WHERE vin=$1', [vin]);
  }
});

test('transactions roll back failed writes', async () => {
  const vin = `JH4KA8260${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`.slice(0, 17);

  await assert.rejects(
    withTransaction(pool, async (client) => {
      await client.query('INSERT INTO vehicles(vin, make) VALUES($1, $2)', [vin, 'ShouldRollback']);
      throw new Error('force rollback');
    }),
    /force rollback/,
  );

  const result = await pool.query('SELECT 1 FROM vehicles WHERE vin=$1', [vin]);
  assert.equal(result.rowCount, 0);
});

test('Redis supports isolated set/get/TTL behavior', async () => {
  const key = `colvin:test:${randomUUID()}`;
  await redis.set(key, JSON.stringify({ ok: true }), 'EX', 60);

  try {
    assert.equal(await redis.get(key), JSON.stringify({ ok: true }));
    const ttl = await redis.ttl(key);
    assert.ok(ttl > 0 && ttl <= 60);
  } finally {
    await redis.del(key);
  }
});

test('Redis invalidation removes a cached vehicle key', async () => {
  const vin = '1HGCM82633A004352';
  const key = `colvin:v1:vehicle:${vin}`;
  await redis.set(key, JSON.stringify({ vin }), 'EX', 60);

  assert.equal(await redis.exists(key), 1);
  await redis.del(key);
  assert.equal(await redis.exists(key), 0);
});

test('Redis distributed auth counter is shared and expires', async () => {
  const key = `colvin:v1:auth-limit:test:ip:${randomUUID()}`;
  const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
`;

  try {
    const first = await redis.eval(script, 1, key, 60);
    const second = await redis.eval(script, 1, key, 60);
    assert.deepEqual(first.map(Number), [1, 60]);
    assert.equal(Number(second[0]), 2);
    assert.ok(Number(second[1]) > 0 && Number(second[1]) <= 60);
  } finally {
    await redis.del(key);
  }
});
