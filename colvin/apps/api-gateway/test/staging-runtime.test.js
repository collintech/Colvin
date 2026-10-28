import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { checkStagingRuntime, probeJson, stagingIdentity } from '../scripts/lib/staging-runtime.js';

const runtime = {
  RAILWAY_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
  RAILWAY_ENVIRONMENT_ID: '00000000-0000-4000-8000-000000000002',
  RAILWAY_SERVICE_ID: '00000000-0000-4000-8000-000000000003',
  RAILWAY_DEPLOYMENT_ID: '00000000-0000-4000-8000-000000000004',
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  RAILWAY_SERVICE_NAME: 'api-gateway',
  RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40),
};
const config = {
  NODE_ENV: 'production',
  PASSWORD_COMPROMISE_CHECK: 'hibp',
  DB_SSL_MODE: 'verify-full',
  REFRESH_COOKIE_SECURE: true,
  EMAIL_PROVIDER: 'resend',
  WEB_ORIGIN: 'https://colvin.example.invalid',
  ACCOUNT_WEB_URL: 'https://colvin.example.invalid',
  API_PORT: 4000,
  HISTORY_SERVICE_URL: 'http://history-service.railway.internal:8082',
  VIN_DECODER_URL: 'http://vin-decoder.railway.internal:8081',
};
const gatewayReady = {
  ready: true,
  status: 'ready',
  dependencies: { postgres: 'ready', redis: 'ready' },
};

function healthyFetch(calls = []) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    return globalThis.Response.json(
      String(url).includes('127.0.0.1')
        ? gatewayReady
        : String(url).includes('history-service')
          ? { status: 'ready' }
          : { status: 'ok' },
    );
  };
}

test('runtime acceptance checks three read-only endpoints and reports only deployment identity and bounded results', async () => {
  const calls = [];
  const report = await checkStagingRuntime({ runtime, config, fetchImpl: healthyFetch(calls) });
  assert.equal(report.passed, true);
  assert.equal(report.deploymentId, runtime.RAILWAY_DEPLOYMENT_ID);
  assert.equal(report.commitSha, runtime.RAILWAY_GIT_COMMIT_SHA);
  assert.equal(report.checks.length, 4);
  assert.deepEqual(calls.map((call) => call.url).sort(), [
    'http://127.0.0.1:4000/ready',
    'http://history-service.railway.internal:8082/ready',
    'http://vin-decoder.railway.internal:8081/health',
  ]);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.ok(options.signal instanceof globalThis.AbortSignal);
    assert.equal(options.body, undefined);
  }
  assert.equal(JSON.stringify(report).includes('http://'), false);
});

test('production environments, missing identity and stale deployment/commit expectations are refused before requests', async () => {
  for (const change of [
    { RAILWAY_ENVIRONMENT_NAME: 'production' },
    { RAILWAY_SERVICE_NAME: 'history-service' },
    { RAILWAY_DEPLOYMENT_ID: '' },
    { RAILWAY_PROJECT_ID: 'private-value-must-not-print' },
    { RAILWAY_ENVIRONMENT_ID: undefined },
    { RAILWAY_SERVICE_ID: undefined },
    { RAILWAY_GIT_COMMIT_SHA: 'private-value-must-not-print' },
  ]) {
    await assert.rejects(
      checkStagingRuntime({
        runtime: { ...runtime, ...change },
        config,
        fetchImpl: async () => assert.fail('Network request before target validation'),
      }),
      (error) => !error.message.includes('private-value-must-not-print'),
    );
  }
  assert.throws(
    () => stagingIdentity(runtime, { deployment: '00000000-0000-4000-8000-000000000099' }),
    /reconnect/,
  );
  assert.throws(() => stagingIdentity(runtime, { commit: 'b'.repeat(40) }), /reconnect/);
  assert.doesNotThrow(() =>
    stagingIdentity(runtime, {
      deployment: runtime.RAILWAY_DEPLOYMENT_ID,
      commit: runtime.RAILWAY_GIT_COMMIT_SHA,
    }),
  );
  assert.equal(stagingIdentity({ ...runtime, RAILWAY_GIT_COMMIT_SHA: undefined }).commitSha, null);
});

