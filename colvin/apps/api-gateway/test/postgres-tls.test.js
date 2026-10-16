import assert from 'node:assert/strict';
import test from 'node:test';

import { postgresTlsOptions } from '../src/database/pg-tls.js';

const connectionString = 'postgresql://user:password@postgres.railway.internal:5432/railway';

test('development may opt out of PostgreSQL TLS explicitly', () => {
  assert.equal(postgresTlsOptions({ connectionString, mode: 'disable' }), false);
});

test('verify-full configures CA trust and hostname verification', () => {
  const pem = '-----BEGIN CERTIFICATE-----\npublic CA data\n-----END CERTIFICATE-----\n';
  const result = postgresTlsOptions({
    connectionString,
    mode: 'verify-full',
    caBase64: Buffer.from(pem).toString('base64'),
  });
  assert.equal(result.rejectUnauthorized, true);
  assert.equal(result.servername, 'postgres.railway.internal');
  assert.equal(result.ca, pem);
});

test('verify-full rejects connection URL TLS overrides', () => {
  assert.throws(
    () =>
      postgresTlsOptions({
        connectionString: connectionString + '?sslmode=no-verify',
        mode: 'verify-full',
      }),
    /Remove SSL query parameters/,
  );
});

test('verify-full refuses invalid CA PEM and unsupported modes', () => {
  assert.throws(
    () =>
      postgresTlsOptions({
        connectionString,
        mode: 'verify-full',
        caBase64: Buffer.from('not a PEM').toString('base64'),
      }),
    /base64-encoded PEM/,
  );
  assert.throws(
    () => postgresTlsOptions({ connectionString, mode: 'prefer' }),
    /Unsupported PostgreSQL TLS mode/,
  );
});
