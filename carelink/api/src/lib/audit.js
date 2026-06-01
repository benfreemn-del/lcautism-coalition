// Audit logging — writes to carelink.audit_log on create/update/delete of core
// records (requirement #4). Append-only by design (the schema's RLS forbids
// UPDATE/DELETE on audit tables).
//
// This is best-effort within the request: an audit-write failure is logged but
// does not silently swallow the primary error. In the AWS target you would make
// the audit insert part of the same DB transaction as the mutation.
import { query } from './db.js';

export async function writeAudit({
  action,
  entityType,
  entityId,
  entityName,
  details,
  staffId,
  performedBy,
}) {
  try {
    await query(
      `INSERT INTO carelink.audit_log
         (action, entity_type, entity_id, entity_name, details,
          performed_by_staff_id, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        action,
        entityType ?? null,
        entityId ?? null,
        entityName ?? null,
        details ?? null,
        staffId ?? null,
        performedBy ?? null,
      ]
    );
  } catch (err) {
    // Do not crash the request if audit insert fails in dev; surface it.
    console.error('[carelink-api] audit_log write failed:', err.message);
  }
}
