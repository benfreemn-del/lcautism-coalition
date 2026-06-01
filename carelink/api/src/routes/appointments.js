// Appointment routes — list + create, tied to a client + staff, care-team scoped.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { canAccessClient, visibleClientsFilter } from '../lib/access.js';
import { writeAudit } from '../lib/audit.js';

export const appointmentRoutes = new Hono();

// GET /api/appointments  (?client_id=&from=&to=) — scoped to visible clients.
appointmentRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const clientId = c.req.query('client_id');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (clientId) {
    if (!(await canAccessClient(auth, clientId))) {
      return c.json({ error: 'Not authorized for this client' }, 403);
    }
  }

  const filter = visibleClientsFilter(auth, 1);
  const params = [...filter.params];
  let sql = `
    SELECT a.id, a.title, a.appointment_date, a.end_time, a.appointment_type,
           a.location_type, a.location, a.status,
           a.client_id, c.full_name AS client_name,
           a.provider_staff_id, s.name AS provider_name
      FROM carelink.appointments a
      JOIN carelink.clients c ON c.id = a.client_id
      LEFT JOIN carelink.staff_members s ON s.id = a.provider_staff_id
     WHERE a.deleted_at IS NULL AND (${filter.where})`;
  let idx = filter.nextIndex;
  if (clientId) { sql += ` AND a.client_id = $${idx++}`; params.push(clientId); }
  if (from) { sql += ` AND a.appointment_date >= $${idx++}`; params.push(from); }
  if (to) { sql += ` AND a.appointment_date < $${idx++}`; params.push(to); }
  sql += ` ORDER BY a.appointment_date`;

  const { rows } = await query(sql, params);
  return c.json(rows);
});

// POST /api/appointments  { client_id, provider_staff_id?, title, appointment_date, ... }
appointmentRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  const b = await c.req.json().catch(() => ({}));
  if (!b.client_id || !b.title || !b.appointment_date) {
    return c.json({ error: 'client_id, title and appointment_date are required' }, 400);
  }
  if (!(await canAccessClient(auth, b.client_id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }
  const { rows } = await query(
    `INSERT INTO carelink.appointments
       (client_id, provider_staff_id, title, description, appointment_date,
        end_time, appointment_type, location_type, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, client_id, provider_staff_id, title, appointment_date, status`,
    [
      b.client_id,
      b.provider_staff_id || auth.staffId,
      b.title,
      b.description || null,
      b.appointment_date,
      b.end_time || null,
      b.appointment_type || 'Other',
      b.location_type || 'In person',
      b.location || null,
    ]
  );
  await writeAudit({
    action: 'appointment.create',
    entityType: 'appointments',
    entityId: rows[0].id,
    entityName: b.title,
    staffId: auth.staffId,
    performedBy: auth.email,
  });
  return c.json(rows[0], 201);
});
