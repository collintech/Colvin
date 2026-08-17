import { redis } from '../cache/redis.js';
import { decodeVin } from '../clients/vinDecoder.client.js';
import { getHistory } from '../clients/history.client.js';
import { findVehicleByVin, logLookup, upsertVehicle } from '../repositories/vehicle.repository.js';
import { sha256 } from '../utils/hash.js';
const CACHE_TTL_SECONDS = 3600;
export async function decodeAndStoreVin({ vin, user, ip, userAgent }) {
  const cacheKey = `vehicle:${vin}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      await logLookup({
        userId: user.id,
        vin,
        success: true,
        sourceIpHash: sha256(ip ?? ''),
        userAgent,
      });
      return { ...JSON.parse(cached), cache: 'hit' };
    }
    const existing = await findVehicleByVin(vin);
    if (existing?.decoded_at) {
      const response = mapVehicle(existing);
      await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_SECONDS);
      await logLookup({
        userId: user.id,
        vin,
        success: true,
        sourceIpHash: sha256(ip ?? ''),
        userAgent,
      });
      return { ...response, cache: 'database' };
    }
    const decoded = await decodeVin(vin);
    const vehicle = await upsertVehicle(decoded);
    const response = mapVehicle(vehicle);
    await redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL_SECONDS);
    await logLookup({
      userId: user.id,
      vin,
      success: true,
      sourceIpHash: sha256(ip ?? ''),
      userAgent,
    });
    return { ...response, cache: 'miss' };
  } catch (error) {
    await logLookup({
      userId: user.id,
      vin,
      success: false,
      sourceIpHash: sha256(ip ?? ''),
      userAgent,
    }).catch(() => {});
    throw error;
  }
}
export async function getVehicleReport(vin) {
  const vehicle = await findVehicleByVin(vin);
  const decoded = vehicle ? mapVehicle(vehicle) : await decodeVin(vin);
  const history = await getHistory(vin);
  return { vehicle: decoded, history: history.records, summary: history.summary };
}
function mapVehicle(row) {
  return {
    id: row.id,
    vin: row.vin,
    make: row.make,
    model: row.model,
    modelYear: row.model_year,
    manufacturer: row.manufacturer,
    country: row.country,
    bodyClass: row.body_class,
    engine: row.engine,
    decodedAt: row.decoded_at,
  };
}
