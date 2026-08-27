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

const { PERMISSIONS, authorizePermission, authorizeRoles } =
  await import('../src/middleware/authorize.js');
const { ROLE_PERMISSIONS, roleHasPermission } = await import('../src/authz/policy.js');
const { requireTrustedOrigin } = await import('../src/middleware/trustedOrigin.js');
const { authAbuseKey, consumeAuthLimit } = await import('../src/security/auth-abuse.js');
const { buildAuthAuditEvent } = await import('../src/services/auth-audit.service.js');
const { REFRESH_COOKIE_NAME, readRefreshCookie, setRefreshCookie } =
  await import('../src/utils/auth-cookie.js');

function invoke(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error ?? null));
  });
}

test('RBAC role compatibility helper allows configured roles and rejects others', async () => {
  const adminOnly = authorizeRoles('admin');

  assert.equal(await invoke(adminOnly, { user: { id: '1', role: 'admin' } }), null);
  const denied = await invoke(adminOnly, { user: { id: '2', role: 'user' } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.code, 'FORBIDDEN');
});

test('formal RBAC policy grants only declared permissions', async () => {
  assert.equal(roleHasPermission('user', PERMISSIONS.VEHICLE_LOOKUP), true);
  assert.equal(roleHasPermission('user', PERMISSIONS.ADMIN_AUDIT_READ), false);
  assert.equal(roleHasPermission('admin', PERMISSIONS.ADMIN_AUDIT_READ), true);
  assert.ok(ROLE_PERMISSIONS.admin.length > ROLE_PERMISSIONS.user.length);

  const middleware = authorizePermission(PERMISSIONS.ADMIN_AUDIT_READ);
  const denied = await invoke(middleware, { user: { id: 'u1', role: 'user' } });
  assert.equal(denied.code, 'FORBIDDEN');
  assert.equal(await invoke(middleware, { user: { id: 'a1', role: 'admin' } }), null);
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

test('distributed abuse keys hash identities instead of exposing email or IP', () => {
  const key = authAbuseKey('login', 'account', 'Person@Example.COM');
  assert.match(key, /^colvin:v1:auth-limit:default:login:account:[a-f0-9]{64}$/);
  assert.equal(key.includes('person@example.com'), false);
});

test('distributed abuse counter blocks only after the configured threshold', async () => {
  let count = 0;
  const fakeRedis = {
    async eval(_script, _numKeys, _key, windowSeconds) {
      count += 1;
      return [count, Number(windowSeconds)];
    },
  };

  const rule = {
    action: 'login',
    dimension: 'account',
    identity: 'person@example.com',
    limit: 2,
    windowSeconds: 60,
  };

  assert.equal((await consumeAuthLimit(rule, fakeRedis)).blocked, false);
  assert.equal((await consumeAuthLimit(rule, fakeRedis)).blocked, false);
  const blocked = await consumeAuthLimit(rule, fakeRedis);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.ttlSeconds, 60);
});

test('audit event hashes subject/IP and retains non-sensitive request context', () => {
  const event = buildAuthAuditEvent({
    req: {
      id: 'request-1',
      ip: '203.0.113.10',
      get(name) {
        return name === 'user-agent' ? 'test-browser' : null;
      },
    },
    eventType: 'auth.login',
    outcome: 'failure',
    subject: 'Person@Example.com',
    metadata: { code: 'INVALID_CREDENTIALS' },
  });

  assert.match(event.subjectHash, /^[a-f0-9]{64}$/);
  assert.match(event.ipHash, /^[a-f0-9]{64}$/);
  assert.notEqual(event.subjectHash, 'person@example.com');
  assert.equal(event.userAgent, 'test-browser');
  assert.equal(event.metadata.code, 'INVALID_CREDENTIALS');
});
