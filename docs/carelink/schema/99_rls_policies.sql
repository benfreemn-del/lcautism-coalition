-- ============================================================================
-- LCAC CareLink — 99_rls_policies.sql
-- Row-Level Security for every table. DEFAULT DENY. NEVER `USING (true)` for
-- PHI — that was the real data-leak bug in the prior backend (see
-- docs/ai-workflow-upgrade/backend-review-snapshot.md).
--
-- Access model (requirement #1, care-team access control):
--   * A `service_role` (server-side app / edge functions / migrations) bypasses
--     RLS by design and does the heavy lifting. We still write explicit RLS so
--     that IF the app ever talks to the DB as an authenticated end-user (staff
--     or family) — or if a service-role mistake happens — the database itself
--     enforces least privilege. This is a clinical system, so we do NOT rely on
--     "no policy = deny" alone; we write affirmative, scoped policies.
--   * STAFF (authenticated, carelink.current_staff_id() IS NOT NULL):
--       - org admins (Michelle / directors): full access via carelink.is_org_admin()
--       - everyone else: a client's records only if carelink.is_assigned_to_client()
--         i.e. carelink.can_access_client(client_id).
--   * FAMILY / PORTAL users (carelink.portal_*): only their granted children
--     via carelink.portal_user_can_access_client(); NO access to clinical tables.
--   * AUDIT tables: insert by app, read by admin, NO update/delete (write-once).
--
-- Roles assumed (adapt names to the host platform):
--   service_role    -> server-side; bypasses RLS (BYPASSRLS or Supabase default)
--   app_staff       -> logged-in staff sessions
--   app_portal      -> logged-in family/portal sessions
--   anon            -> unauthenticated; gets NOTHING here (public intake is the
--                      app's tokenized endpoint writing via service_role)
--
-- All policies are written for the `app_staff` / `app_portal` roles explicitly.
-- We never grant to `public`.
-- ============================================================================

-- ============================================================================
-- 0. Schema usage + default-deny grants.
-- ----------------------------------------------------------------------------
-- Let the app roles resolve objects in the schema, but grant NO blanket table
-- privileges. Each table's privileges are granted narrowly below. anon gets
-- nothing.
-- ============================================================================
GRANT USAGE ON SCHEMA carelink TO app_staff, app_portal, service_role;
-- service_role gets full DML on everything (it bypasses RLS anyway).
GRANT ALL ON ALL TABLES IN SCHEMA carelink TO service_role;
GRANT USAGE ON SCHEMA carelink TO service_role;

-- The helper functions must be callable by the end-user roles for RLS to run.
GRANT EXECUTE ON FUNCTION carelink.current_auth_uid()                 TO app_staff, app_portal;
GRANT EXECUTE ON FUNCTION carelink.current_staff_id()                 TO app_staff;
GRANT EXECUTE ON FUNCTION carelink.is_org_admin()                     TO app_staff;
GRANT EXECUTE ON FUNCTION carelink.is_assigned_to_client(uuid)        TO app_staff;
GRANT EXECUTE ON FUNCTION carelink.can_access_client(uuid)            TO app_staff;

-- ============================================================================
-- 1. Portal helper functions (defined here because they depend on 04_portal).
-- ============================================================================

-- The current portal user's id (NULL if caller is not a portal user).
CREATE OR REPLACE FUNCTION carelink.current_portal_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT pu.id
    FROM carelink.portal_users pu
    WHERE pu.auth_user_id = carelink.current_auth_uid()
      AND pu.status = 'active'
      AND pu.deleted_at IS NULL;
$$;
COMMENT ON FUNCTION carelink.current_portal_user_id() IS 'portal_users.id for the calling family user, or NULL.';

-- May the current portal user access this child? (active, approved grant)
CREATE OR REPLACE FUNCTION carelink.portal_user_can_access_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM carelink.portal_access pa
        WHERE pa.client_id = p_client_id
          AND pa.portal_user_id = carelink.current_portal_user_id()
          AND pa.status = 'active'
          AND pa.approved = true
          AND pa.deleted_at IS NULL
    );
$$;
COMMENT ON FUNCTION carelink.portal_user_can_access_client(uuid) IS 'TRUE if the calling portal user has an active, approved portal_access grant for p_client_id. Default-deny for families.';

GRANT EXECUTE ON FUNCTION carelink.current_portal_user_id()                TO app_portal;
GRANT EXECUTE ON FUNCTION carelink.portal_user_can_access_client(uuid)     TO app_portal;

-- ============================================================================
-- 2. Enable RLS on EVERY table. No exceptions.
--    FORCE so even the table OWNER is subject to RLS (prevents a privileged
--    owner role from quietly reading PHI without a policy). service_role still
--    bypasses RLS because it holds the BYPASSRLS attribute, which is checked
--    independently of FORCE — so server-side code keeps full access. If your
--    platform's service role does NOT have BYPASSRLS (some managed setups),
--    grant it explicitly or it will be blocked by FORCE like everyone else.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'carelink'
    LOOP
        EXECUTE format('ALTER TABLE carelink.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE carelink.%I FORCE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- ============================================================================
-- 3. Narrow base-table privilege grants to the end-user roles.
--    RLS filters ROWS; these GRANTs allow the OPERATIONS at all. Without the
--    grant, even a permissive policy can't expose data (defense in depth, the
--    second half of the lock the prior audit identified).
-- ----------------------------------------------------------------------------
-- 3a. STAFF can SELECT/INSERT/UPDATE clinical + operational tables (rows gated
--     by policies below). They never DELETE (soft-delete via deleted_at).
-- ============================================================================
DO $$
DECLARE t text;
  -- tables staff may read/write (everything except portal-only + audit, which
  -- are granted separately)
  staff_tables text[] := ARRAY[
    'staff_members','role_templates','households','clients','client_assignments',
    'referrals','appointments','blocked_time','waitlist_entries','clinical_notes',
    'chart_reviews','case_summaries','ados2_assessments','adhd_assessments',
    'exec_function_assessments','sensory_profiles','screenings','diagnostic_equity_records',
    'service_plans','service_plan_versions','service_coordination','outgoing_referrals',
    'behavior_incidents','crisis_debriefs','de_escalation_plans','safety_plans',
    'consent_forms','cultural_identity','cultural_practices','iep_meetings','iee_requests',
    'pwn_logs','transition_plans','discharge_plans','wraparound_teams','consultations',
    'meeting_transcripts','outcome_records','generated_letters','resource_matches',
    'client_workflows','form_distributions','submissions','intake_progress',
    'document_templates','pending_registrations','onboarding_requests',
    'translations','translation_reviews','logic_models','grants','grant_reports',
    'units_of_service','suppliers','inventory_items','kit_templates','kit_assemblies',
    'inventory_holds','inventory_transactions','resources','tasks','reports','workshops',
    'outreach_events','pdsa_projects','supervision_meetings','training_courses',
    'training_records','compliance_links','onboarding_records','policy_documents',
    'policy_acknowledgements','interpreters','data_sovereignty_configs','sync_state',
    'notifications','notification_preferences','portal_users','portal_access',
    'portal_invitations','portal_appointments','portal_consents','portal_documents',
    'portal_messages','portal_feedback'
  ];
BEGIN
    FOREACH t IN ARRAY staff_tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON carelink.%I TO app_staff;', t);
    END LOOP;
END $$;

-- 3b. PORTAL users may read/write only the family-facing tables.
GRANT SELECT, UPDATE ON carelink.portal_users         TO app_portal;
GRANT SELECT          ON carelink.households           TO app_portal;
GRANT SELECT          ON carelink.portal_access        TO app_portal;
GRANT SELECT          ON carelink.portal_appointments  TO app_portal;
GRANT SELECT, UPDATE  ON carelink.portal_consents      TO app_portal;
GRANT SELECT, INSERT  ON carelink.portal_documents     TO app_portal;
GRANT SELECT, INSERT  ON carelink.portal_messages      TO app_portal;
GRANT SELECT, INSERT  ON carelink.portal_feedback      TO app_portal;

-- 3c. Audit tables: staff/app INSERT only; admin SELECT; NEVER update/delete.
GRANT INSERT, SELECT ON carelink.audit_log            TO app_staff;
GRANT INSERT, SELECT ON carelink.permission_audit_log TO app_staff;
GRANT INSERT, SELECT ON carelink.portal_access_log    TO app_staff;

-- 3d. anon: nothing. (No GRANTs.) Public/tokenized intake is handled by the app
--     server using service_role after validating the form token — there is no
--     anon SQL path into PHI.

-- ============================================================================
-- 4. CLINICAL / PHI POLICIES — care-team scoped (requirement #1).
-- ----------------------------------------------------------------------------
-- Pattern for a table with a client_id column: staff may act on the row iff
-- carelink.can_access_client(client_id) (org-admin OR actively assigned).
-- We generate one FOR ALL policy per such table to keep this readable and to
-- guarantee none is forgotten. WITH CHECK mirrors USING so inserts/updates
-- can't smuggle a row for a client you can't access.
-- ============================================================================
DO $$
DECLARE t text;
  -- every table whose access is gated by a direct client_id FK
  client_scoped_tables text[] := ARRAY[
    'appointments','waitlist_entries','clinical_notes','case_summaries',
    'ados2_assessments','adhd_assessments','exec_function_assessments',
    'sensory_profiles','screenings','diagnostic_equity_records','service_plans',
    'service_plan_versions','service_coordination','outgoing_referrals',
    'behavior_incidents','crisis_debriefs','de_escalation_plans','safety_plans',
    'consent_forms','cultural_identity','cultural_practices','iep_meetings',
    'iee_requests','pwn_logs','transition_plans','discharge_plans',
    'wraparound_teams','meeting_transcripts','outcome_records','generated_letters',
    'resource_matches','client_workflows','form_distributions','submissions',
    'intake_progress','units_of_service','notification_preferences'
  ];
BEGIN
    FOREACH t IN ARRAY client_scoped_tables LOOP
        EXECUTE format($f$
            CREATE POLICY %1$s_staff_care_team ON carelink.%1$I
                FOR ALL
                TO app_staff
                USING (carelink.can_access_client(client_id))
                WITH CHECK (carelink.can_access_client(client_id));
        $f$, t);
        EXECUTE format($c$
            COMMENT ON POLICY %1$s_staff_care_team ON carelink.%1$I IS
            'Care-team scope: org-admin OR actively assigned to client_id (carelink.can_access_client). Default-deny.';
        $c$, t);
    END LOOP;
END $$;

-- chart_reviews, consultations: client_id is NULLABLE (some are not client-tied
-- or are supervisory). Org admin always; otherwise care-team when a client is
-- set; rows with NULL client_id are admin-only (supervisory/QA). consultations
-- additionally readable by panel members handled in app layer.
CREATE POLICY chart_reviews_staff ON carelink.chart_reviews
    FOR ALL TO app_staff
    USING (carelink.is_org_admin()
           OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id)))
    WITH CHECK (carelink.is_org_admin()
           OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id)));
