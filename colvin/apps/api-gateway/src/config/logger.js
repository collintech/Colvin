import pino from 'pino';

import { env } from './env.js';

export function createLogger({ level = env.LOG_LEVEL, destination } = {}) {
  return pino(
    {
      level,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-internal-api-key"]',
        'res.headers["set-cookie"]',
        'password',
        'passwordHash',
        'refreshToken',
      ],
    },
    destination,
  );
}

export const logger = createLogger();
