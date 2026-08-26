import { setTimeout } from 'node:timers';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './database/postgres.js';
import { connectRedis, redis } from './cache/redis.js';

async function start() {
  await pool.query('SELECT 1');
  await connectRedis().catch((error) =>
    logger.warn({ error }, 'Redis unavailable at startup; continuing in degraded mode'),
  );

  const server = app.listen(env.API_PORT, () =>
    logger.info({ port: env.API_PORT }, 'API gateway started'),
  );

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');

    server.close(async () => {
      await Promise.allSettled([pool.end(), redis.quit()]);
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  logger.fatal({ error }, 'Failed to start API gateway');
  process.exit(1);
});
