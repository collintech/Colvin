import dotenv from 'dotenv';
import { log } from 'node:console';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { postgresTlsOptions } from '../src/database/pg-tls.js';

const { Client } = pg;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '../../..');
const envPath = path.join(repositoryRoot, '.env');
const migrationsDir = path.join(repositoryRoot, 'database', 'migrations');

// Migrations are normally executed from the developer/CI host, while the
// application services may use Docker-internal hostnames. Load the repository
// environment explicitly and allow a dedicated host-side connection string.
dotenv.config({ path: envPath });

const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'MIGRATION_DATABASE_URL (preferred) or DATABASE_URL is required to run migrations. ' +
      `Expected environment file: ${envPath}`,
  );
}

const dbSslMode =
  process.env.DB_SSL_MODE ?? (process.env.NODE_ENV === 'production' ? 'verify-full' : 'disable');
if (process.env.NODE_ENV === 'production' && dbSslMode !== 'verify-full') {
  throw new Error('Production migrations require verify-full PostgreSQL TLS');
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: postgresTlsOptions({
    connectionString: databaseUrl,
    mode: dbSslMode,
    caBase64: process.env.DB_SSL_CA_BASE64,
  }),
});

await client.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = (await fs.readdir(migrationsDir))
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();

  for (const filename of files) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Migration ${filename} changed after it was applied`);
      }

      log(`skip ${filename}`);
      continue;
    }

    await client.query('BEGIN');

    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename, checksum) VALUES ($1, $2)', [
        filename,
        checksum,
      ]);
      await client.query('COMMIT');
      log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
