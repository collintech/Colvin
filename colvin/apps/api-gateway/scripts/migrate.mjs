import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

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

const client = new Client({ connectionString: databaseUrl });

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

      console.log(`skip ${filename}`);
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
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