COMMENT ON POLICY chart_reviews_staff ON carelink.chart_reviews IS
    'QA reviews: admin always; care-team when tied to a client. NULL-client (supervisory) rows = admin only.';

CREATE POLICY consultations_staff ON carelink.consultations
    FOR ALL TO app_staff
    USING (carelink.is_org_admin()
           OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id)))
    WITH CHECK (carelink.is_org_admin()
           OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id)));
COMMENT ON POLICY consultations_staff ON carelink.consultations IS
    'Case consults: admin always; care-team when client-tied. General (NULL-client) consults = admin only at DB layer.';

-- kit_assemblies, inventory_holds, inventory_transactions, tasks: client_id is
-- OPTIONAL. When a client is attached the row is PHI and must be care-team
-- scoped; when NULL it is general operational inventory/admin work any staff
-- may handle. Tasks additionally allow the assignee.
CREATE POLICY kit_assemblies_staff ON carelink.kit_assemblies
    FOR ALL TO app_staff
    USING (reserved_for_client_id IS NULL OR carelink.can_access_client(reserved_for_client_id))
    WITH CHECK (reserved_for_client_id IS NULL OR carelink.can_access_client(reserved_for_client_id));
COMMENT ON POLICY kit_assemblies_staff ON carelink.kit_assemblies IS
    'General kits (no client) open to staff; client-reserved kits are care-team scoped.';

