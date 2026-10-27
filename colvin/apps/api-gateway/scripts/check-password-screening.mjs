import { randomBytes } from 'node:crypto';
import process from 'node:process';

import { env } from '../src/config/env.js';
import { assertPasswordNotCompromised } from '../src/services/password-security.service.js';

// A public breached sample and an ephemeral random sample; no account is read or changed.
try {
  if (env.PASSWORD_COMPROMISE_CHECK !== 'hibp') {
    process.stderr.write('Password screening check requires PASSWORD_COMPROMISE_CHECK=hibp.\n');
    process.exitCode = 1;
  } else {
    let rejected = false;
    try {
      await assertPasswordNotCompromised('Password123!');
    } catch (error) {
      if (error.code !== 'COMPROMISED_PASSWORD') throw error;
      rejected = true;
    }
    if (!rejected) throw new Error('Known breached sample was accepted');
    process.stdout.write('Known breached sample: rejected.\n');

    await assertPasswordNotCompromised(randomBytes(32).toString('base64url'));
    process.stdout.write('Generated sample: accepted.\nHIBP password screening check passed.\n');
  }
} catch (error) {
  const failure = error.details?.kind ?? 'unknown';
  const httpStatus = error.details?.httpStatus ? `, HTTP ${error.details.httpStatus}` : '';
  const reason =
    error.code === 'PASSWORD_SCREENING_UNAVAILABLE'
      ? `Password screening is unavailable (${failure}${httpStatus}).`
      : 'A screening expectation failed; investigate before accepting this gate.';
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
}
