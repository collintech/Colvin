import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/colvin_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-01234567890123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-012345678901234567';
process.env.INTERNAL_API_KEY = 'test-internal-key-01234567890123456789';
process.env.VIN_DECODER_URL = 'http://localhost:8081';
process.env.HISTORY_SERVICE_URL = 'http://localhost:8082';
process.env.LOG_LEVEL = 'silent';

const { getReadiness } = await import('../src/health/readiness.js');

test('Redis outage degrades readiness without taking the API offline', async () => {
  const result = await getReadiness({
    databasePing: async () => true,
    cachePing: async () => false,
  });

  assert.equal(result.ready, true);
  assert.equal(result.status, 'degraded');
  assert.equal(result.dependencies.postgres, 'ready');
  assert.equal(result.dependencies.redis, 'degraded');
});

test('PostgreSQL outage makes the API not ready', async () => {
  const result = await getReadiness({
    databasePing: async () => Promise.reject(new Error('postgres unavailable')),
    cachePing: async () => true,
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, 'not_ready');
  assert.equal(result.dependencies.postgres, 'unavailable');
});