CREATE POLICY inventory_holds_staff ON carelink.inventory_holds
    FOR ALL TO app_staff
    USING (client_id IS NULL OR carelink.can_access_client(client_id))
    WITH CHECK (client_id IS NULL OR carelink.can_access_client(client_id));
COMMENT ON POLICY inventory_holds_staff ON carelink.inventory_holds IS
    'Holds with no client open to staff; client holds are care-team scoped.';

CREATE POLICY inventory_transactions_staff ON carelink.inventory_transactions
    FOR ALL TO app_staff
    USING (client_id IS NULL OR carelink.can_access_client(client_id))
    WITH CHECK (client_id IS NULL OR carelink.can_access_client(client_id));
COMMENT ON POLICY inventory_transactions_staff ON carelink.inventory_transactions IS
    'Stock movements with no client open to staff; client distributions are care-team scoped.';

CREATE POLICY tasks_staff ON carelink.tasks
    FOR ALL TO app_staff
    USING (
        carelink.is_org_admin()
        OR assigned_to_staff_id = carelink.current_staff_id()
        OR staff_member_id      = carelink.current_staff_id()
        OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id))
    )
    WITH CHECK (
        carelink.is_org_admin()
        OR assigned_to_staff_id = carelink.current_staff_id()
        OR staff_member_id      = carelink.current_staff_id()
        OR (client_id IS NOT NULL AND carelink.is_assigned_to_client(client_id))
    );
