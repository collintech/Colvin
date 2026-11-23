import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { validate } from '../src/middleware/validate.js';
import { requireBetaInvite } from '../src/security/beta-invite.js';
import { registerSchema } from '../src/validators/auth.schemas.js';

const email = 'tester@example.com';
const inviteCode = 'synthetic-invite-code';
const digest = createHash('sha256')
  .update(email + '\n' + inviteCode)
  .digest('hex');

function evaluate(digests, fields) {
  const req = { body: { email, password: 'synthetic password', ...fields } };
  let result;
  validate(registerSchema)(req, null, (error) => {
    assert.ifError(error);
    requireBetaInvite(digests)(req, null, (error) => {
      result = error;
    });
  });
  return result;
}

test('open registration still accepts the original signup payload', () => {
  assert.equal(evaluate(undefined, {}), undefined);
});

test('staging signup requires the matching email and code', () => {
  assert.equal(evaluate([digest], { email: 'Tester@EXAMPLE.COM', inviteCode }), undefined);
  for (const fields of [
    {},
    { inviteCode: 'wrong-code' },
    { email: 'another@example.com', inviteCode },
  ]) {
    const error = evaluate([digest], fields);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, 'INVITE_REQUIRED');
    assert.equal(error.details, undefined);
  }
});
