import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
const { Pool } = pg;
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});
pool.on('error', (error) => logger.error({ error }, 'Unexpected PostgreSQL pool error'));
export const query = (text, params = []) => pool.query(text, params);