COMMENT ON POLICY tasks_staff ON carelink.tasks IS
    'Tasks: admin, the assignee/owner, or care-team for the linked client.';

-- ============================================================================
-- 5. CLIENTS + ASSIGNMENTS + HOUSEHOLDS (the spine).
-- ============================================================================

-- clients: admin sees all; other staff see only assigned clients.
CREATE POLICY clients_staff ON carelink.clients
    FOR ALL TO app_staff
    USING (carelink.can_access_client(id))
    WITH CHECK (carelink.is_org_admin());   -- only admins create/relabel clients arbitrarily
COMMENT ON POLICY clients_staff ON carelink.clients IS
    'Read/update a client only if org-admin or assigned. INSERT (and reassigning programs) restricted to admins (matches Base44 admin-create).';

-- Portal users may read the client rows for their granted children (the app
-- projects only family-safe columns; this gates row visibility).
CREATE POLICY clients_portal_read ON carelink.clients
    FOR SELECT TO app_portal
    USING (carelink.portal_user_can_access_client(id));
-- (No portal grant of SELECT on clients is issued in section 3b on purpose:
--  uncomment the next line if family read of the core client row is required.)
-- GRANT SELECT ON carelink.clients TO app_portal;
COMMENT ON POLICY clients_portal_read ON carelink.clients IS
    'Portal: a family user may read only the client rows for children they have an active approved portal_access grant to. Requires a SELECT grant to app_portal if enabled.';

-- client_assignments: admins manage all; a staff member may READ their own
-- assignments (so the app can show their caseload). Only admins write.
CREATE POLICY client_assignments_admin ON carelink.client_assignments
    FOR ALL TO app_staff
    USING (carelink.is_org_admin())
    WITH CHECK (carelink.is_org_admin());
COMMENT ON POLICY client_assignments_admin ON carelink.client_assignments IS
    'Only org-admins create/modify care-team assignments (the access-granting table). Self-read added by separate SELECT policy.';

