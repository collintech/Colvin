import rateLimit from 'express-rate-limit';

function createLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: {
      success: false,
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Try again later.',
      },
    },
  });
}

export const loginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, limit: 10 });
export const registerLimiter = createLimiter({ windowMs: 60 * 60 * 1000, limit: 10 });
export const refreshLimiter = createLimiter({ windowMs: 5 * 60 * 1000, limit: 60 });
