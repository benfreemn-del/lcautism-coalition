// Thin Postgres access layer (node-postgres). Parameterized queries only.
//
// NOTE ON RLS: the schema's Row-Level Security (99_rls_policies.sql) is the
// authoritative DB-level guard for the AWS target. This dev API connects as a
// single role and enforces the SAME care-team rule in the application layer
// (see lib/access.js / can_access_client) so the scaffold is honest about the
// access model even though we are not wiring per-request DB roles here.
//
// To exercise the schema's helper functions against a session, we set
// `carelink.auth_uid` per request (see withAuthUid) — matching the schema's
// carelink.current_auth_uid() which reads current_setting('carelink.auth_uid').
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    '[carelink-api] DATABASE_URL is not set. Copy api/.env.example to api/.env ' +
      'and point it at a LOCAL throwaway Postgres (never a real/PHI database).'
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Local dev only. No SSL config here on purpose — do not point at cloud DBs.
  max: 5,
});

// Run a parameterized query.
export async function query(text, params) {
  return pool.query(text, params);
}

// Run a callback inside a transaction with the schema's auth-uid GUC set, so
// SECURITY DEFINER helpers like carelink.current_staff_id() resolve correctly
// if the schema is loaded. authUid may be null (anon / no staff).
export async function withAuthUid(authUid, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) => transaction-local; cleared at COMMIT/ROLLBACK.
    await client.query(`SELECT set_config('carelink.auth_uid', $1, true)`, [
      authUid ?? '',
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
