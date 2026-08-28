import assert from 'node:assert/strict';
import test from 'node:test';

import { installTestRuntimeEnv } from './helpers/runtime-env.js';

installTestRuntimeEnv();

const [{ errorHandler }, { AppError }] = await Promise.all([
  import('../src/middleware/errorHandler.js'),
  import('../src/errors/AppError.js'),
]);

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('5xx error envelopes do not expose internal details', () => {
  const res = responseRecorder();
  errorHandler(
    new AppError(503, 'UPSTREAM_FAILED', 'sensitive upstream message', { upstream: 'secret' }),
    { id: 'req-test' },
    res,
    () => {},
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.message, 'An unexpected error occurred');
  assert.equal(res.body.error.details, undefined);
});
