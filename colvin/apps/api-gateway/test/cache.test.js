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

const { cacheGetJson, cacheSetJson, vehicleCacheKey } = await import('../src/cache/redis.js');

test('vehicle cache keys are versioned and namespaced', () => {
  assert.equal(vehicleCacheKey('1HGCM82633A004352'), 'colvin:v1:vehicle:1HGCM82633A004352');
});

test('cache read failures degrade to a cache miss', async () => {
  const client = { get: async () => Promise.reject(new Error('redis unavailable')) };
  assert.equal(await cacheGetJson('colvin:v1:test', client), null);
});

test('cache write failures do not fail the request path', async () => {
  const client = { set: async () => Promise.reject(new Error('redis unavailable')) };
  assert.equal(await cacheSetJson('colvin:v1:test', { ok: true }, 60, client), false);
});
