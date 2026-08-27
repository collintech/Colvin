import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('Integration tests require a root .env file.');
  process.exit(1);
}

process.loadEnvFile(envPath);

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;

if (!databaseUrl || !redisUrl) {
  console.error('MIGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are required in .env.');
  process.exit(1);
}

const integrationEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  INTEGRATION_DATABASE_URL: databaseUrl,
  INTEGRATION_REDIS_URL: redisUrl,

  // Security-sensitive application config is required when the integration
  // suite imports the real API Gateway. These defaults exist only in the
  // child-process environment used by integration tests and never replace
  // explicitly configured values from .env / CI.
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || 'colvin-integration-access-secret-not-for-production',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || 'colvin-integration-refresh-secret-not-for-production',
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || 'colvin-integration-internal-key',
  VIN_DECODER_URL: process.env.VIN_DECODER_URL || 'http://localhost:8081',
  HISTORY_SERVICE_URL: process.env.HISTORY_SERVICE_URL || 'http://localhost:8082',
};

run(
  process.execPath,
  ['--test', 'test-integration/**/*.test.js'],
  path.join(root, 'apps', 'api-gateway'),
);
run(
  'go',
  [
    '-C',
    path.join(root, 'apps', 'services-go', 'history-service'),
    'test',
    '-tags=integration',
    './internal/history',
  ],
  root,
);

console.log('Colvin persistence and auth integration tests passed.');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: integrationEnv,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
