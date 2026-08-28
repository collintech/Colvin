import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { installTestRuntimeEnv } from './helpers/runtime-env.js';

installTestRuntimeEnv();

const { parsePwnedPasswordRange } = await import('../src/services/password-security.service.js');

test('Pwned Passwords range parsing matches only the full SHA-1 suffix', () => {
  const password = 'Colvin-Range-Test-Password';
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const suffix = hash.slice(5);
  const body = `00000000000000000000000000000000000:4\n${suffix}:27\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`;

  assert.equal(parsePwnedPasswordRange(body, hash), 27);
  assert.equal(parsePwnedPasswordRange('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9', hash), 0);
});
