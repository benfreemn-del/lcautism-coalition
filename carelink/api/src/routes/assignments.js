// Care-team assignment routes — assign a client to staff (client_assignments).
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { canAccessClient } from '../lib/access.js';
import { writeAudit } from '../lib/audit.js';

export const assignmentRoutes = new Hono();

// POST /api/assignments  { client_id, staff_member_id, role?, is_primary? }
// Caller must already be able to access the client (admin, or on the team).
assignmentRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json().catch(() => ({}));
  const { client_id, staff_member_id } = body;
  const role = body.role || 'care_coordinator';
  const is_primary = !!body.is_primary;

  if (!client_id || !staff_member_id) {
    return c.json({ error: 'client_id and staff_member_id are required' }, 400);
  }
  if (!(await canAccessClient(auth, client_id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }

  // Upsert on the schema's UNIQUE (client_id, staff_member_id): re-activate.
  const { rows } = await query(
    `INSERT INTO carelink.client_assignments
       (client_id, staff_member_id, role, is_primary, status, assigned_by)
     VALUES ($1,$2,$3,$4,'active',$5)
     ON CONFLICT (client_id, staff_member_id)
       DO UPDATE SET role = EXCLUDED.role,
                     is_primary = EXCLUDED.is_primary,
                     status = 'active',
                     deleted_at = NULL,
                     ended_at = NULL
     RETURNING id, client_id, staff_member_id, role, is_primary, status`,
    [client_id, staff_member_id, role, is_primary, auth.staffId]
  );

  await writeAudit({
    action: 'client_assignment.create',
    entityType: 'client_assignments',
    entityId: rows[0].id,
    details: `Assigned staff ${staff_member_id} to client ${client_id} as ${role}`,
    staffId: auth.staffId,
    performedBy: auth.email,
  });

  return c.json(rows[0], 201);
});

// DELETE /api/assignments/:id — soft-deactivate an assignment (no hard delete).
assignmentRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const { rows } = await query(
    `SELECT client_id FROM carelink.client_assignments WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return c.json({ error: 'Assignment not found' }, 404);
  if (!(await canAccessClient(auth, rows[0].client_id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }
  await query(
    `UPDATE carelink.client_assignments
        SET status = 'inactive', ended_at = now()
      WHERE id = $1`,
    [id]
  );
  await writeAudit({
    action: 'client_assignment.deactivate',
    entityType: 'client_assignments',
    entityId: id,
    staffId: auth.staffId,
    performedBy: auth.email,
  });
  return c.json({ ok: true });
});
