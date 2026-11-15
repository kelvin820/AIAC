import {initialState} from './initial-state.mjs';

export const stateSchema = `
CREATE TABLE IF NOT EXISTS aiac_state (
  id integer PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`;

// The client stays pinned for the entire transaction, including on a pooled connection.
export async function withPostgresState(pool, run) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(44011, 1) AS acquired');
    if (!lock.rows[0].acquired) {
      await client.query('ROLLBACK');
      return {busy:true};
    }
    await client.query(stateSchema);
    const store = {
      async get() {
        const {rows} = await client.query('SELECT payload FROM aiac_state WHERE id = 1');
        return rows[0]?.payload ?? initialState();
      },
      async save(next) {
        await client.query(`INSERT INTO aiac_state (id, payload) VALUES (1, $1::jsonb)
          ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`, [JSON.stringify(next)]);
        return structuredClone(next);
      }
    };
    const value = await run(store);
    await client.query('COMMIT');
    return {value};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}
