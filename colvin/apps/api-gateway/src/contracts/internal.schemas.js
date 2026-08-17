import { z } from 'zod';

const nullableString = z.string().nullable().optional();

export const decodedVehicleSchema = z
  .object({
    vin: z.string().length(17),
    make: z.string().optional(),
    model: z.string().optional(),
    modelYear: z.number().int().nullable().optional(),
    manufacturer: z.string().optional(),
    country: z.string().optional(),
    bodyClass: z.string().optional(),
    engine: z.string().optional(),
    wmi: z.string().length(3),
    validCheckDigit: z.boolean(),
  })
  .strict();

export const historyRecordSchema = z
  .object({
    id: z.string(),
    recordType: z.string(),
    occurredAt: nullableString,
    country: nullableString,
    summary: z.string(),
    details: z.record(z.string(), z.unknown()),
    sourceName: z.string(),
    sourceReference: nullableString,
    confidence: z.number(),
  })
  .strict();

export const historyResponseSchema = z
  .object({
    records: z.array(historyRecordSchema),
    summary: z
      .object({
        totalRecords: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
