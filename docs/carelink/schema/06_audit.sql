-- ============================================================================
-- LCAC CareLink — 06_audit.sql
-- Audit + safety (requirement #4). Append-only logs of who did what.
-- Base44 modeled three: AuditLog (generic), PermissionAuditLog (access/role
-- changes), PortalAccessLog (staff viewing a client record — the HIPAA
-- "who looked at my chart" log).
--
-- These tables are WRITE-ONCE: no UPDATE, no DELETE (Base44 rls had
-- update:false, delete:false). RLS makes them admin-read, insert-by-app.
-- They deliberately do NOT get a deleted_at-driven soft delete used for
-- editing — but the column is present for schema uniformity; nothing should
-- ever set it (enforced by the no-update policy in 99_rls).
-- DESIGN ONLY.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_log  (Base44: AuditLog)  — generic action log
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action          text NOT NULL,                           -- e.g. 'client.update','note.sign'
    entity_type     text,                                    -- table/entity affected
    entity_id       uuid,                                    -- affected row id (uuid where resolvable)
    entity_name     text,
    details         text,
    performed_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    performed_by    text,                                    -- email/identifier snapshot (kept even if staff row goes)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
COMMENT ON TABLE carelink.audit_log IS 'Base44 AuditLog. Generic append-only action audit. Write-once: no UPDATE/DELETE (see 99_rls). Admin-read only.';
CREATE INDEX idx_audit_log_entity ON carelink.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_time   ON carelink.audit_log (created_at);
CREATE INDEX idx_audit_log_actor  ON carelink.audit_log (performed_by_staff_id);

-- ----------------------------------------------------------------------------
-- permission_audit_log  (Base44: PermissionAuditLog)  — access/role changes
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.permission_audit_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,  -- affected staff
    staff_name          text,
    action_type         text NOT NULL CHECK (action_type IN
                            ('permission_granted','permission_revoked','role_changed','caseload_assigned',
                             'caseload_removed','credential_added','credential_expired','training_completed',
                             'status_changed','login_access','record_access','export_action')),
    action_timestamp    timestamptz NOT NULL DEFAULT now(),
    actor_staff_id      uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,  -- who made the change
    actor               text,                                -- email snapshot
    previous_value      text,
    new_value           text,
    justification       text,
    record_accessed     text,                                -- if record_access: which client/record type
    hipaa_compliant     boolean NOT NULL DEFAULT true,
    ip_address          text,
    status              text CHECK (status IN ('Completed','Pending Approval','Denied')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.permission_audit_log IS 'Base44 PermissionAuditLog. Append-only log of permission/role/caseload/access changes. Write-once, admin-read.';
CREATE INDEX idx_perm_audit_staff ON carelink.permission_audit_log (staff_member_id);
CREATE INDEX idx_perm_audit_time  ON carelink.permission_audit_log (action_timestamp);

-- ----------------------------------------------------------------------------
-- portal_access_log  (Base44: PortalAccessLog)  — staff viewed a client record
-- ----------------------------------------------------------------------------
-- The HIPAA accounting-of-disclosures / "who accessed my chart" log. Families
-- can be shown a view of this (is_family_visible). Recorded by the app on every
-- staff read/update/download/export of a client record.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_access_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    staff_member_email  text NOT NULL,                       -- snapshot
    staff_name          text,
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    client_name         text,
    access_type         text NOT NULL CHECK (access_type IN ('view','update','download','export')),
    what_was_accessed   text,
    access_timestamp    timestamptz NOT NULL DEFAULT now(),
    ip_address          text,
    device              text,
    is_family_visible   boolean NOT NULL DEFAULT true,
    justification       text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.portal_access_log IS 'Base44 PortalAccessLog. HIPAA access/disclosure log: which staff touched which client record. Write-once; admin-read; family-visible rows surfaced to the child''s portal users by the app.';
CREATE INDEX idx_portal_access_log_client ON carelink.portal_access_log (client_id, access_timestamp);
CREATE INDEX idx_portal_access_log_staff  ON carelink.portal_access_log (staff_member_id);
