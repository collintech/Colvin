import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { postgresTlsOptions } from './pg-tls.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
  ssl: postgresTlsOptions({
    connectionString: env.DATABASE_URL,
    mode: env.DB_SSL_MODE,
    caBase64: env.DB_SSL_CA_BASE64,
  }),
});

pool.on('error', (error) => logger.error({ error }, 'Unexpected PostgreSQL pool error'));

export const query = (text, params = []) => pool.query(text, params);
export const closePostgres = () => pool.end();
