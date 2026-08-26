import assert from 'node:assert/strict';
import test from 'node:test';

import { withTransaction } from '../src/database/transaction.js';

function createPool({ failRollback = false } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === 'ROLLBACK' && failRollback) throw new Error('rollback failed');
    },
    release() {
      calls.push('RELEASE');
    },
  };
  return {
    calls,
    pool: {
      async connect() {
        return client;
      },
    },
  };
}

test('transaction commits successful work and releases the client', async () => {
  const { pool, calls } = createPool();
  const value = await withTransaction(pool, async () => 'committed');

  assert.equal(value, 'committed');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('transaction rolls back failed work and releases the client', async () => {
  const { pool, calls } = createPool();

  await assert.rejects(
    withTransaction(pool, async () => {
      throw new Error('work failed');
    }),
    /work failed/,
  );

  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('transaction surfaces both work and rollback failures', async () => {
  const { pool, calls } = createPool({ failRollback: true });

  await assert.rejects(
    withTransaction(pool, async () => {
      throw new Error('work failed');
    }),
    AggregateError,
  );

  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});
