import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

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

const { app } = await import('../src/app.js');

await test('GET /health returns service health', async () => {
  const response = await request(app).get('/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.ok(response.headers['x-request-id']);
});

await test('unknown routes use the standard error envelope', async () => {
  const response = await request(app).get('/does-not-exist').expect(404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
  assert.ok(response.body.requestId);
});

await test('vehicle routes reject unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/v1/vehicles/decode')
    .send({ vin: '1HGCM82633A004352' })
    .expect(401);

  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

await test('registration rejects malformed payloads before database access', async () => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'not-an-email', password: 'weak' })
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
