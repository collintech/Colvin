import { query } from '../database/postgres.js';
export async function findVehicleByVin(vin) {
  return (await query('SELECT * FROM vehicles WHERE vin = $1', [vin])).rows[0] ?? null;
}
export async function upsertVehicle(data) {
  const result = await query(
    `INSERT INTO vehicles (vin, make, model, model_year, manufacturer, country, body_class, engine, decoded_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
  ON CONFLICT (vin) DO UPDATE SET make=EXCLUDED.make, model=EXCLUDED.model, model_year=EXCLUDED.model_year, manufacturer=EXCLUDED.manufacturer, country=EXCLUDED.country, body_class=EXCLUDED.body_class, engine=EXCLUDED.engine, decoded_at=now(), updated_at=now()
  RETURNING *`,
    [
      data.vin,
      data.make ?? null,
      data.model ?? null,
      data.modelYear ?? null,
      data.manufacturer ?? null,
      data.country ?? null,
      data.bodyClass ?? null,
      data.engine ?? null,
    ],
  );
  return result.rows[0];
}
export async function logLookup({ userId, vin, success, sourceIpHash, userAgent }) {
  await query(
    'INSERT INTO lookup_logs (user_id, vin, success, source_ip_hash, user_agent) VALUES ($1,$2,$3,$4,$5)',
    [userId, vin, success, sourceIpHash, userAgent],
  );
}
