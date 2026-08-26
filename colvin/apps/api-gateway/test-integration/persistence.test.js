import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import Redis from 'ioredis';
import pg from 'pg';

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
