import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

// CI-only container probe; every credential-shaped value is synthetic.
const run = promisify(execFile);
try {
  assert.equal(process.env.CI, 'true');
  const marker = `colvin-privacy-probe-${randomUUID()}`;
  const base = 'http://127.0.0.1:5173';
  const headers = {
    Cookie: `__Host-colvin_refresh=${marker}-cookie`,
    Referer: `${base}/reset-password?token=${marker}-referrer`,
  };
  for (const path of ['/reset-password', '/verify-email']) {
    const response = await fetch(`${base}${path}?token=${marker}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.match(await response.text(), /<meta name="referrer" content="no-referrer"/);
  }
  const response = await fetch(`${base}/api/v1/log-privacy-probe?token=${marker}`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 404);
  await response.text();
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
      'A synthetic query, cookie or referrer reached container logs',
    );
    observed =
      logs.includes('"path":"/reset-password"') &&
      logs.includes('"path":"/verify-email"') &&
      logs.includes('"url":"/api/v1/log-privacy-probe"');
    if (observed) break;
    await delay(100);
  }
  assert.equal(observed, true, 'Expected proxy and gateway completion logs were not observed');
  process.stdout.write('HTTP log privacy check passed.\n');
} catch {
  process.stderr.write('HTTP log privacy check failed; inspect CI container diagnostics.\n');
  process.exitCode = 1;
}
