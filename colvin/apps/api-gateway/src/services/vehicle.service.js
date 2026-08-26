import { cacheGetJson, cacheSetJson, vehicleCacheKey } from '../cache/redis.js';
import { decodeVin } from '../clients/vinDecoder.client.js';
import { getHistory } from '../clients/history.client.js';
import { env } from '../config/env.js';
import { findVehicleByVin, logLookup, upsertVehicle } from '../repositories/vehicle.repository.js';
import { sha256 } from '../utils/hash.js';
import { singleFlight } from '../utils/single-flight.js';

export async function decodeAndStoreVin({ vin, user, ip, userAgent }) {
  const cacheKey = vehicleCacheKey(vin);

  try {
    const cached = await cacheGetJson(cacheKey);
    if (cached) {
      await recordLookup({ user, vin, ip, userAgent, success: true });
      return { ...cached, cache: 'hit' };
    }

    const result = await singleFlight(`vehicle-load:${vin}`, async () => {
      const existing = await findVehicleByVin(vin);
      if (existing?.decoded_at) {
        const response = mapVehicle(existing);
        await cacheSetJson(cacheKey, response, env.VEHICLE_CACHE_TTL_SECONDS);
        return { response, cache: 'database' };
      }

      const decoded = await decodeVin(vin);
      const vehicle = await upsertVehicle(decoded);
      const response = mapVehicle(vehicle);
      await cacheSetJson(cacheKey, response, env.VEHICLE_CACHE_TTL_SECONDS);
      return { response, cache: 'miss' };
    });

    await recordLookup({ user, vin, ip, userAgent, success: true });
    return { ...result.response, cache: result.cache };
  } catch (error) {
    await recordLookup({ user, vin, ip, userAgent, success: false }).catch(() => {});
    throw error;
  }
}

export async function getVehicleReport(vin) {
  const vehicle = await findVehicleByVin(vin);
  const decoded = vehicle ? mapVehicle(vehicle) : await decodeVin(vin);
  const history = await getHistory(vin);
  return { vehicle: decoded, history: history.records, summary: history.summary };
}

function recordLookup({ user, vin, ip, userAgent, success }) {
  return logLookup({
    userId: user.id,
    vin,
    success,
    sourceIpHash: sha256(ip ?? ''),
    userAgent,
  });
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
