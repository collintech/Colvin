import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

import {
  clearAccountActionUrl,
  readAccountActionToken,
} from '../src/features/auth/account-action-link.js';

const token = 'A'.repeat(43);
let vite;
let ResetPasswordPage;
let VerifyEmailPage;

before(async () => {
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'silent',
    esbuild: { jsx: 'automatic' },
    // Match Node 24's conditional exports when Vite loads the real router.
    ssr: { resolve: { externalConditions: ['node', 'module-sync'] } },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  ({ default: ResetPasswordPage } = await vite.ssrLoadModule(
    '/src/features/auth/ResetPasswordPage.jsx',
  ));
  ({ default: VerifyEmailPage } = await vite.ssrLoadModule(
    '/src/features/auth/VerifyEmailPage.jsx',
  ));
});

after(async () => {
  await vite?.close();
});

test('query and fragment account links decode the same opaque token without changing the input', () => {
  for (const location of [
    { search: `?token=${token}` },
    { hash: `#token=${token}` },
    { search: `?source=email&%74oken=${token}`, hash: '#section' },
  ]) {
    const before = JSON.stringify(location);
    assert.equal(readAccountActionToken(location), token);
    assert.equal(readAccountActionToken(location), token);
    assert.equal(JSON.stringify(location), before);
  }
  assert.equal(readAccountActionToken({ hash: `#token=${'B'.repeat(43)}` }), 'B'.repeat(43));
});

test('missing, empty, oversized and ambiguous tokens cannot select an account action', () => {
  for (const location of [
    {},
    { search: '?token=' },
    { hash: '#token=' },
    { search: `?token=${'A'.repeat(31)}` },
    { hash: `#token=${'A'.repeat(257)}` },
    { search: `?token=${token}&token=${token}` },
    { hash: `#token=${token}&token=${token}` },
    { search: `?token=${token}`, hash: `#token=${token}` },
    { search: `?token=${token}&source=${'X'.repeat(2048)}` },
  ]) {
    assert.equal(readAccountActionToken(location), '');
  }
});

test('address cleanup preserves router history state and is restricted to account-action pages', () => {
  const calls = [];
  const history = {
    state: { idx: 2, key: 'router-key', usr: { retained: true } },
    replaceState(...args) {
      calls.push(args);
    },
  };
  for (const path of ['/reset-password', '/verify-email']) {
    clearAccountActionUrl(history, path);
    assert.deepEqual(calls.at(-1), [history.state, '', path]);
  }
  clearAccountActionUrl(history, '/account');
  assert.equal(calls.length, 2);
});

test('both real account-action pages accept current and future link formats without rendering tokens', () => {
  for (const [path, component] of [
    ['/reset-password', ResetPasswordPage],
    ['/verify-email', VerifyEmailPage],
  ]) {
    for (const suffix of [`?token=${token}`, `#token=${token}`]) {
      const html = renderToStaticMarkup(
        createElement(StaticRouter, { location: path + suffix }, createElement(component)),
      );
      assert.equal(html.includes('missing its token'), false);
      assert.equal(html.includes(token), false);
      assert.doesNotMatch(html, /<button[^>]*disabled/);
      assert.match(html, path === '/reset-password' ? /Reset password/ : /Verify email/);
    }
  }
});

test('real forms reject an ambiguous link rather than preferring one account token', () => {
  for (const [path, component] of [
    ['/reset-password', ResetPasswordPage],
    ['/verify-email', VerifyEmailPage],
  ]) {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: `${path}?token=${token}#token=${'B'.repeat(43)}` },
        createElement(component),
      ),
    );
    assert.match(html, /missing its token/);
    assert.equal(html.includes(token), false);
    if (path === '/reset-password') assert.match(html, /<button[^>]*disabled/);
    else assert.doesNotMatch(html, /<button/);
  }
});
