import pino from 'pino';

import { env } from './env.js';

// Allow only diagnostic request fields; query values and bodies are excluded.
export function serializeHttpRequest(request) {
  return {
    id: request.id,
    method: request.method,
    url: request.url?.split(/[?#]/, 1)[0],
    headers: request.headers,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}

export function createLogger({ level = env.LOG_LEVEL, destination } = {}) {
  return pino(
    {
      level,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.referer',
        'req.headers["x-internal-api-key"]',
        'res.headers["set-cookie"]',
        'error.config.headers',
        'password',
        'passwordHash',
        'refreshToken',
      ],
    },
    destination,
  );
}

export const logger = createLogger();
