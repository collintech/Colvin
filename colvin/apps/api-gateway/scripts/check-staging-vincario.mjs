import console from 'node:console';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

if (
  process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging' ||
  process.env.RAILWAY_SERVICE_NAME !== 'api-gateway' ||
  !process.stdin.isTTY ||
  process.argv.length !== 2
) {
  console.error('Run interactively on Railway staging → api-gateway without arguments.');
  process.exit(1);
}

const terminal = createInterface({
  input: process.stdin,
  output: new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  }),
  terminal: true,
});
const ask = async (label) => {
  process.stdout.write(label);
  try {
    return (await terminal.question('')).trim();
  } finally {
    process.stdout.write('\n');
  }
};
const { closePostgres, query } = await import('../src/database/postgres.js');
const { closeRedis, redis, vehicleCacheKey } = await import('../src/cache/redis.js');
let stage = 'saved vehicle check';
try {
  const vin = (await ask('Saved UK Toyota VIN (hidden): ')).toUpperCase();
  if (!/^SB1[A-HJ-NPR-Z0-9]{14}$/.test(vin)) throw new Error();
  const condition = `WHERE vin = $1 AND make = 'Toyota'
    AND (model IS NULL OR model = 'Avensis') AND (model_year IS NULL OR model_year = 2003)`;
  if ((await query(`SELECT 1 FROM vehicles ${condition}`, [vin])).rowCount !== 1) {
    throw new Error();
  }
  stage = 'credential input';
  const key = await ask('Replacement Vincario API key (hidden): ');
  const secret = await ask('Replacement Vincario secret key (hidden): ');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(key) || !secret || secret.length > 256) throw new Error();
  terminal.close();

  stage = 'single Vincario request';
  const checksum = createHash('sha1')
    .update(`${vin}|decode|${key}|${secret}`)
    .digest('hex')
    .slice(0, 10);
  const response = await globalThis.fetch(
    `https://api.vincario.com/3.2/${key}/${checksum}/decode/${vin}.json`,
    {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok || !response.body) throw new Error();
  stage = 'response validation';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 ** 21) throw new Error();
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  const payload = JSON.parse(body);
  if (payload.success === false || !Array.isArray(payload.decode)) throw new Error();
  const fields = new Map(
    payload.decode.map(({ label, value }) => [
      String(label).trim().toLowerCase(),
      String(value ?? '').trim(),
    ]),
  );
  const attributes = {
    engineCode: fields.get('engine code'),
    engineDisplacementCcm: fields.get('engine displacement (ccm)'),
    trim: fields.get('trim'),
  };
  if (
    fields.get('make') !== 'Toyota' ||
    fields.get('model') !== 'Avensis' ||
    fields.get('model year') !== '2003' ||
    attributes.engineCode !== '1ZZFE' ||
    attributes.engineDisplacementCcm !== '1800' ||
    attributes.trim !== 'FC16'
  ) {
    throw new Error();
  }

  stage = 'saved vehicle update';
  const source = [
    {
      provider: 'vincario',
      kind: 'commercial-enriched',
      authoritative: false,
      fields: ['make', 'model', 'modelYear', 'engineCode', 'engineDisplacementCcm', 'trim'],
    },
  ];
  const updated = await query(
    `UPDATE vehicles SET model = 'Avensis', model_year = 2003,
        provider_attributes = COALESCE(provider_attributes, '{}'::jsonb) || $2::jsonb,
        provider_sources = CASE WHEN COALESCE(provider_sources, '[]'::jsonb) @> $3::jsonb
          THEN provider_sources ELSE COALESCE(provider_sources, '[]'::jsonb) || $3::jsonb END,
        provider_refreshed_at = now(), updated_at = now() ${condition}`,
    [vin, JSON.stringify(attributes), JSON.stringify(source)],
  );
  if (updated.rowCount !== 1) throw new Error();
  stage = 'cache invalidation (vehicle already updated)';
  await redis.del(vehicleCacheKey(vin));
  console.log('Staging Vincario check passed: 2003 Toyota Avensis · 1ZZFE · 1800 cc · FC16');
} catch {
  console.error(`Staging Vincario check stopped at: ${stage}. Do not retry until diagnosed.`);
  process.exitCode = 1;
} finally {
  terminal.close();
  await Promise.allSettled([closePostgres(), closeRedis()]);
}
