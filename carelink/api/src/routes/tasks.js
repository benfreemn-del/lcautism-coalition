// Task routes — list / create / complete, tied to a client + staff.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { canAccessClient, visibleClientsFilter } from '../lib/access.js';
import { writeAudit } from '../lib/audit.js';

export const taskRoutes = new Hono();

// GET /api/tasks  (?mine=1&open=1) — scoped to visible clients (+ client-less
// tasks assigned to or created by the caller).
taskRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const mine = c.req.query('mine') === '1';
  const openOnly = c.req.query('open') === '1';

  const filter = visibleClientsFilter(auth, 1);
  const params = [...filter.params];
  let idx = filter.nextIndex;
  const myParam = idx++;
  params.push(auth.staffId);

  // A task is visible if: it has no client (operational) and is assigned to /
  // created by the caller; OR its client is visible to the caller.
  let sql = `
    SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
           t.category, t.client_id, c.full_name AS client_name,
           t.assigned_to_staff_id, s.name AS assigned_to_name
      FROM carelink.tasks t
      LEFT JOIN carelink.clients c ON c.id = t.client_id
      LEFT JOIN carelink.staff_members s ON s.id = t.assigned_to_staff_id
     WHERE t.deleted_at IS NULL
       AND (
         (t.client_id IS NULL AND (t.assigned_to_staff_id = $${myParam} OR t.staff_member_id = $${myParam}))
         OR (t.client_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM carelink.clients c2
               WHERE c2.id = t.client_id AND (${filter.where.replace(/c\./g, 'c2.')})
            ))
       )`;
  if (mine) { sql += ` AND t.assigned_to_staff_id = $${myParam}`; }
  if (openOnly) { sql += ` AND t.status <> 'Complete' AND t.status <> 'Cancelled'`; }
  sql += ` ORDER BY (t.due_date IS NULL), t.due_date, t.priority DESC`;

  const { rows } = await query(sql, params);
  return c.json(rows);
});

// POST /api/tasks  { title, client_id?, assigned_to_staff_id?, priority?, due_date?, category? }
taskRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  const b = await c.req.json().catch(() => ({}));
  if (!b.title) return c.json({ error: 'title is required' }, 400);
  if (b.client_id && !(await canAccessClient(auth, b.client_id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }
  const { rows } = await query(
    `INSERT INTO carelink.tasks
       (client_id, assigned_to_staff_id, staff_member_id, title, description,
        priority, due_date, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, title, status, priority, due_date, client_id, assigned_to_staff_id`,
    [
      b.client_id || null,
      b.assigned_to_staff_id || auth.staffId,
      auth.staffId,
      b.title,
      b.description || null,
      b.priority || 'Medium',
      b.due_date || null,
      b.category || 'Other',
    ]
  );
  await writeAudit({
    action: 'task.create',
    entityType: 'tasks',
    entityId: rows[0].id,
    entityName: b.title,
    staffId: auth.staffId,
    performedBy: auth.email,
  });
  return c.json(rows[0], 201);
});

// POST /api/tasks/:id/complete — mark a task complete.
taskRoutes.post('/:id/complete', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const { rows } = await query(
    `SELECT client_id FROM carelink.tasks WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) return c.json({ error: 'Task not found' }, 404);
  if (rows[0].client_id && !(await canAccessClient(auth, rows[0].client_id))) {
    return c.json({ error: 'Not authorized for this client' }, 403);
  }
  const upd = await query(
    `UPDATE carelink.tasks SET status = 'Complete' WHERE id = $1
     RETURNING id, title, status`,
    [id]
  );
  await writeAudit({
    action: 'task.complete',
    entityType: 'tasks',
    entityId: id,
    staffId: auth.staffId,
    performedBy: auth.email,
  });
  return c.json(upd.rows[0]);
});