test('unsafe production configuration fails without network activity or printing configured values', async () => {
  for (const [setting, value] of [
    ['NODE_ENV', 'development'],
    ['PASSWORD_COMPROMISE_CHECK', 'disabled'],
    ['DB_SSL_MODE', 'disable'],
    ['REFRESH_COOKIE_SECURE', false],
    ['EMAIL_PROVIDER', 'test'],
    ['WEB_ORIGIN', 'http://private-value.invalid'],
    ['ACCOUNT_WEB_URL', 'http://private-value.invalid'],
    ['API_PORT', 65536],
    ['HISTORY_SERVICE_URL', 'https://public-service.invalid'],
    ['VIN_DECODER_URL', 'http://user:private-value@vin-decoder.railway.internal:8081'],
    ['VIN_DECODER_URL', 'http://vin-decoder.railway.internal:8081?token=private-value'],
    ['VIN_DECODER_URL', 'http://vin-decoder.railway.internal:8081/unexpected-path'],
  ]) {
    const report = await checkStagingRuntime({
      runtime,
      config: { ...config, [setting]: value },
      fetchImpl: async () => assert.fail('Network request with unsafe configuration'),
    });
    assert.equal(report.passed, false);
    assert.deepEqual(report.checks[0].failedSettings, [setting]);
    assert.equal(JSON.stringify(report).includes('private-value'), false);
  }
});

test('HTTP 200 with degraded Redis or contradictory readiness is not an acceptance pass', async () => {
  for (const body of [
    { ...gatewayReady, status: 'degraded', dependencies: { postgres: 'ready', redis: 'degraded' } },
    { ...gatewayReady, dependencies: { postgres: 'unavailable', redis: 'ready' } },
    { ...gatewayReady, ready: false },
    { ...gatewayReady, status: 'not_ready' },
    { status: 'ok' },
    null,
  ]) {
    const report = await checkStagingRuntime({
      runtime,
      config,
      fetchImpl: async (url, options) =>
        String(url).includes('127.0.0.1')
          ? globalThis.Response.json(body)
          : healthyFetch()(url, options),
    });
    assert.equal(report.passed, false);
    assert.equal(report.checks[1].passed, false);
    assert.equal(report.checks[1].httpStatus, 200);
  }
});

test('an unavailable history service or malformed decoder response fails without exposing response data', async () => {
  const cases = [
    ['history-service', () => new globalThis.Response('private-response', { status: 503 })],
    [
      'history-service',
      () => globalThis.Response.json({ status: 'not_ready', detail: 'private-response' }),
    ],
    ['vin-decoder', () => new globalThis.Response('<html>private-response</html>')],
    [
      'vin-decoder',
      () => globalThis.Response.json({ status: 'unavailable', detail: 'private-response' }),
    ],
  ];
  for (const [service, response] of cases) {
    const report = await checkStagingRuntime({
      runtime,
      config,
      fetchImpl: async (url, options) =>
        String(url).includes(service) ? response() : healthyFetch()(url, options),
    });
    assert.equal(report.passed, false);
    assert.equal(JSON.stringify(report).includes('private-response'), false);
  }
});