CREATE POLICY client_assignments_self_read ON carelink.client_assignments
    FOR SELECT TO app_staff
    USING (staff_member_id = carelink.current_staff_id());
COMMENT ON POLICY client_assignments_self_read ON carelink.client_assignments IS
    'A staff member may read the assignment rows that grant them access (their own caseload).';

-- households: admin all; staff may read a household if assigned to any client
-- in it; portal users read their own household.
CREATE POLICY households_staff ON carelink.households
    FOR ALL TO app_staff
    USING (
        carelink.is_org_admin()
        OR EXISTS (
            SELECT 1 FROM carelink.clients c
            WHERE c.household_id = households.id
              AND carelink.is_assigned_to_client(c.id)
        )
    )
    WITH CHECK (carelink.is_org_admin());
COMMENT ON POLICY households_staff ON carelink.households IS
    'Staff read a household if admin or assigned to a client in it; only admins write households.';

CREATE POLICY households_portal_read ON carelink.households
    FOR SELECT TO app_portal
    USING (id = (SELECT pu.household_id FROM carelink.portal_users pu
                 WHERE pu.id = carelink.current_portal_user_id()));
COMMENT ON POLICY households_portal_read ON carelink.households IS
    'Portal user may read only their own household row.';

-- ============================================================================
-- 6. STAFF DIRECTORY + STAFF-OWNED OPERATIONAL TABLES.
-- ----------------------------------------------------------------------------
-- staff may read the directory (needed to populate pickers); update only self;
-- admins manage all. Mirrors Base44 (self OR admin for read/update).
-- ============================================================================
CREATE POLICY staff_members_read ON carelink.staff_members
    FOR SELECT TO app_staff
    USING (carelink.current_staff_id() IS NOT NULL);   -- any active staff may browse the directory
CREATE POLICY staff_members_self_or_admin_write ON carelink.staff_members
    FOR UPDATE TO app_staff
    USING (carelink.is_org_admin() OR id = carelink.current_staff_id())
    WITH CHECK (carelink.is_org_admin() OR id = carelink.current_staff_id());
CREATE POLICY staff_members_admin_insert ON carelink.staff_members
    FOR INSERT TO app_staff
    WITH CHECK (carelink.is_org_admin());
COMMENT ON POLICY staff_members_read ON carelink.staff_members IS 'Any active staff may read the staff directory (for assignment pickers etc.).';
COMMENT ON POLICY staff_members_self_or_admin_write ON carelink.staff_members IS 'A staff member edits only their own row; admins edit anyone.';

-- Tables a staff member relates to via their OWN staff_member_id, plus admin.
-- training_records, onboarding_records, policy_acknowledgements, compliance_links.
DO $$
DECLARE t text;
  staff_self_tables text[] := ARRAY[
    'training_records','onboarding_records','policy_acknowledgements','compliance_links'
  ];
BEGIN
    FOREACH t IN ARRAY staff_self_tables LOOP
        EXECUTE format($f$
            CREATE POLICY %1$s_staff_self ON carelink.%1$I
                FOR ALL TO app_staff
                USING (carelink.is_org_admin() OR staff_member_id = carelink.current_staff_id())
                WITH CHECK (carelink.is_org_admin() OR staff_member_id = carelink.current_staff_id());
        $f$, t);
        EXECUTE format($c$
            COMMENT ON POLICY %1$s_staff_self ON carelink.%1$I IS
            'Admin OR the staff member themself (own training/onboarding/policy/compliance record).';
        $c$, t);
    END LOOP;
END $$;

-- supervision_meetings: admin OR the supervisor/supervisee.
CREATE POLICY supervision_meetings_party ON carelink.supervision_meetings
    FOR ALL TO app_staff
    USING (carelink.is_org_admin()
           OR supervisor_staff_id = carelink.current_staff_id()
           OR supervisee_staff_id = carelink.current_staff_id())
    WITH CHECK (carelink.is_org_admin()
           OR supervisor_staff_id = carelink.current_staff_id()
           OR supervisee_staff_id = carelink.current_staff_id());
