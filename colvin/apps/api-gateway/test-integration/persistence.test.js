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
           to_regclass('public.schema_migrations') AS migrations
  `);

  assert.equal(tables.rows[0].users, 'users');
  assert.equal(tables.rows[0].vehicles, 'vehicles');
  assert.equal(tables.rows[0].history, 'vehicle_history_records');
  assert.equal(tables.rows[0].migrations, 'schema_migrations');

  const migrations = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(
    migrations.rows.map((row) => row.filename),
    ['001_init.sql', '002_operational_indexes.sql'],
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
