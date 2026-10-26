import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import axios, { AxiosError } from 'axios';
import { createServer } from 'vite';

let vite;
let auth;
let api;
let tokenStore;
let handler;
let requests;
let redirects;
const originalAdapter = axios.defaults.adapter;
const originalWindow = globalThis.window;
const credentials = { email: 'user@example.com', password: 'test-password-123' };
const session = { user: { id: 'user-1' }, accessToken: 'new-access-token' };

function success(config, value) {
  return { config, status: 200, headers: {}, data: { success: true, data: value } };
}

function reject(config, code, message) {
  throw new AxiosError(message, 'ERR_BAD_REQUEST', config, undefined, {
    config,
    status: 401,
    headers: {},
    data: { success: false, error: { code, message } },
  });
}

before(async () => {
  // Exercise the real request wrappers and interceptors with an in-memory HTTP adapter.
  axios.defaults.adapter = async (config) => {
    requests.push(config.url);
    return handler(config);
  };
  globalThis.window = { location: { assign: (url) => redirects.push(url) } };
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  auth = await vite.ssrLoadModule('/src/features/auth/auth.api.js');
  ({ default: api } = await vite.ssrLoadModule('/src/services/api.js'));
  tokenStore = await vite.ssrLoadModule('/src/services/tokenStore.js');
});

beforeEach(() => {
  requests = [];
  redirects = [];
  tokenStore.clearSession();
});

after(async () => {
  axios.defaults.adapter = originalAdapter;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  await vite?.close();
});

test('rejected login preserves its credential error without refreshing or redirecting', async () => {
  handler = (config) => {
    if (config.url === '/auth/login') {
      return reject(config, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    return reject(config, 'REFRESH_REQUIRED', 'Refresh session is required');
  };

  await assert.rejects(auth.loginRequest(credentials), (error) => {
    assert.equal(error.response.data.error.code, 'INVALID_CREDENTIALS');
    assert.equal(error.response.data.error.message, 'Email or password is incorrect');
    return true;
  });
  assert.deepEqual(requests, ['/auth/login']);
  assert.deepEqual(redirects, []);
});

test('successful login returns the new session without an extra refresh request', async () => {
  handler = (config) => success(config, session);
  assert.deepEqual(await auth.loginRequest(credentials), session);
  assert.deepEqual(requests, ['/auth/login']);
  assert.deepEqual(redirects, []);
});

test('an expired protected request still refreshes and retries with the new access token', async () => {
  tokenStore.setSession({ accessToken: 'old-access-token' });
  handler = (config) => {
    if (config.url === '/auth/refresh') return success(config, session);
    if (config.headers.Authorization === 'Bearer old-access-token') {
      return reject(config, 'INVALID_ACCESS_TOKEN', 'Access token expired');
    }
    assert.equal(config.headers.Authorization, 'Bearer new-access-token');
    return success(config, { user: session.user });
  };

  const result = await api.get('/auth/me');
  assert.deepEqual(result.data.data, { user: session.user });
  assert.deepEqual(requests, ['/auth/me', '/auth/refresh', '/auth/me']);
  assert.deepEqual(tokenStore.getSession(), session);
  assert.deepEqual(redirects, []);
});

test('an expired refresh session still clears authentication and returns to login', async () => {
  tokenStore.setSession({ accessToken: 'old-access-token' });
  handler = (config) => reject(config, 'REFRESH_REQUIRED', 'Refresh session is required');

  await assert.rejects(api.get('/auth/me'), (error) => {
    assert.equal(error.response.data.error.code, 'REFRESH_REQUIRED');
    return true;
  });
  assert.deepEqual(requests, ['/auth/me', '/auth/refresh']);
  assert.equal(tokenStore.getSession(), null);
  assert.deepEqual(redirects, ['/login']);
});
