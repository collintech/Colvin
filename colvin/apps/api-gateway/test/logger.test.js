import assert from 'node:assert/strict';
import test from 'node:test';

import express from 'express';
import { AxiosError, AxiosHeaders } from 'axios';
import pinoHttp from 'pino-http';
import request from 'supertest';

import { installTestRuntimeEnv } from './helpers/runtime-env.js';

installTestRuntimeEnv();

const { createLogger, serializeHttpRequest } = await import('../src/config/logger.js');

function captureLogger() {
  const records = [];
  const logger = createLogger({
    level: 'info',
    destination: {
      write(line) {
        records.push(JSON.parse(line));
      },
    },
  });
  return { logger, records };
}

test('HTTP completion logs redact incoming and outgoing session credentials', async () => {
  const { logger, records } = captureLogger();
  const app = express();
  app.use(pinoHttp({ logger, genReqId: () => 'cookie-redaction-request' }));
  app.get('/session-probe', (_req, res) => {
    res.setHeader('Set-Cookie', [
      '__Host-colvin_refresh=synthetic-new-refresh; Secure; HttpOnly; SameSite=Lax; Path=/',
      'colvin_refresh=synthetic-legacy-refresh; HttpOnly; Path=/',
    ]);
    res.setHeader('X-Request-Id', 'cookie-redaction-request');
    res.json({ status: 'ok' });
  });

  const response = await request(app)
    .get('/session-probe')
    .set('Cookie', '__Host-colvin_refresh=synthetic-old-refresh')
    .set('Authorization', 'Bearer synthetic-access-token')
    .set('X-Internal-Api-Key', 'synthetic-internal-key')
    .expect(200, { status: 'ok' });

  assert.match(response.headers['set-cookie'][0], /synthetic-new-refresh/);
  assert.match(response.headers['set-cookie'][1], /synthetic-legacy-refresh/);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.req.headers.cookie, '[Redacted]');
  assert.equal(record.req.headers.authorization, '[Redacted]');
  assert.equal(record.req.headers['x-internal-api-key'], '[Redacted]');
  assert.equal(record.res.headers['set-cookie'], '[Redacted]');
  assert.equal(record.req.id, 'cookie-redaction-request');
  assert.equal(record.req.method, 'GET');
  assert.equal(record.req.url, '/session-probe');
  assert.equal(record.res.statusCode, 200);
  assert.equal(record.res.headers['x-request-id'], 'cookie-redaction-request');
  assert.equal(typeof record.responseTime, 'number');
  assert.equal(JSON.stringify(records).includes('synthetic-'), false);
});

test('credential-free HTTP failures retain status and request correlation', async () => {
  const { logger, records } = captureLogger();
  const app = express();
  app.use(pinoHttp({ logger, genReqId: () => 'failed-login-request' }));
  app.get('/session-probe', (_req, res) => {
    res.status(401).json({ error: 'Email or password is incorrect' });
  });

  await request(app).get('/session-probe').expect(401);

  assert.equal(records.length, 1);
  assert.equal(records[0].req.id, 'failed-login-request');
  assert.equal(records[0].req.url, '/session-probe');
  assert.equal(records[0].res.statusCode, 401);
  assert.equal(typeof records[0].responseTime, 'number');
});

test('HTTP query strings and referrers stay out of logs while handlers receive the original request', async () => {
  const { logger, records } = captureLogger();
  const app = express();
  app.use(
    pinoHttp({
      logger,
      serializers: { req: serializeHttpRequest },
      genReqId: () => 'query-redaction-request',
    }),
  );
  app.get('/link-probe', (req, res) => {
    assert.equal(req.query.token, 'synthetic-query-token');
    assert.match(req.get('referer'), /synthetic-referrer-token/);
    res.json({ status: 'ok' });
  });
  await request(app)
    .get('/link-probe?token=synthetic-query-token&source=email')
    .set('Referer', 'https://colvin.example.invalid/reset-password?token=synthetic-referrer-token')
    .expect(200, { status: 'ok' });
  assert.equal(records[0].req.url, '/link-probe');
  assert.equal(records[0].req.query, undefined);
  assert.equal(records[0].req.headers.referer, '[Redacted]');
  assert.equal(records[0].req.id, 'query-redaction-request');
  assert.equal(records[0].res.statusCode, 200);
  assert.equal(JSON.stringify(records).includes('synthetic-'), false);
});

test('structured authentication logs preserve safe diagnostics and redact credential fields', () => {
  const { logger, records } = captureLogger();
  logger.error(
    {
      requestId: 'delivery-failure-request',
      password: 'synthetic-password',
      passwordHash: 'synthetic-password-hash',
      refreshToken: 'synthetic-refresh-token',
      error: {
        code: 'EMAIL_DELIVERY_FAILED',
        statusCode: 503,
        details: { provider: 'resend', kind: 'http', httpStatus: 401, reason: 'invalid_api_key' },
      },
    },
    'Password reset delivery failed',
  );

  assert.equal(JSON.stringify(records).includes('synthetic-'), false);
  assert.equal(records[0].requestId, 'delivery-failure-request');
  assert.equal(records[0].error.code, 'EMAIL_DELIVERY_FAILED');
  assert.equal(records[0].error.details.reason, 'invalid_api_key');
  assert.equal(records[0].error.details.httpStatus, 401);
});

test('internal Axios failures retain their code while request credentials are redacted', () => {
  const { logger, records } = captureLogger();
  const error = new AxiosError('Internal request timed out', 'ETIMEDOUT', {
    url: '/v1/decode',
    headers: new AxiosHeaders({
      'x-internal-api-key': 'synthetic-private-internal-key',
      Authorization: 'Bearer synthetic-private-authorization',
    }),
  });
  logger.error({ error, requestId: 'internal-failure-request' }, 'Internal request failed');
  assert.equal(records[0].error.code, 'ETIMEDOUT');
  assert.equal(records[0].error.config.headers, '[Redacted]');
  assert.equal(records[0].requestId, 'internal-failure-request');
  assert.equal(JSON.stringify(records).includes('synthetic-private'), false);
});
