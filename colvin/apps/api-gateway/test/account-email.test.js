import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { installTestRuntimeEnv } from './helpers/runtime-env.js';

installTestRuntimeEnv();

const { env } = await import('../src/config/env.js');
const { deliverAccountAction } = await import('../src/services/account-email.service.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');
const { logger } = await import('../src/config/logger.js');
const input = {
  email: 'recipient@example.com',
  purpose: 'password_reset',
  token: 'private-reset-token',
};

beforeEach(() => {
  Object.assign(env, {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_private_test_key',
    EMAIL_FROM: 'Colvin <onboarding@resend.dev>',
    EMAIL_DELIVERY_ATTEMPTS: 2,
  });
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function assertPrivateDataAbsent(error) {
  const serialized = JSON.stringify({ ...error, message: error.message, stack: error.stack });
  for (const secret of [input.email, input.token, env.RESEND_API_KEY, 'raw-provider-detail']) {
    assert.equal(serialized.includes(secret), false);
  }
}

test('account email sends its credential only in the authorization header', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, [input.email]);
    assert.match(body.html, /reset-password\?token=private-reset-token/);
    assert.equal(options.body.includes(env.RESEND_API_KEY), false);
    return response(200, { id: 'email-1' });
  });

  assert.deepEqual(await deliverAccountAction(input), { delivered: true });
  assert.equal(fetch.mock.callCount(), 1);
});

test('invalid credentials retain a safe provider reason and are not retried', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    response(401, {
      name: 'validation_error',
      message: `API key is invalid: ${env.RESEND_API_KEY} raw-provider-detail`,
    }),
  );

  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.equal(error.code, 'EMAIL_DELIVERY_FAILED');
    assert.equal(error.statusCode, 503);
    assert.deepEqual(error.details, {
      provider: 'resend',
      kind: 'http',
      httpStatus: 401,
      providerCode: 'validation_error',
      reason: 'invalid_api_key',
      attempts: 1,
    });
    assertPrivateDataAbsent(error);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test('test-recipient rejection is classified without logging the recipient', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    response(403, {
      name: 'validation_error',
      message: `You can only send testing emails to your own email address (${input.email}).`,
    }),
  );

  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.equal(error.details.reason, 'test_recipient_restricted');
    assertPrivateDataAbsent(error);
    return true;
  });
});

test('unknown provider fields and non-JSON bodies cannot leak into delivery errors', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    response(400, {
      name: input.email,
      message: `${input.token} raw-provider-detail`,
      authorization: env.RESEND_API_KEY,
    }),
  );
  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.deepEqual(error.details, {
      provider: 'resend',
      kind: 'http',
      httpStatus: 400,
      attempts: 1,
    });
    assertPrivateDataAbsent(error);
    return true;
  });

  fetch.mock.mockImplementation(async () => ({
    ok: false,
    status: 403,
    async json() {
      throw new SyntaxError('raw-provider-detail');
    },
  }));
  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.equal(error.details.httpStatus, 403);
    assertPrivateDataAbsent(error);
    return true;
  });
});

test('DNS failures retain only the network error code', async (t) => {
  env.EMAIL_DELIVERY_ATTEMPTS = 1;
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError(`fetch failed ${input.token}`, {
      cause: Object.assign(new Error('raw-provider-detail'), { code: 'ENOTFOUND' }),
    });
  });

  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.deepEqual(error.details, {
      provider: 'resend',
      kind: 'network',
      networkCode: 'ENOTFOUND',
      attempts: 1,
    });
    assertPrivateDataAbsent(error);
    return true;
  });
});

test('timeouts are distinguished from HTTP responses', async (t) => {
  env.EMAIL_DELIVERY_ATTEMPTS = 1;
  t.mock.method(globalThis, 'fetch', async () => {
    throw Object.assign(new Error('raw-provider-detail'), { name: 'TimeoutError' });
  });
  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.deepEqual(error.details, { provider: 'resend', kind: 'timeout', attempts: 1 });
    assertPrivateDataAbsent(error);
    return true;
  });
});

test('temporary provider failures use the existing bounded retry budget', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    response(503, {
      name: 'service_unavailable',
      message: 'raw-provider-detail',
    }),
  );
  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.equal(error.details.httpStatus, 503);
    assert.equal(error.details.attempts, 2);
    assertPrivateDataAbsent(error);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 2);
});

test('missing mail configuration is identified before making a provider request', async (t) => {
  delete env.EMAIL_FROM;
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected request'));
  await assert.rejects(deliverAccountAction(input), (error) => {
    assert.deepEqual(error.details, {
      provider: 'resend',
      kind: 'configuration',
      missing: ['EMAIL_FROM'],
      attempts: 0,
    });
    return true;
  });
  assert.equal(fetch.mock.callCount(), 0);
});

test('delivery diagnostics reach server logs but stay out of HTTP error responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    response(401, { name: 'validation_error', message: 'API key is invalid' }),
  );
  const log = t.mock.method(logger, 'error', () => {});
  let responseBody;
  const res = {
    status(status) {
      assert.equal(status, 503);
      return this;
    },
    json(body) {
      responseBody = body;
    },
  };

  await assert.rejects(deliverAccountAction(input), (error) => {
    errorHandler(error, { id: 'request-1' }, res, () => {});
    assert.equal(log.mock.calls[0].arguments[0].error.details.httpStatus, 401);
    assert.deepEqual(responseBody, {
      success: false,
      error: { code: 'EMAIL_DELIVERY_FAILED', message: 'An unexpected error occurred' },
      requestId: 'request-1',
    });
    return true;
  });
});
