import { z } from 'zod';

export const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(17)
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN contains invalid characters');

export const decodeVinSchema = z.object({
  body: z.object({ vin: vinSchema }).strict(),
});

export const vinParamsSchema = z.object({
  params: z.object({ vin: vinSchema }).strict(),
});
