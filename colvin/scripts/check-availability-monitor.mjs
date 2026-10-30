import assert from 'node:assert/strict';

// CI-only loopback contract check through the built Nginx frontend.
const origin = 'http://127.0.0.1:5173';

try {
  const response = await fetch(`${origin}/api/v1/status`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { status: 'ok' });

  const missing = await fetch(`${origin}/api/v1/monitoring-probe-not-found`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  console.log('Availability monitor HTTP contract passed.');
} catch {
  console.error('Availability monitor HTTP contract failed.');
  process.exitCode = 1;
}
