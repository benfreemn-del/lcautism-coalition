// Seed OBVIOUSLY-FAKE, NON-PHI demo data so the UI is demoable.
//
// ⚠️  EVERYTHING HERE IS FAKE. No real people. Names are "Sample Staff" /
// "Sample Client A" on purpose. Do NOT add real patient data to this file.
//
// Connects as the DB owner (dev), so RLS does not block these inserts.
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

// Deterministic auth UIDs so the dev login (lib/auth.js) maps cleanly.
const ADMIN_AUTH_UID = '00000000-0000-4000-8000-000000000001';
const COORD_AUTH_UID = '00000000-0000-4000-8000-000000000002';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Copy api/.env.example to api/.env.');
    process.exit(1);
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  console.log('[seed] Inserting OBVIOUSLY-FAKE demo data (no real PHI)...');

  // --- Staff (one org admin, one regular coordinator) ---
  const admin = await db.query(
    `INSERT INTO carelink.staff_members
       (auth_user_id, name, email, roles, is_org_admin, languages, status)
     VALUES ($1,'Sample Admin (FAKE)','admin@example.test',
             ARRAY['Executive Director'], true, ARRAY['English','Spanish'], 'Active')
     RETURNING id`,
    [ADMIN_AUTH_UID]
  );
  const adminId = admin.rows[0].id;

  const coord = await db.query(
    `INSERT INTO carelink.staff_members
       (auth_user_id, name, email, roles, is_org_admin, languages, status)
     VALUES ($1,'Sample Coordinator (FAKE)','coordinator@example.test',
             ARRAY['Care Coordinator'], false, ARRAY['English'], 'Active')
     RETURNING id`,
    [COORD_AUTH_UID]
  );
  const coordId = coord.rows[0].id;

  // --- Households ---
  const house = await db.query(
    `INSERT INTO carelink.households (household_name, city, state, zip, language_preference)
     VALUES ('Sample Household A (FAKE)','Chehalis','WA','98532','English')
     RETURNING id`
  );
  const houseId = house.rows[0].id;

  // --- Clients (3 fake) ---
  const clientA = await db.query(
    `INSERT INTO carelink.clients
       (client_id_number, household_id, legal_first_name, legal_last_name,
        caregiver_name, preferred_language, primary_phone, email, programs, status)
     VALUES ('LCAC-0001',$1,'Sample','Client A','Sample Caregiver A (FAKE)',
             'English','555-0100','clientA@example.test',
             ARRAY['SMART Team'],'Active')
     RETURNING id`,
    [houseId]
  );
  const clientAId = clientA.rows[0].id;

  const clientB = await db.query(
    `INSERT INTO carelink.clients
       (client_id_number, legal_first_name, legal_last_name, caregiver_name,
        preferred_language, primary_phone, programs, status)
     VALUES ('LCAC-0002','Sample','Client B','Sample Caregiver B (FAKE)',
             'Spanish','555-0102', ARRAY['Autism Package'],'Active')
     RETURNING id`
  );
  const clientBId = clientB.rows[0].id;

  const clientC = await db.query(
    `INSERT INTO carelink.clients
       (client_id_number, legal_first_name, legal_last_name, caregiver_name,
        preferred_language, status)
     VALUES ('LCAC-0003','Sample','Client C','Sample Caregiver C (FAKE)',
             'English','Active')
     RETURNING id`
  );
  const clientCId = clientC.rows[0].id;

  // --- Care-team assignments ---
  // Coordinator is assigned to A and B ONLY (NOT C) — so the access-control
  // demo is visible: the coordinator should NOT see Client C, the admin sees all.
  await db.query(
    `INSERT INTO carelink.client_assignments
       (client_id, staff_member_id, role, is_primary, status, assigned_by)
     VALUES ($1,$2,'primary_coordinator',true,'active',$3),
            ($4,$2,'care_coordinator',false,'active',$3)`,
    [clientAId, coordId, adminId, clientBId]
  );

  // --- Appointments (one TODAY for the coordinator, for the dashboard) ---
  await db.query(
    `INSERT INTO carelink.appointments
       (client_id, provider_staff_id, title, appointment_date, appointment_type, location_type, status)
     VALUES
       ($1,$2,'Intake call (FAKE)', date_trunc('day', now()) + interval '10 hours','Intake','Online','Scheduled'),
       ($3,$2,'Follow-up (FAKE)',   date_trunc('day', now()) + interval '14 hours','Follow-up','In person','Scheduled'),
       ($1,$2,'Assessment (FAKE)',  date_trunc('day', now()) + interval '2 days','Assessment','In person','Scheduled')`,
    [clientAId, coordId, clientBId]
  );

  // --- Tasks (open tasks for the coordinator dashboard) ---
  await db.query(
    `INSERT INTO carelink.tasks
       (client_id, assigned_to_staff_id, staff_member_id, title, priority, due_date, category, status)
     VALUES
       ($1,$2,$2,'Send intake packet (FAKE)','High', current_date,'Documentation','Pending'),
       ($3,$2,$2,'Call caregiver back (FAKE)','Medium', current_date + 1,'Follow-up','Pending'),
       (NULL,$2,$2,'Submit monthly hours (FAKE)','Low', current_date + 3,'Admin','Pending')`,
    [clientAId, coordId, clientBId]
  );

  // --- A pending intake submission (as if from the public form) ---
  const pending = await db.query(
    `INSERT INTO carelink.clients
       (legal_first_name, legal_last_name, caregiver_name, preferred_language, status)
     VALUES ('Sample','Intake Lead D (FAKE)','Sample Caregiver D (FAKE)','Spanish','Pending')
     RETURNING id`
  );
  await db.query(
    `INSERT INTO carelink.submissions (client_id, form_type, form_title, status, data)
     VALUES ($1,'intake','Public Intake Form','Pending Review',$2)`,
    [pending.rows[0].id, JSON.stringify({ note: 'FAKE seeded intake' })]
  );

  await db.end();
  console.log('[seed] Done. Demo logins (any password):');
  console.log('   admin@example.test        (org admin — sees all clients)');
  console.log('   coordinator@example.test  (sees only Client A + B, NOT C)');
}

main().catch((err) => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
