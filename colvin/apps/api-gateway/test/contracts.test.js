import assert from 'node:assert/strict';
import test from 'node:test';

import { decodedVehicleSchema, historyResponseSchema } from '../src/contracts/internal.schemas.js';

test('decoded vehicle contract accepts the current Go response', () => {
  const result = decodedVehicleSchema.safeParse({
    vin: '1HGCM82633A004352',
    make: 'Honda',
    manufacturer: 'Honda',
    country: 'United States',
    wmi: '1HG',
    validCheckDigit: true,
  });

  assert.equal(result.success, true);
});

test('decoded vehicle contract rejects undocumented fields', () => {
  const result = decodedVehicleSchema.safeParse({
    vin: '1HGCM82633A004352',
    wmi: '1HG',
    validCheckDigit: true,
    unexpected: 'field',
  });

  assert.equal(result.success, false);
});

test('history contract validates summary count shape', () => {
  const result = historyResponseSchema.safeParse({
    records: [],
    summary: { totalRecords: 0 },
  });

  assert.equal(result.success, true);
});
