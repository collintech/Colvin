import { z } from 'zod';

const nullableString = z.string().nullable().optional();

const vehicleSourceSchema = z
  .object({
    provider: z.string().min(1),
    kind: z.string().min(1),
    authoritative: z.boolean(),
    fields: z.array(z.string()),
  })
  .strict();

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
    sources: z.array(vehicleSourceSchema),
    warnings: z.array(z.string()).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const historyRecordSchema = z
  .object({
    id: z.string(),
    recordType: z.string(),
    occurredAt: nullableString,
    country: nullableString,
    jurisdiction: nullableString,
    summary: z.string(),
    details: z.record(z.string(), z.unknown()),
    sourceName: z.string(),
    sourceReference: nullableString,
    confidence: z.number().min(0).max(1),
    evidenceStatus: z.enum(['observed', 'reported', 'confirmed', 'cleared', 'unknown']),
    providerEventId: nullableString,
    observedAt: z.string().min(1),
    providerCheckedAt: nullableString,
  })
  .strict();

const providerCheckSchema = z
  .object({
    provider: z.string().min(1),
    checkType: z.string().min(1),
    status: z.enum(['clear', 'match', 'unknown', 'error']),
    checkedAt: z.string().min(1),
    validUntil: z.string().min(1),
    warning: nullableString,
    details: z.record(z.string(), z.unknown()),
  })
  .strict();


const providerHealthSchema = z
  .object({
    provider: z.string().min(1),
    dailyUsed: z.number().int().nonnegative(),
    dailyBudget: z.number().int().positive(),
    consecutiveFailures: z.number().int().nonnegative(),
    circuitOpen: z.boolean(),
    circuitOpenUntil: nullableString,
    lastSuccessAt: nullableString,
    lastFailureAt: nullableString,
    totalSuccesses: z.number().int().nonnegative(),
    totalFailures: z.number().int().nonnegative(),
  })
  .strict();

const evidenceConflictSchema = z
  .object({
    field: z.string().min(1),
    status: z.literal('conflicting_evidence'),
    sources: z.array(z.string().min(1)).min(2),
    message: z.string().min(1),
  })
  .strict();

export const historyResponseSchema = z
  .object({
    records: z.array(historyRecordSchema),
    summary: z
      .object({
        totalRecords: z.number().int().nonnegative(),
        counts: z.record(z.string(), z.number().int().nonnegative()),
        theftStatus: z.enum(['unknown', 'reported', 'clear_in_checked_sources']),
        warnings: z.array(z.string()),
        providerChecks: z.array(providerCheckSchema),
        providerHealth: z.array(providerHealthSchema),
        conflicts: z.array(evidenceConflictSchema),
      })
      .strict(),
  })
  .strict();
