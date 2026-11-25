import console from 'node:console';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const flags = process.argv.slice(2);
const apply = flags.length === 1 && flags[0] === '--apply';
if (
  process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
  process.env.RAILWAY_SERVICE_NAME !== 'api-gateway' ||
  (flags.length !== 0 && !apply) ||
  !process.stdin.isTTY
) {
  console.error('Run interactively on Railway staging → api-gateway, optionally with --apply.');
  process.exit(1);
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const vin = (await terminal.question('Enter the affected UK Toyota VIN: ')).trim().toUpperCase();
terminal.close();
if (!/^SB1[A-HJ-NPR-Z0-9]{14}$/.test(vin)) {
  console.error('Expected a 17-character VIN starting with SB1.');
  process.exit(1);
}

const { closePostgres, query } = await import('../src/database/postgres.js');
const { closeRedis, redis, vehicleCacheKey } = await import('../src/cache/redis.js');
let stage = 'saved row check';
try {
  const condition = `WHERE vin = $1 AND decoded_at IS NOT NULL
      AND (make IS NULL OR make = $2)
      AND (manufacturer IS NULL OR manufacturer = $3)
      AND (country IS NULL OR country = $4)`;
  const params = [vin, 'Toyota', 'Toyota Motor Manufacturing UK Ltd', 'United Kingdom'];
  const saved = await query(`SELECT 1 FROM vehicles ${condition}`, params);
  if (saved.rowCount !== 1) throw new Error('No compatible saved vehicle');
  if (apply) {
    stage = 'saved row update';
    const updated = await query(
      `UPDATE vehicles SET make = COALESCE(make, $2),
        manufacturer = COALESCE(manufacturer, $3), country = COALESCE(country, $4),
        updated_at = now() ${condition}`,
      params,
    );
    if (updated.rowCount !== 1) throw new Error('No compatible saved vehicle');
    stage = 'single cache entry invalidation';
    await redis.del(vehicleCacheKey(vin));
  }
  console.log(apply ? 'Saved Toyota details refreshed.' : 'Dry run passed. No data changed.');
} catch {
  console.error(`Staging VIN refresh stopped at: ${stage}.`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([closePostgres(), closeRedis()]);
}
