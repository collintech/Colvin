import { env } from '../config/env.js';
import { historyResponseSchema } from '../contracts/internal.schemas.js';
import { AppError } from '../errors/AppError.js';
import { createInternalClient } from './internalClient.js';

const client = createInternalClient(env.HISTORY_SERVICE_URL);

export async function getHistory(vin) {
  const response = await client.get(`/v1/history/${encodeURIComponent(vin)}`);

  if (response.status !== 200) {
    throw new AppError(
      response.status >= 500 ? 502 : response.status,
      'HISTORY_SERVICE_ERROR',
      response.data?.error ?? 'History service failed',
    );
  }

  const parsed = historyResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AppError(
      502,
      'HISTORY_SERVICE_CONTRACT_ERROR',
      'History service returned an invalid response',
    );
  }

  return parsed.data;
}
