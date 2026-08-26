import { pingRedis } from '../cache/redis.js';
import { pool } from '../database/postgres.js';

export async function getReadiness({
  databasePing = () => pool.query('SELECT 1'),
  cachePing = () => pingRedis(),
} = {}) {
  const [database, cache] = await Promise.allSettled([databasePing(), cachePing()]);
  const databaseReady = database.status === 'fulfilled';
  const cacheReady = cache.status === 'fulfilled' && cache.value === true;

  return {
    ready: databaseReady,
    status: databaseReady ? (cacheReady ? 'ready' : 'degraded') : 'not_ready',
    dependencies: {
      postgres: databaseReady ? 'ready' : 'unavailable',
      redis: cacheReady ? 'ready' : 'degraded',
    },
  };
}