COMMENT ON POLICY supervision_meetings_party ON carelink.supervision_meetings IS
    'Admin OR the supervisor/supervisee on the meeting.';

-- blocked_time: admin OR the owning staff member.
CREATE POLICY blocked_time_staff ON carelink.blocked_time
    FOR ALL TO app_staff
    USING (carelink.is_org_admin() OR staff_member_id = carelink.current_staff_id())
    WITH CHECK (carelink.is_org_admin() OR staff_member_id = carelink.current_staff_id());
COMMENT ON POLICY blocked_time_staff ON carelink.blocked_time IS 'Admin OR the owning staff member.';

-- ============================================================================
-- 7. REFERRALS (intake funnel): admin, creator, or assigned coordinator.
--    Pre-client, so no client_id gate; mirrors Base44 (created_by/assigned_to).
-- ============================================================================
CREATE POLICY referrals_staff ON carelink.referrals
    FOR ALL TO app_staff
    USING (carelink.is_org_admin()
           OR assigned_staff_id   = carelink.current_staff_id()
           OR created_by_staff_id = carelink.current_staff_id())
    WITH CHECK (carelink.is_org_admin()
           OR assigned_staff_id   = carelink.current_staff_id()
           OR created_by_staff_id = carelink.current_staff_id());
COMMENT ON POLICY referrals_staff ON carelink.referrals IS
    'Intake funnel: admin, the assigned coordinator, or the creator. No client_id yet (pre-enrollment).';

-- IEP/IEE/PWN/transition/discharge/outgoing referrals already covered by the
-- client-scoped generator in section 4 (they all have client_id). Their
-- assigned_staff_id can be used by the app for finer display filtering.

-- ============================================================================
-- 8. REFERENCE / OPERATIONAL DATA readable by all staff, written by admins
--    (or any staff for low-risk operational tables). Not client PHI.
-- ============================================================================

-- Read-by-any-staff, write-by-admin reference tables.
DO $$
DECLARE t text;
  ref_admin_write text[] := ARRAY[
    'role_templates','document_templates','training_courses','policy_documents',
    'data_sovereignty_configs','sync_state'
  ];
BEGIN
    FOREACH t IN ARRAY ref_admin_write LOOP
        EXECUTE format($f$
            CREATE POLICY %1$s_read ON carelink.%1$I
                FOR SELECT TO app_staff
                USING (carelink.current_staff_id() IS NOT NULL);
        $f$, t);
        EXECUTE format($f$
            CREATE POLICY %1$s_admin_write ON carelink.%1$I
                FOR ALL TO app_staff
                USING (carelink.is_org_admin())
                WITH CHECK (carelink.is_org_admin());
        $f$, t);
    END LOOP;
END $$;
-- NOTE: data_sovereignty_configs / sync_state are admin-only in Base44. The
-- _read policy above lets any staff SELECT them; tighten to admin-only by
-- DROPPING the *_read policy for those two if strict parity is required
-- (flagged in README). Their _admin_write policy already restricts writes.

-- Operational tables any active staff may fully use (no client PHI):
DO $$
DECLARE t text;
  staff_open text[] := ARRAY[
    'suppliers','inventory_items','kit_templates','resources','workshops',
    'outreach_events','pdsa_projects','logic_models','grants','grant_reports',
    'reports','interpreters','translations','translation_reviews',
    'pending_registrations','onboarding_requests','notifications'
  ];
BEGIN
    FOREACH t IN ARRAY staff_open LOOP
        EXECUTE format($f$
            CREATE POLICY %1$s_staff_all ON carelink.%1$I
                FOR ALL TO app_staff
                USING (carelink.current_staff_id() IS NOT NULL)
                WITH CHECK (carelink.current_staff_id() IS NOT NULL);
        $f$, t);
        EXECUTE format($c$
            COMMENT ON POLICY %1$s_staff_all ON carelink.%1$I IS
            'Operational (non-client-PHI) data usable by any active staff member.';
        $c$, t);
    END LOOP;
