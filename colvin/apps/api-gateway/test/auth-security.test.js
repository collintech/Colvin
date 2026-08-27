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

const { authorizeRoles } = await import('../src/middleware/authorize.js');
const { requireTrustedOrigin } = await import('../src/middleware/trustedOrigin.js');
const { REFRESH_COOKIE_NAME, readRefreshCookie, setRefreshCookie } =
  await import('../src/utils/auth-cookie.js');

function invoke(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error ?? null));
  });
}

test('RBAC allows configured roles and rejects other roles', async () => {
  const adminOnly = authorizeRoles('admin');

  assert.equal(await invoke(adminOnly, { user: { id: '1', role: 'admin' } }), null);
  const denied = await invoke(adminOnly, { user: { id: '2', role: 'user' } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.code, 'FORBIDDEN');
});

test('trusted-origin middleware rejects cross-site state-changing requests', async () => {
  const req = {
    method: 'POST',
    get(name) {
      const headers = {
        'sec-fetch-site': 'cross-site',
        origin: 'https://attacker.example',
      };
      return headers[name] ?? null;
    },
  };

  const error = await invoke(requireTrustedOrigin, req);
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'UNTRUSTED_ORIGIN');
});

test('refresh cookie is HttpOnly and SameSite protected', () => {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };

  setRefreshCookie(response, 'refresh-token', 3600);
  const cookie = response.headers['Set-Cookie'];

  assert.match(cookie, new RegExp(`^${REFRESH_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
});

test('refresh token is read from Cookie header instead of request JSON', () => {
  const req = {
    headers: { cookie: `other=x; ${REFRESH_COOKIE_NAME}=secret%20token` },
  };
  assert.equal(readRefreshCookie(req), 'secret token');
});
