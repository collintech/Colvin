import { clearTimeout, setTimeout } from 'node:timers';

import { app } from './app.js';
import { closeRedis, connectRedis } from './cache/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closePostgres, pool } from './database/postgres.js';

async function start() {
  await pool.query('SELECT 1');
  await connectRedis().catch((error) =>
    logger.warn({ error }, 'Redis unavailable at startup; continuing in degraded mode'),
  );

  const server = app.listen(env.API_PORT, () =>
    logger.info({ port: env.API_PORT }, 'API gateway started'),
  );

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();

    server.close(async () => {
      await Promise.allSettled([closePostgres(), closeRedis()]);
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  logger.fatal({ error }, 'Failed to start API gateway');
  process.exit(1);
});
