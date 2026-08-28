import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password12345',
  '123456789012',
  'qwerty123456',
  'letmein123456',
  'admin12345678',
]);

export function parsePwnedPasswordRange(body, fullHash) {
  const suffix = fullHash.slice(5).toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const [candidate, rawCount] = line.trim().split(':');
    if (candidate?.toUpperCase() !== suffix) continue;
    const count = Number(rawCount);
    return Number.isFinite(count) ? count : 0;
  }
  return 0;
}

export async function compromisedPasswordCount(password) {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 1;
  if (env.PASSWORD_COMPROMISE_CHECK !== 'hibp') return 0;

  const fullHash = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = fullHash.slice(0, 5);

  try {
    const response = await globalThis.fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'Colvin/1.0 password-screening',
      },
      signal: globalThis.AbortSignal.timeout(env.PASSWORD_COMPROMISE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Pwned Passwords returned HTTP ${response.status}`);
    }

    return parsePwnedPasswordRange(await response.text(), fullHash);
  } catch (error) {
    logger.error({ error }, 'Compromised-password screening unavailable');
    throw new AppError(
      503,
      'PASSWORD_SCREENING_UNAVAILABLE',
      'Password security screening is temporarily unavailable',
    );
  }
}

export async function assertPasswordNotCompromised(password) {
  const count = await compromisedPasswordCount(password);
  if (count > 0) {
    throw new AppError(
      400,
      'COMPROMISED_PASSWORD',
      'Choose a password that has not appeared in known password breaches',
    );
  }
}