test('all independent probes finish even when one has a network failure', async () => {
  const calls = [];
  const report = await checkStagingRuntime({
    runtime,
    config,
    fetchImpl: async (url, options) => {
      calls.push(String(url));
      if (String(url).includes('history-service')) throw new Error('private-URL-and-credential');
      return healthyFetch()(url, options);
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(report.passed, false);
  assert.equal(report.checks[2].reason, 'network');
  assert.equal(report.checks[3].passed, true);
  assert.equal(JSON.stringify(report).includes('private-URL-and-credential'), false);
});

test('health responses above 16 KiB are cancelled and cannot pass', async () => {
  let cancelled = false;
  const result = await probeJson('oversize', 'http://service.invalid', () => null, {
    fetchImpl: async () =>
      new globalThis.Response(
        new globalThis.ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.alloc(16 * 1024 + 1, 65));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'response_too_large');
  assert.equal(cancelled, true);
});

test('native fetch timeout covers a stalled body after HTTP 200 and redirects are never followed', async (t) => {
  let redirected = false;
  let sentStalledBody = false;
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/destination' });
      res.end();
    } else if (req.url === '/destination') {
      redirected = true;
      res.end('{}');
    } else {
      sentStalledBody = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const timeout = await probeJson('stalled-body', base, () => null, { timeoutMs: 500 });
  assert.equal(timeout.reason, 'timeout');
  assert.equal(sentStalledBody, true);
  const redirect = await probeJson('redirect', `${base}/redirect`, () => null);
  assert.equal(redirect.passed, false);
  assert.equal(redirected, false);
});

test('probes run concurrently rather than multiplying the per-request timeout budget', async () => {
  let started = 0;
  let release;
  const allStarted = new Promise((resolve) => {
    release = resolve;
  });
  const report = await checkStagingRuntime({
    runtime,
    config,
    fetchImpl: async (url, options) => {
      started++;
      if (started === 3) release();
      await Promise.race([
        allStarted,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Probes did not start together')), 300).unref(),
        ),
      ]);
      return healthyFetch()(url, options);
    },
  });
  assert.equal(report.passed, true);
  assert.equal(started, 3);
});

test('CLI refuses the wrong target before app configuration and never echoes an unknown argument value', () => {
  const script = new URL('../scripts/check-staging-runtime.mjs', import.meta.url);
  const refused = spawnSync(process.execPath, [fileURLToPath(script)], {
    env: { RAILWAY_ENVIRONMENT_NAME: 'production' },
    encoding: 'utf8',
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /deployed Railway staging api-gateway/);
  assert.equal(refused.stderr.includes('DATABASE_URL'), false);
  const unknown = spawnSync(
    process.execPath,
    [fileURLToPath(script), '--private-token=do-not-echo'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr.includes('do-not-echo'), false);
});

test('CLI exits zero on a healthy report and nonzero for degraded Redis without contacting live systems', () => {
  const script = new URL('../scripts/check-staging-runtime.mjs', import.meta.url);
  const childEnv = {
    ...runtime,
    ...config,
    REFRESH_COOKIE_SECURE: 'true',
    DATABASE_URL: 'postgresql://never-used.invalid/fixture',
    REDIS_URL: 'redis://never-used.invalid',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    INTERNAL_API_KEY: 'c'.repeat(32),
    RESEND_API_KEY: 're_synthetic_key_never_sent',
    EMAIL_FROM: 'Colvin <onboarding@resend.dev>',
  };
  for (const degraded of [false, true]) {
    const body = degraded
      ? {
          ...gatewayReady,
          status: 'degraded',
          dependencies: { postgres: 'ready', redis: 'degraded' },
        }
      : gatewayReady;
    const source = `globalThis.fetch = async (url, options) => {
      if (options.method !== 'GET') throw new Error('Unexpected mutation');
      return Response.json(String(url).includes('127.0.0.1') ? ${JSON.stringify(body)} : String(url).includes('history-service') ? {status:'ready'} : {status:'ok'});
    };
    process.argv = ['node', ${JSON.stringify(fileURLToPath(script))}];
    await import(${JSON.stringify(script.href)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      env: childEnv,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, degraded ? 1 : 0, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`Staging runtime check ${degraded ? 'failed' : 'passed'}\\.`),
    );
    assert.equal(result.stdout.includes('re_synthetic_key_never_sent'), false);
    assert.equal(result.stdout.includes('never-used.invalid'), false);
  }
});