END $$;
-- NOTE: pending_registrations / onboarding_requests are admin-review tables in
-- Base44. The broad staff policy above is convenient but loose; restrict to
-- admin by replacing with is_org_admin() if desired (flagged in README).

-- ============================================================================
-- 9. PORTAL POLICIES — families see ONLY their granted children.
-- ============================================================================

-- portal_users: a family user reads/updates only their own row; admin all.
CREATE POLICY portal_users_self ON carelink.portal_users
    FOR ALL TO app_portal
    USING (id = carelink.current_portal_user_id())
    WITH CHECK (id = carelink.current_portal_user_id());
CREATE POLICY portal_users_staff ON carelink.portal_users
    FOR ALL TO app_staff
    USING (carelink.current_staff_id() IS NOT NULL)   -- staff manage portal accounts
    WITH CHECK (carelink.is_org_admin());
COMMENT ON POLICY portal_users_self ON carelink.portal_users IS 'A portal user may see/edit only their own profile row.';

-- portal_access: family reads only their own grants; admin manages.
CREATE POLICY portal_access_self ON carelink.portal_access
    FOR SELECT TO app_portal
    USING (portal_user_id = carelink.current_portal_user_id());
CREATE POLICY portal_access_staff ON carelink.portal_access
    FOR ALL TO app_staff
    USING (carelink.current_staff_id() IS NOT NULL)
    WITH CHECK (carelink.is_org_admin());   -- only admins approve/grant access
COMMENT ON POLICY portal_access_staff ON carelink.portal_access IS 'Staff read grants; only admins approve/create them.';

-- portal_invitations: staff/admin only (no portal grant issued in 3b).
CREATE POLICY portal_invitations_staff ON carelink.portal_invitations
    FOR ALL TO app_staff
    USING (carelink.current_staff_id() IS NOT NULL)
    WITH CHECK (carelink.is_org_admin());
COMMENT ON POLICY portal_invitations_staff ON carelink.portal_invitations IS 'Admin-managed invitations; tokenized acceptance handled by the app via service_role.';

