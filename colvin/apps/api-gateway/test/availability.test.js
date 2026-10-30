import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';

import express from 'express';
import request from 'supertest';

import { createAvailabilityCheck, createAvailabilityHandler } from '../src/health/availability.js';
import { installTestRuntimeEnv } from './helpers/runtime-env.js';

const ready = {
  ready: true,
  status: 'ready',
  dependencies: { postgres: 'ready', redis: 'ready' },
};
const historyUrl = 'http://history.example.invalid:8082';
const decoderUrl = 'http://decoder.example.invalid:8081';

function healthyFetch(calls = []) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    return globalThis.Response.json({ status: String(url).includes('/ready') ? 'ready' : 'ok' });
  };
}

function monitor(options = {}) {
  return createAvailabilityCheck({
    readiness: async () => ready,
    historyUrl,
    decoderUrl,
    fetchImpl: healthyFetch(),
    ...options,
  });
}

test('availability uses only bounded internal health GETs without credentials or provider requests', async () => {
  const calls = [];
  assert.equal(await monitor({ fetchImpl: healthyFetch(calls) })(), true);
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    `${decoderUrl}/health`,
    `${historyUrl}/ready`,
  ]);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.ok(options.signal instanceof globalThis.AbortSignal);
    assert.equal(options.body, undefined);
  }
});

test('degraded Redis, PostgreSQL outages and contradictory gateway readiness fail availability', async () => {
  for (const state of [
    { ...ready, dependencies: { postgres: 'ready', redis: 'degraded' }, status: 'degraded' },
    { ...ready, dependencies: { postgres: 'unavailable', redis: 'ready' } },
    { ...ready, ready: false },
    { ...ready, status: 'not_ready' },
    { status: 'ok' },
    null,
  ]) {
    assert.equal(await monitor({ readiness: async () => state })(), false);
  }
  assert.equal(
    await monitor({
      readiness: () => {
        throw new Error('private-database-credential');
      },
    })(),
    false,
  );
});

test('history/decoder outages, redirects, invalid bodies and network failures cannot pass', async () => {
  for (const service of [historyUrl, decoderUrl]) {
    for (const response of [
      () => new globalThis.Response('private-service-response', { status: 503 }),
      () =>
        new globalThis.Response(null, {
          status: 302,
          headers: { Location: 'https://outside.invalid' },
        }),
      () => globalThis.Response.json({ status: 'unavailable', detail: 'private-response' }),
      () => new globalThis.Response('<html>private-response</html>'),
      () => {
        throw new Error('private-network-address');
      },
    ]) {
      const check = monitor({
        fetchImpl: async (url, options) =>
          String(url).startsWith(service) ? response() : healthyFetch()(url, options),
      });
      assert.equal(await check(), false);
    }
  }
});

test('concurrent requests share one check and both positive and negative results expire', async () => {
  let time = 0;
  let gatewayCalls = 0;
  let available = true;
  const calls = [];
  const check = monitor({
    readiness: async () => {
      gatewayCalls++;
      return available ? ready : { ...ready, ready: false };
    },
    fetchImpl: healthyFetch(calls),
    now: () => time,
    cacheTtlMs: 100,
  });
  assert.deepEqual(
    await Promise.all(Array.from({ length: 25 }, () => check())),
    Array(25).fill(true),
  );
  assert.equal(gatewayCalls, 1);
  assert.equal(calls.length, 2);
  available = false;
  assert.equal(await check(), true);
  await nextTurn();
  time = 101;
  assert.equal(await check(), false);
  available = true;
  assert.equal(await check(), false);
  await nextTurn();
  time = 202;
  assert.equal(await check(), true);
  assert.equal(gatewayCalls, 3);
  assert.equal(calls.length, 6);
});

test('a stalled readiness check returns unavailable and never accumulates duplicate background checks', async () => {
  let finishReadiness;
  let calls = 0;
  let time = 0;
  const check = monitor({
    readiness: () => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            finishReadiness = resolve;
          })
        : ready;
    },
    timeoutMs: 30,
    cacheTtlMs: 100,
    now: () => time,
  });
  assert.equal(await check(), false);
  time = 101;
  assert.equal(await check(), false);
  assert.equal(calls, 1);
  finishReadiness(ready);
  await nextTurn();
  assert.equal(await check(), true);
  assert.equal(calls, 2);
});

test('public HTTP responses expose only generic status, disable caching and never set account cookies', async () => {
  for (const [check, status, body] of [
    [async () => true, 200, { status: 'ok' }],
    [async () => false, 503, { status: 'unavailable' }],
    [
      async () => {
        throw new Error('private-database-password-and-internal-host');
      },
      503,
      { status: 'unavailable' },
    ],
  ]) {
    const app = express();
    app.get('/api/v1/status', createAvailabilityHandler(check));
    const response = await request(app).get('/api/v1/status').expect(status, body);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.text.includes('private-'), false);
  }
});

test('the real gateway exposes the public route and bounds its database probe without requiring sign-in', async (t) => {
  installTestRuntimeEnv();
  const { pool } = await import('../src/database/postgres.js');
  const { redis } = await import('../src/cache/redis.js');
  t.mock.method(pool, 'query', async (query) => {
    assert.deepEqual(query, { text: 'SELECT 1', query_timeout: 2000 });
    return { rows: [{}] };
  });
  t.mock.method(redis, 'ping', async () => 'PONG');
  const calls = [];
  t.mock.method(globalThis, 'fetch', healthyFetch(calls));
  const { app } = await import('../src/app.js');
  const response = await request(app).get('/api/v1/status').expect(200, { status: 'ok' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.ok(response.headers['x-request-id']);
  assert.equal(calls.length, 2);
});
