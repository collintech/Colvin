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

const MAX_RANGE_BYTES = 1024 * 1024;

class ScreeningResponseError extends Error {
  constructor(kind, httpStatus) {
    super('Invalid Pwned Passwords response');
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export function parsePwnedPasswordRange(body, fullHash) {
  if (typeof body !== 'string' || !body.trim() || !/^[A-F0-9]{40}$/i.test(fullHash)) {
    throw new ScreeningResponseError('invalid_response');
  }
  const suffix = fullHash.slice(5).toUpperCase();
  let matchedCount = 0;
  for (const line of body.trim().split(/\r?\n/)) {
    const match = /^([A-F0-9]{35}):([0-9]+)$/i.exec(line.trim());
    if (!match) throw new ScreeningResponseError('invalid_response');
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count)) throw new ScreeningResponseError('invalid_response');
    if (match[1].toUpperCase() === suffix) matchedCount = Math.max(matchedCount, count);
  }
  return matchedCount;
}

async function readPasswordRange(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_RANGE_BYTES) throw new ScreeningResponseError('response_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
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
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(env.PASSWORD_COMPROMISE_TIMEOUT_MS),
    });

    if (response.status !== 200) {
      if (response.body) await response.body.cancel().catch(() => {});
      throw new ScreeningResponseError('http', response.status);
    }

    return parsePwnedPasswordRange(await readPasswordRange(response), fullHash);
  } catch (error) {
    const failure =
      error instanceof ScreeningResponseError
        ? { kind: error.kind, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) }
        : { kind: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network' };
    logger.error({ provider: 'hibp', ...failure }, 'Compromised-password screening unavailable');
    throw new AppError(
      503,
      'PASSWORD_SCREENING_UNAVAILABLE',
      'Password security screening is temporarily unavailable',
      { provider: 'hibp', ...failure },
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
