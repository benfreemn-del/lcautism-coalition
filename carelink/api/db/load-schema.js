// Load the CareLink Postgres schema into a LOCAL dev database.
//
// IMPORTANT: this applies docs/carelink/schema/*.sql to whatever DATABASE_URL
// points at. Point it ONLY at a local, throwaway dev database — never a real or
// HIPAA database. The schema docs themselves are "DESIGN ONLY"; this script is
// a developer convenience for spinning up a LOCAL demo, nothing more.
//
// It also creates the app roles the RLS file expects (service_role, app_staff,
// app_portal, anon) if missing, since 99_rls_policies.sql grants to them.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(__dirname, '../../../docs/carelink/schema');

const FILES = [
  '00_extensions.sql',
  '01_core.sql',
  '02_clinical.sql',
  '03_intake_forms.sql',
  '04_portal.sql',
  '05_ops.sql',
  '06_audit.sql',
  '99_rls_policies.sql',
];

// Roles the RLS file references. Created NOLOGIN for local dev. service_role
// gets BYPASSRLS so the dev API (which connects as the DB superuser/owner) is
// not blocked; in dev we typically connect as the owner anyway.
const ROLE_BOOTSTRAP = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_staff') THEN
    CREATE ROLE app_staff NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_portal') THEN
    CREATE ROLE app_portal NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy api/.env.example to api/.env first.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[load-schema] Connected. Loading schema into LOCAL dev DB...');

  // Fresh start: drop and recreate the carelink schema (dev convenience).
  await client.query('DROP SCHEMA IF EXISTS carelink CASCADE;');
  await client.query(ROLE_BOOTSTRAP);

  for (const f of FILES) {
    const sql = await readFile(path.join(SCHEMA_DIR, f), 'utf8');
    console.log(`[load-schema] applying ${f}`);
    await client.query(sql);
  }

  await client.end();
  console.log('[load-schema] Done. Schema loaded. Run `npm run db:seed` next.');
}

main().catch((err) => {
  console.error('[load-schema] FAILED:', err.message);
  process.exit(1);
});
