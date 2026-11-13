import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

// CI-only container probe; every credential-shaped value is synthetic.
const run = promisify(execFile);
let check = 'CI environment';
try {
  assert.equal(process.env.CI, 'true');
  const marker = `colvin-privacy-probe-${randomUUID()}`;
  const base = 'http://127.0.0.1:5173';
  const headers = {
    'X-Request-Id': `${marker}-request-id`,
    'X-Session-Context': `${marker}-custom-header`,
    Cookie: `__Host-colvin_refresh=${marker}-cookie`,
    Referer: `${base}/reset-password?token=${marker}-referrer`,
  };
  const expectedCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];
  const documentPaths = ['/login', '/reset-password', '/verify-email'];
  let entryScript;
  for (const path of documentPaths) {
    check = `document headers: ${path}`;
    const response = await fetch(`${base}${path}?token=${marker}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const csp = (response.headers.get('content-security-policy') ?? '').split(/;\s*/);
    for (const directive of expectedCsp) assert.ok(csp.includes(directive), directive);
    check = `document markup: ${path}`;
    const html = await response.text();
    assert.match(html, /<meta name="referrer" content="no-referrer"/);
    entryScript ??= html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
  }
  check = 'built asset';
  assert.ok(entryScript, 'The built app must load a local entry script');
  const asset = await fetch(new URL(entryScript, base), { signal: AbortSignal.timeout(5000) });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=604800, immutable');
  assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  await asset.body?.cancel();
  check = 'missing asset';
  const missing = await fetch(`${base}/assets/colvin-missing-asset.js`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  await missing.body?.cancel();
  check = 'edge health response';
  const edge = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(5000) });
  assert.equal(edge.status, 200);
  assert.match(edge.headers.get('content-type') ?? '', /^text\/plain(?:;|$)/);
  assert.equal(await edge.text(), 'ok\n');
  check = 'proxied response';
  const response = await fetch(`${base}/api/v1/log-privacy-probe?token=${marker}`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 404);
  const requestId = response.headers.get('x-request-id');
  assert.match(requestId ?? '', /^[a-f0-9-]{36}$/);
  assert.equal((await response.json()).requestId, requestId);
  check = 'container log privacy and correlation';
  let observed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const { stdout, stderr } = await run(
      'docker',
      ['compose', 'logs', '--no-color', 'web-client', 'api-gateway'],
      { maxBuffer: 4 * 1024 * 1024, timeout: 5000 },
    );
    const logs = stdout + stderr;
    assert.equal(
      logs.includes(marker),
      false,
      'A synthetic query or header value reached container logs',
    );
    observed =
      logs.includes('"path":"/reset-password"') &&
      logs.includes('"path":"/verify-email"') &&
      logs.includes(`"upstream_request_id":"${requestId}"`) &&
      logs.includes(`"req":{"id":"${requestId}","method":"GET","url":"/api/v1/log-privacy-probe"}`);
    if (observed) break;
    await delay(100);
  }
  assert.equal(observed, true, 'Expected proxy and gateway completion logs were not observed');
  process.stdout.write('Browser headers and HTTP log privacy checks passed.\n');
} catch {
  process.stderr.write(`Browser headers or HTTP log privacy check failed: ${check}.\n`);
  process.exitCode = 1;
}
