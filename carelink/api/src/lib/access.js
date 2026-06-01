// Care-team access control — APPLICATION-LAYER mirror of the schema's
// carelink.can_access_client() (01_core.sql) and 99_rls_policies.sql.
//
// Rule (default-deny):
//   A staff member may touch a client's records ONLY if:
//     - they are an org admin (staff_members.is_org_admin), OR
//     - they have an ACTIVE, non-deleted client_assignments row for that client.
//
// In the AWS target, Postgres RLS enforces this at the DB. Here we ALSO enforce
// it in the API so the scaffold behaves correctly against a plain dev DB and so
// the logic is visible/testable. Keep both in sync.
import { query } from './db.js';

// Returns true if the staff member can access the given client.
export async function canAccessClient({ staffId, isOrgAdmin }, clientId) {
  if (isOrgAdmin) return true;
  if (!staffId || !clientId) return false; // default-deny
  const { rows } = await query(
    `SELECT 1
       FROM carelink.client_assignments
      WHERE client_id = $1
        AND staff_member_id = $2
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1`,
    [clientId, staffId]
  );
  return rows.length > 0;
}

// SQL fragment + params builder for "clients this staff member may see".
// Org admins see all (non-deleted) clients; others see only assigned clients.
// Returns { where, params } to splice into a clients query.
export function visibleClientsFilter({ staffId, isOrgAdmin }, startIndex = 1) {
  if (isOrgAdmin) {
    return { where: `c.deleted_at IS NULL`, params: [], nextIndex: startIndex };
  }
  return {
    where: `c.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM carelink.client_assignments ca
               WHERE ca.client_id = c.id
                 AND ca.staff_member_id = $${startIndex}
                 AND ca.status = 'active'
                 AND ca.deleted_at IS NULL
            )`,
    params: [staffId],
    nextIndex: startIndex + 1,
  };
}
