import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers';
import test from 'node:test';

import { singleFlight } from '../src/utils/single-flight.js';

test('singleFlight coalesces concurrent work for the same key', async () => {
  const flights = new Map();
  let executions = 0;

  const work = async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true };
  };

  const [first, second, third] = await Promise.all([
    singleFlight('same-vin', work, flights),
    singleFlight('same-vin', work, flights),
    singleFlight('same-vin', work, flights),
  ]);

  assert.equal(executions, 1);
  assert.deepEqual(first, { ok: true });
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
  assert.equal(flights.size, 0);
});

test('singleFlight clears failed work so a retry can proceed', async () => {
  const flights = new Map();
  let executions = 0;

  await assert.rejects(
    singleFlight(
      'retry-vin',
      async () => {
        executions += 1;
        throw new Error('temporary failure');
      },
      flights,
    ),
    /temporary failure/,
  );

  const result = await singleFlight(
    'retry-vin',
    async () => {
      executions += 1;
      return 'recovered';
    },
    flights,
  );

  assert.equal(result, 'recovered');
  assert.equal(executions, 2);
  assert.equal(flights.size, 0);
});
