// Auth routes — STUB login (dev only). See lib/auth.js for the Cognito mapping.
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { signDevToken, requireAuth } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';

export const authRoutes = new Hono();

// POST /api/auth/login  { email, password }
// DEV STUB: password is ignored (no password storage). Any seeded, active staff
// email logs in. This is replaced by Cognito Hosted UI in the AWS target.
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return c.json({ error: 'Email is required' }, 400);

  const { rows } = await query(
    `SELECT id, auth_user_id, name, email, is_org_admin, roles, status
       FROM carelink.staff_members
      WHERE lower(email) = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [email]
  );
  const staff = rows[0];
  if (!staff || staff.status !== 'Active') {
    return c.json({ error: 'No active staff account for that email' }, 401);
  }

  const token = signDevToken({
    authUid: staff.auth_user_id,
    staffId: staff.id,
    email: staff.email,
    name: staff.name,
    isOrgAdmin: staff.is_org_admin,
  });

  await writeAudit({
    action: 'auth.login',
    entityType: 'staff_members',
    entityId: staff.id,
    entityName: staff.name,
    details: 'Dev stub login',
    staffId: staff.id,
    performedBy: staff.email,
  });

  return c.json({
    token,
    staff: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      isOrgAdmin: staff.is_org_admin,
      roles: staff.roles,
    },
  });
});

// GET /api/auth/me — current session (protected by its own auth middleware).
authRoutes.get('/me', requireAuth(), (c) => {
  const auth = c.get('auth');
  return c.json({
    id: auth.staffId,
    name: auth.name,
    email: auth.email,
    isOrgAdmin: auth.isOrgAdmin,
  });
});
