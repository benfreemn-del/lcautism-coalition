// Intake routes — a PUBLIC intake form (no auth) that creates a pending
// intake record. Models the schema's intake/submission tables: we create a
// `clients` row in status 'Pending' plus a `submissions` row holding the raw
// answers (mirrors Submission bound to a client). Org staff review pending
// clients later.
//
// In the AWS target this is the tokenized SMS/email path writing via the
// service role; here it is an open dev endpoint with obviously-fake data.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { writeAudit } from '../lib/audit.js';

export const intakeRoutes = new Hono();

// POST /api/intake (PUBLIC) — create a pending client + submission record.
// Body: { caregiver_name, legal_first_name, legal_last_name, primary_phone?,
//         email?, preferred_language?, contact_reason?, notes? }
intakeRoutes.post('/', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.legal_first_name || !b.legal_last_name || !b.caregiver_name) {
    return c.json(
      { error: 'First name, last name, and caregiver name are required' },
      400
    );
  }
  const lang = ['English', 'Spanish'].includes(b.preferred_language)
    ? b.preferred_language
    : 'English';

  // Create a Pending client (not yet on any care team — admin reviews/assigns).
  const client = await query(
    `INSERT INTO carelink.clients
       (legal_first_name, legal_last_name, caregiver_name, primary_phone, email,
        preferred_language, contact_reasons, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending')
     RETURNING id, full_name, status, preferred_language`,
    [
      b.legal_first_name,
      b.legal_last_name,
      b.caregiver_name,
      b.primary_phone || null,
      b.email || null,
      lang,
      b.contact_reason ? [b.contact_reason] : [],
      b.notes || null,
    ]
  );
  const clientId = client.rows[0].id;

  // Store the raw intake answers as a Submission (form_type 'intake').
  await query(
    `INSERT INTO carelink.submissions
       (client_id, form_type, form_title, status, data)
     VALUES ($1,'intake','Public Intake Form','Pending Review',$2)`,
    [clientId, JSON.stringify(b)]
  );

  // No staff actor for a public submission; record who/what for the audit trail.
  await writeAudit({
    action: 'intake.submit',
    entityType: 'clients',
    entityId: clientId,
    entityName: client.rows[0].full_name,
    details: 'Public intake form submission (pending review)',
    staffId: null,
    performedBy: 'public-intake',
  });

  return c.json(
    { ok: true, client_id: clientId, status: 'Pending', message: 'Intake received' },
    201
  );
});
