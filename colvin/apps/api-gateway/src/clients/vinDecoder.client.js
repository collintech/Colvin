import { AppError } from '../errors/AppError.js';
import { decodedVehicleSchema } from '../contracts/internal.schemas.js';
import { env } from '../config/env.js';
import { createInternalClient } from './internalClient.js';

const client = createInternalClient(env.VIN_DECODER_URL);

export async function decodeVin(vin) {
  const response = await client.post('/v1/decode', { vin });

  if (response.status !== 200) {
    throw new AppError(
      response.status >= 500 ? 502 : response.status,
      'VIN_DECODER_ERROR',
      response.data?.error ?? 'VIN decoder failed',
    );
  }

  const parsed = decodedVehicleSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AppError(
      502,
      'VIN_DECODER_CONTRACT_ERROR',
      'VIN decoder returned an invalid response',
    );
  }

  return parsed.data;
}