-- Family-facing per-child tables: portal user sees rows for their granted
-- children; staff see them via care-team scope.
-- portal_appointments (read-only for family), portal_consents (read+update),
-- portal_documents (read+insert), portal_messages (read+insert), and a staff
-- care-team policy on each.
CREATE POLICY portal_appointments_family ON carelink.portal_appointments
    FOR SELECT TO app_portal
    USING (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_appointments_staff ON carelink.portal_appointments
    FOR ALL TO app_staff
    USING (carelink.can_access_client(client_id))
    WITH CHECK (carelink.can_access_client(client_id));

CREATE POLICY portal_consents_family ON carelink.portal_consents
    FOR SELECT TO app_portal
    USING (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_consents_family_update ON carelink.portal_consents
    FOR UPDATE TO app_portal
    USING (carelink.portal_user_can_access_client(client_id))
    WITH CHECK (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_consents_staff ON carelink.portal_consents
    FOR ALL TO app_staff
    USING (carelink.can_access_client(client_id))
    WITH CHECK (carelink.can_access_client(client_id));
COMMENT ON POLICY portal_consents_family_update ON carelink.portal_consents IS
    'Family may revoke/update consents for their own child (Base44 allowed family update of own-child consents).';

CREATE POLICY portal_documents_family ON carelink.portal_documents
    FOR SELECT TO app_portal
    USING (family_visible = true AND carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_documents_family_insert ON carelink.portal_documents
    FOR INSERT TO app_portal
    WITH CHECK (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_documents_staff ON carelink.portal_documents
    FOR ALL TO app_staff
    USING (carelink.can_access_client(client_id))
    WITH CHECK (carelink.can_access_client(client_id));
COMMENT ON POLICY portal_documents_family ON carelink.portal_documents IS
    'Family sees only family_visible documents for their granted children; may upload (insert) for those children.';

CREATE POLICY portal_messages_family ON carelink.portal_messages
    FOR SELECT TO app_portal
    USING (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_messages_family_insert ON carelink.portal_messages
    FOR INSERT TO app_portal
    WITH CHECK (carelink.portal_user_can_access_client(client_id));
CREATE POLICY portal_messages_staff ON carelink.portal_messages
    FOR ALL TO app_staff
    USING (carelink.can_access_client(client_id))
    WITH CHECK (carelink.can_access_client(client_id));
COMMENT ON POLICY portal_messages_family ON carelink.portal_messages IS
    'Family reads/sends messages only for their granted children. Staff via care-team scope.';

-- portal_feedback: a portal user may insert their own; only staff/admin read.
CREATE POLICY portal_feedback_family_insert ON carelink.portal_feedback
    FOR INSERT TO app_portal
    WITH CHECK (portal_user_id = carelink.current_portal_user_id());
CREATE POLICY portal_feedback_staff_read ON carelink.portal_feedback
    FOR SELECT TO app_staff
    USING (carelink.current_staff_id() IS NOT NULL);
COMMENT ON POLICY portal_feedback_family_insert ON carelink.portal_feedback IS
    'Portal user submits feedback as themselves; cannot read others'' feedback. Staff read all.';

-- notification_preferences already covered by the client-scoped generator
-- (section 4). It also makes sense for the family to read their child's prefs;
-- add if needed (app currently manages prefs staff-side).

-- ============================================================================
-- 10. AUDIT TABLES — write-once. Insert by app/staff; SELECT by admin only;
--     NO update/delete policy exists => updates/deletes are denied for
--     app_staff/app_portal (and the UPDATE/DELETE grants were never issued).
-- ============================================================================
DO $$
DECLARE t text;
  audit_tables text[] := ARRAY['audit_log','permission_audit_log','portal_access_log'];
BEGIN
    FOREACH t IN ARRAY audit_tables LOOP
        -- app/staff may INSERT audit rows (the app writes them as it acts)
        EXECUTE format($f$
            CREATE POLICY %1$s_insert ON carelink.%1$I
                FOR INSERT TO app_staff
                WITH CHECK (true);
        $f$, t);
        -- only admins may READ the audit trail
        EXECUTE format($f$
            CREATE POLICY %1$s_admin_read ON carelink.%1$I
                FOR SELECT TO app_staff
                USING (carelink.is_org_admin());
        $f$, t);
        EXECUTE format($c$
            COMMENT ON POLICY %1$s_insert ON carelink.%1$I IS
            'Append-only: app inserts audit rows. No UPDATE/DELETE policy exists, so audit history is immutable to end users.';
        $c$, t);
        EXECUTE format($c$
            COMMENT ON POLICY %1$s_admin_read ON carelink.%1$I IS
            'Only org-admins may read the audit trail.';
        $c$, t);
    END LOOP;
END $$;

-- The PortalAccessLog rows that are is_family_visible are surfaced to families
-- by the app (service_role), not by a direct app_portal SELECT, to avoid
-- exposing the whole log. (Add a scoped app_portal SELECT policy keyed on
-- is_family_visible + portal_user_can_access_client(client_id) if direct family
-- read is later required.)

-- ============================================================================
-- 11. WHY THIS CANNOT REPEAT THE PRIOR LEAK
-- ----------------------------------------------------------------------------
--   * No policy uses `USING (true)` for a PHI read. The only `WITH CHECK (true)`
--     are append-only audit INSERTs (writing, not reading) — they expose no rows.
--   * No policy targets `public`. Every policy names app_staff or app_portal.
--   * anon holds no GRANTs in the carelink schema at all.
--   * Even with a policy present, a role can only act where it ALSO holds the
--     base-table GRANT (section 3) — the two-lock model the audit prescribed.
--   * Clinical rows are gated by carelink.can_access_client(); a staff member
--     with zero assignments and no admin flag sees zero clients (default deny).
--   * service_role bypasses RLS and is server-side only; it is never shipped to
--     a browser, exactly as the CRM doc requires.
-- ============================================================================
