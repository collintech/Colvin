import { randomUUID } from 'node:crypto';

import pino from 'pino';

import { env } from './env.js';

// Request and response headers stay out of HTTP logs, including unknown headers.
export function httpLogOptions(logger) {
  return {
    logger,
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
        url: request.url?.split(/[?#]/, 1)[0],
      }),
      res: (response) => ({ statusCode: response.statusCode }),
    },
    genReqId: (_request, response) => {
      const id = randomUUID();
      response.setHeader('x-request-id', id);
      return id;
    },
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
