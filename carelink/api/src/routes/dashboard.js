// Dashboard route — today's appointments + open tasks for the signed-in staff.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { visibleClientsFilter } from '../lib/access.js';

export const dashboardRoutes = new Hono();

// GET /api/dashboard — { today_appointments, open_tasks }
dashboardRoutes.get('/', async (c) => {
  const auth = c.get('auth');

  // Today's appointments where the caller is the provider (scoped to visible).
  const apptFilter = visibleClientsFilter(auth, 1);
  const apptParams = [...apptFilter.params, auth.staffId];
  const providerIdx = apptFilter.nextIndex;
  const appts = await query(
    `SELECT a.id, a.title, a.appointment_date, a.appointment_type,
            a.location_type, a.status, a.client_id, c.full_name AS client_name
       FROM carelink.appointments a
       JOIN carelink.clients c ON c.id = a.client_id
      WHERE a.deleted_at IS NULL
        AND (${apptFilter.where})
        AND a.provider_staff_id = $${providerIdx}
        AND a.appointment_date::date = current_date
        AND a.status NOT IN ('Cancelled')
      ORDER BY a.appointment_date`,
    apptParams
  );

  // Open tasks assigned to the caller.
  const tasks = await query(
    `SELECT t.id, t.title, t.priority, t.due_date, t.status,
            t.client_id, c.full_name AS client_name
       FROM carelink.tasks t
       LEFT JOIN carelink.clients c ON c.id = t.client_id
      WHERE t.deleted_at IS NULL
        AND t.assigned_to_staff_id = $1
        AND t.status NOT IN ('Complete','Cancelled')
      ORDER BY (t.due_date IS NULL), t.due_date, t.priority DESC`,
    [auth.staffId]
  );

  return c.json({
    today_appointments: appts.rows,
    open_tasks: tasks.rows,
  });
});
