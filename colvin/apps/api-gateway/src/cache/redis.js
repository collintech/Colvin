import Redis from 'ioredis';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  connectTimeout: 2000,
  commandTimeout: 1500,
  retryStrategy(times) {
    return Math.min(times * 100, 1000);
  },
});

redis.on('error', (error) => logger.warn({ error }, 'Redis unavailable'));

export function vehicleCacheKey(vin) {
  return `colvin:v1:vehicle:${vin}`;
}

export async function connectRedis() {
  if (redis.status === 'wait') await redis.connect();
}

export async function closeRedis(client = redis) {
  if (client.status === 'end') return;
  if (client.status === 'wait') {
    client.disconnect();
    return;
  }

  try {
    await client.quit();
  } catch (error) {
    logger.warn({ error }, 'Redis graceful shutdown failed; disconnecting');
    client.disconnect();
  }
}

export async function cacheGetJson(key, client = redis) {
  try {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch (error) {
    logger.warn({ error, key }, 'Redis cache read failed; continuing without cache');
    return null;
  }
}

export async function cacheSetJson(key, value, ttlSeconds, client = redis) {
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (error) {
    logger.warn({ error, key }, 'Redis cache write failed; continuing without cache');
    return false;
  }
}

export async function cacheDelete(key, client = redis) {
  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.warn({ error, key }, 'Redis cache invalidation failed; continuing without cache');
    return false;
  }
}

export function invalidateVehicleCache(vin, client = redis) {
  return cacheDelete(vehicleCacheKey(vin), client);
}

export async function pingRedis(client = redis) {
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}
