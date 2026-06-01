// Staff routes — staff directory (list).
import { Hono } from 'hono';
import { query } from '../lib/db.js';

export const staffRoutes = new Hono();

// GET /api/staff — list staff members. Visible to any authenticated staff.
staffRoutes.get('/', async (c) => {
  const { rows } = await query(
    `SELECT id, name, email, phone, roles, program_assignments, languages,
            is_org_admin, status
       FROM carelink.staff_members
      WHERE deleted_at IS NULL
      ORDER BY name`
  );
  return c.json(rows);
});
