import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});
redis.on('error', (error) => logger.error({ error }, 'Redis error'));
export async function connectRedis() {
  if (redis.status === 'wait') await redis.connect();
}
