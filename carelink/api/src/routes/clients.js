// Client routes — list + detail, scoped by care-team access control.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { canAccessClient, visibleClientsFilter } from '../lib/access.js';

export const clientRoutes = new Hono();

// GET /api/clients — only clients the caller may see (assigned, or all if admin)
clientRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const filter = visibleClientsFilter(auth);
  const { rows } = await query(
    `SELECT c.id, c.client_id_number, c.full_name, c.preferred_language,
            c.status, c.programs, c.primary_phone, c.email,
            h.household_name
       FROM carelink.clients c
       LEFT JOIN carelink.households h ON h.id = c.household_id
      WHERE ${filter.where}
      ORDER BY c.full_name`,
    filter.params
  );
  return c.json(rows);
});

// GET /api/clients/:id — detail. Default-deny if not on the care team.
clientRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  if (!(await canAccessClient(auth, id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }
  const { rows } = await query(
    `SELECT c.*, h.household_name, h.address AS household_address,
            h.city AS household_city, h.state AS household_state, h.zip AS household_zip
       FROM carelink.clients c
       LEFT JOIN carelink.households h ON h.id = c.household_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) return c.json({ error: 'Client not found' }, 404);

  // Care team for this client.
  const team = await query(
    `SELECT ca.id, ca.role, ca.is_primary, ca.status,
            s.id AS staff_id, s.name AS staff_name, s.email AS staff_email
       FROM carelink.client_assignments ca
       JOIN carelink.staff_members s ON s.id = ca.staff_member_id
      WHERE ca.client_id = $1 AND ca.deleted_at IS NULL
      ORDER BY ca.is_primary DESC, s.name`,
    [id]
  );
  return c.json({ ...rows[0], care_team: team.rows });
});
