export async function withTransaction(pool, work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Transaction failed and rollback could not be completed',
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
