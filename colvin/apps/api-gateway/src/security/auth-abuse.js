import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { redis } from '../cache/redis.js';
import { recordAuthAudit } from '../services/auth-audit.service.js';
import { sha256 } from '../utils/hash.js';

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export function authAbuseKey(action, dimension, identity) {
  return `colvin:v1:auth-limit:${env.AUTH_LIMIT_NAMESPACE}:${action}:${dimension}:${sha256(String(identity).toLowerCase())}`;
}

export async function consumeAuthLimit(
  { action, dimension, identity, limit, windowSeconds },
  client = redis,
) {
  const key = authAbuseKey(action, dimension, identity);
  const [count, ttl] = await client.eval(FIXED_WINDOW_SCRIPT, 1, key, windowSeconds);
  return {
    key,
    count: Number(count),
    ttlSeconds: Math.max(0, Number(ttl)),
    blocked: Number(count) > limit,
  };
}

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginRules(req) {
  return [
    {
      action: 'login',
      dimension: 'account',
      identity: req.body.email,
      limit: env.AUTH_LOGIN_ACCOUNT_LIMIT,
      windowSeconds: env.AUTH_LOGIN_WINDOW_SECONDS,
    },
    {
      action: 'login',
      dimension: 'ip',
      identity: requestIp(req),
      limit: env.AUTH_LOGIN_IP_LIMIT,
      windowSeconds: env.AUTH_LOGIN_WINDOW_SECONDS,
    },
  ];
}

function registerRules(req) {
  return [
    {
      action: 'register',
      dimension: 'ip',
      identity: requestIp(req),
      limit: env.AUTH_REGISTER_IP_LIMIT,
      windowSeconds: env.AUTH_REGISTER_WINDOW_SECONDS,
    },
  ];
}

function refreshRules(req) {
  return [
    {
      action: 'refresh',
      dimension: 'ip',
      identity: requestIp(req),
      limit: env.AUTH_REFRESH_IP_LIMIT,
      windowSeconds: env.AUTH_REFRESH_WINDOW_SECONDS,
    },
  ];
}

function createGuard(rulesForRequest, eventType) {
  return async (req, _res, next) => {
    try {
      for (const rule of rulesForRequest(req)) {
        const result = await consumeAuthLimit(rule);
        if (!result.blocked) continue;

        await recordAuthAudit({
          req,
          eventType,
          outcome: 'blocked',
          subject: req.body?.email,
          metadata: {
            dimension: rule.dimension,
            retryAfterSeconds: result.ttlSeconds,
          },
        });

        return next(
          new AppError(
            429,
            'AUTH_RATE_LIMITED',
            'Too many authentication attempts. Try again later.',
            { retryAfterSeconds: result.ttlSeconds },
          ),
        );
      }
      return next();
    } catch (error) {
      // The existing process-local express-rate-limit middleware remains active,
      // so Redis failure degrades distributed coordination rather than removing
      // throttling entirely.
      logger.warn({ error, eventType }, 'Distributed authentication limiter unavailable');
      return next();
    }
  };
}

export const distributedLoginGuard = createGuard(loginRules, 'auth.login.rate_limited');
export const distributedRegisterGuard = createGuard(registerRules, 'auth.register.rate_limited');
export const distributedRefreshGuard = createGuard(refreshRules, 'auth.refresh.rate_limited');
