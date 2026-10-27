import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import test, { beforeEach } from 'node:test';
import { URL } from 'node:url';

import { installTestRuntimeEnv } from './helpers/runtime-env.js';

installTestRuntimeEnv();

const { env } = await import('../src/config/env.js');
const { logger } = await import('../src/config/logger.js');
const { parsePwnedPasswordRange, compromisedPasswordCount, assertPasswordNotCompromised } =
  await import('../src/services/password-security.service.js');
const password = 'Colvin-Range-Test-Password';
const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
const suffix = hash.slice(5);
const otherSuffix = 'F'.repeat(35);

beforeEach(() => {
  env.PASSWORD_COMPROMISE_CHECK = 'hibp';
  env.PASSWORD_COMPROMISE_TIMEOUT_MS = 500;
});

test('Pwned Passwords range parsing matches only the full SHA-1 suffix', () => {
  const body = `00000000000000000000000000000000000:4\n${suffix}:27\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`;

  assert.equal(parsePwnedPasswordRange(body, hash), 27);
  assert.equal(parsePwnedPasswordRange('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9', hash), 0);
});

test('range parsing accepts CRLF, lowercase suffixes and zero-count padding', () => {
  assert.equal(
    parsePwnedPasswordRange(`${otherSuffix}:2\r\n${suffix.toLowerCase()}:27\r\n`, hash),
    27,
  );
  assert.equal(parsePwnedPasswordRange(`${suffix}:0\r\n`, hash), 0);
});

test('empty, malformed and unsafe-count ranges cannot be treated as an absent password', () => {
  for (const body of [
    '',
    ' \r\n',
    '<html>upstream error</html>',
    `${suffix}:NaN`,
    `${suffix}:-1`,
    `${suffix}:1.5`,
    `${suffix}:1e3`,
    `${suffix}:9007199254740992`,
    `${suffix}:0\nmalformed`,
    `${otherSuffix}:invalid`,
  ]) {
    assert.throws(() => parsePwnedPasswordRange(body, hash), /Invalid Pwned Passwords response/);
  }
});

test('duplicate padding cannot override a positive match', () => {
  assert.equal(parsePwnedPasswordRange(`${suffix}:0\n${suffix}:27\n${suffix}:0`, hash), 27);
});

test('only the five-character hash prefix is sent with padding, a timeout and redirect refusal', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    assert.equal(options.headers['Add-Padding'], 'true');
    assert.match(options.headers['User-Agent'], /^Colvin\//);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof globalThis.AbortSignal);
    assert.equal(options.signal.aborted, false);
    const request = JSON.stringify({ url, options });
    for (const secret of [password, hash, suffix]) assert.equal(request.includes(secret), false);
    return new globalThis.Response(`${otherSuffix}:2\r\n${suffix}:27\r\n`);
  });
  assert.equal(await compromisedPasswordCount(password), 27);
  assert.equal(fetch.mock.callCount(), 1);
});

test('a positive range match is rejected and an absent match is accepted', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new globalThis.Response(`${suffix}:27`),
  );
  await assert.rejects(assertPasswordNotCompromised(password), {
    code: 'COMPROMISED_PASSWORD',
    statusCode: 400,
  });
  fetch.mock.mockImplementation(async () => new globalThis.Response(`${otherSuffix}:3`));
  await assertPasswordNotCompromised(password);
});

test('the local deny-list works without network access and development opt-out skips HIBP', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    assert.fail('Unexpected HIBP request'),
  );
  await assert.rejects(assertPasswordNotCompromised('password12345'), {
    code: 'COMPROMISED_PASSWORD',
  });
  env.PASSWORD_COMPROMISE_CHECK = 'disabled';
  await assertPasswordNotCompromised(password);
  assert.equal(fetch.mock.callCount(), 0);
});

test('HTTP failures, including 404 and empty 204, fail closed without logging provider data', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const log = t.mock.method(logger, 'error', () => {});
  for (const status of [204, 302, 404, 429, 503]) {
    fetch.mock.mockImplementation(async () => new globalThis.Response(null, { status }));
    await assert.rejects(compromisedPasswordCount(password), {
      code: 'PASSWORD_SCREENING_UNAVAILABLE',
      statusCode: 503,
    });
    assert.deepEqual(log.mock.calls.at(-1).arguments[0], {
      provider: 'hibp',
      kind: 'http',
      httpStatus: status,
    });
  }
});

test('HTTP 200 with invalid or oversized content fails closed and logs no password or hash', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const log = t.mock.method(logger, 'error', () => {});
  for (const body of ['', `raw-provider-detail ${password} ${hash}`, 'A'.repeat(1024 * 1024 + 1)]) {
    fetch.mock.mockImplementation(async () => new globalThis.Response(body));
    await assert.rejects(compromisedPasswordCount(password), (error) => {
      assert.equal(error.code, 'PASSWORD_SCREENING_UNAVAILABLE');
      const serialized = JSON.stringify({
        error: { ...error, message: error.message },
        logs: log.mock.calls.map((call) => call.arguments),
      });
      for (const secret of [password, hash, suffix, 'raw-provider-detail'])
        assert.equal(serialized.includes(secret), false);
      return true;
    });
  }
  assert.equal(log.mock.calls.at(-1).arguments[0].kind, 'response_too_large');
});

test('network and timeout failures expose only a bounded failure kind', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const log = t.mock.method(logger, 'error', () => {});
  for (const [name, kind] of [
    ['TypeError', 'network'],
    ['TimeoutError', 'timeout'],
    ['AbortError', 'timeout'],
  ]) {
    fetch.mock.mockImplementation(async () => {
      throw Object.assign(new Error(`${password} ${hash}`), { name });
    });
    await assert.rejects(compromisedPasswordCount(password), {
      code: 'PASSWORD_SCREENING_UNAVAILABLE',
      statusCode: 503,
    });
    assert.deepEqual(log.mock.calls.at(-1).arguments[0], { provider: 'hibp', kind });
  }
});

test('production configuration requires HIBP and accepts its enabled configuration', () => {
  const productionEnv = {
    ...process.env,
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_synthetic_configuration_test',
    EMAIL_FROM: 'Colvin <onboarding@resend.dev>',
    DB_SSL_MODE: 'verify-full',
  };
  for (const mode of ['disabled', 'hibp']) {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', 'await import("./src/config/env.js")'],
      {
        cwd: new URL('../', import.meta.url),
        env: { ...productionEnv, PASSWORD_COMPROMISE_CHECK: mode },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, mode === 'hibp' ? 0 : 1);
    if (mode === 'disabled') assert.match(result.stderr, /PASSWORD_COMPROMISE_CHECK/);
  }
});
