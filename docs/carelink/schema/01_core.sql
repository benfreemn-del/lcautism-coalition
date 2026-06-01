-- ============================================================================
-- LCAC CareLink — 01_core.sql
-- Core entities: staff, roles, clients, households, and the care-team
-- assignment model that drives access control (requirement #1).
-- DESIGN ONLY — see 00_extensions.sql header.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- staff_members  (Base44: StaffMember)
-- ----------------------------------------------------------------------------
-- The staff directory. `auth_user_id` links to the external identity provider
-- (AWS Cognito / Supabase auth). RLS keys off this, NOT off email strings the
-- way Base44 did (Base44 matched data.email == {{user.email}} — fragile).
-- Base44 stored `role` and `program_assignments` as string arrays; we keep the
-- multi-role list as text[] but ALSO model org-wide privilege explicitly via
-- `is_org_admin` (derived/maintained by app from role) so RLS has one clean
-- boolean to check (Michelle = director => is_org_admin = true).
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.staff_members (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id                uuid UNIQUE,                 -- FK to auth provider (Cognito/Supabase); app-managed
    name                        text NOT NULL,
    photo_url                   text,
    email                       text NOT NULL UNIQUE,
    phone                       text,
    roles                       text[] NOT NULL DEFAULT '{}',-- e.g. {'Executive Director','Care Coordinator'}
    -- org-wide privilege: true for Executive Director / Program Director / admin.
    -- This is what RLS checks for "see all clients" (Michelle). App keeps it in
    -- sync with `roles`; kept explicit so policies don't parse role strings.
    is_org_admin                boolean NOT NULL DEFAULT false,
    program_assignments         text[] NOT NULL DEFAULT '{}',-- SMART Team, Autism Package, Entendiendo El Autismo, ...
    languages                   text[] NOT NULL DEFAULT '{English}',
    credentials                 jsonb NOT NULL DEFAULT '[]', -- [{type,issue_date,expiration_date,verification_status}]
    documents                   jsonb NOT NULL DEFAULT '[]', -- [{id,name,url,upload_date,type}]
    caseload_capacity           integer DEFAULT 0,
    custom_permissions          text[] NOT NULL DEFAULT '{}',-- Base44 `permissions` (beyond role defaults)
    hipaa_agreement_signed      boolean NOT NULL DEFAULT false,
    hipaa_signed_date           date,
    ferpa_training_completed    boolean NOT NULL DEFAULT false,
    ferpa_training_date         date,
    background_check_completed  boolean NOT NULL DEFAULT false,
    background_check_date       date,
    supervisor_id               uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    status                      text NOT NULL DEFAULT 'Pending Onboarding'
                                CHECK (status IN ('Active','Pending Onboarding','On Leave','Inactive','Archived')),
    hire_date                   date,
    last_login                  timestamptz,
    temporary_access_end_date   date,                        -- contracted consultants: time-limited access
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);

COMMENT ON TABLE  carelink.staff_members IS 'Base44 StaffMember. Staff directory; auth_user_id links to the identity provider. RLS uses is_org_admin + client_assignments, not email-string matching.';
COMMENT ON COLUMN carelink.staff_members.is_org_admin IS 'TRUE for org-wide roles (Executive/Program Director, admin) who may access every client. App keeps this in sync with roles[].';
COMMENT ON COLUMN carelink.staff_members.credentials IS 'jsonb array of {type,issue_date,expiration_date,verification_status} (Base44 nested object array).';

CREATE INDEX idx_staff_email        ON carelink.staff_members (lower(email));
CREATE INDEX idx_staff_auth_user    ON carelink.staff_members (auth_user_id);
CREATE INDEX idx_staff_status       ON carelink.staff_members (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_name_search  ON carelink.staff_members USING gin (lower(name) gin_trgm_ops);

CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON carelink.staff_members
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- role_templates  (Base44: RoleTemplate)
-- ----------------------------------------------------------------------------
-- Definition of each role's default data-access posture. Admin-managed
-- reference data. Drives what permissions a staff role grants in the app layer;
-- RLS itself keys off is_org_admin + assignments, but these flags inform the
-- app's finer-grained gating (e.g. crisis-notes / educational-records access).
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.role_templates (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name                   text NOT NULL UNIQUE,
    description                 text,
    default_permissions         text[] NOT NULL DEFAULT '{}',
    data_access_level           text NOT NULL
                                CHECK (data_access_level IN (
                                    'view_only','create_edit_own','full_caseload_access',
                                    'approve_finalize','admin_access','export_reporting')),
    phi_access                  boolean,
    screening_data_access       boolean,
    educational_records_access  boolean,   -- requires FERPA training
    crisis_notes_access         boolean,
    export_access               boolean,
    approval_authority          boolean,
    staff_management            boolean,
    required_credentials        text[] NOT NULL DEFAULT '{}',
    required_training           text[] NOT NULL DEFAULT '{}',
    caseload_limit              integer,
    status                      text NOT NULL DEFAULT 'Active'
                                CHECK (status IN ('Active','Inactive')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);

COMMENT ON TABLE carelink.role_templates IS 'Base44 RoleTemplate. Per-role default access posture; admin reference data informing app-layer permission gating.';

CREATE TRIGGER trg_role_templates_updated_at BEFORE UPDATE ON carelink.role_templates
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- households  (Base44: PortalHousehold)
-- ----------------------------------------------------------------------------
-- A family unit. Base44 PortalHousehold stored member/child ID arrays inline;
-- we normalize: clients reference household_id; portal users reference it too
-- (see 04_portal.sql). primary_contact is a portal_user (set after that table
-- exists — see deferred FK note in 04_portal.sql).
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.households (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_name          text,                            -- e.g. "Smith Family"
    primary_contact_user_id uuid,                            -- FK -> portal_users(id); added in 04_portal.sql
    status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','inactive','closed')),
    language_preference     text NOT NULL DEFAULT 'English'
                            CHECK (language_preference IN ('English','Spanish','bilingual')),
    address                 text,
    city                    text,
    state                   text DEFAULT 'WA',
    zip                     text,
    phone                   text,
    cultural_practices      text[] NOT NULL DEFAULT '{}',
    heritage                text[] NOT NULL DEFAULT '{}',
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);

COMMENT ON TABLE carelink.households IS 'Base44 PortalHousehold. Family unit grouping clients + portal users. Member/child arrays normalized into FKs on clients/portal_users.';

CREATE TRIGGER trg_households_updated_at BEFORE UPDATE ON carelink.households
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- clients  (Base44: Client)
-- ----------------------------------------------------------------------------
-- The clinical spine — every served individual. PHI-heavy. Base44 inlined
-- documents, staff_notes, attached_resources as object arrays; kept as jsonb
-- (staff_notes is arguably its own table, flagged in README open questions).
-- `preferred_language` satisfies requirement #3 (bilingual) at the client level.
-- assigned_to / assigned_providers from Base44 are REPLACED by the normalized
-- client_assignments table below (the real care-team model, requirement #1).
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.clients (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id_number                text UNIQUE,             -- human LCAC ID e.g. LCAC-0001
    household_id                    uuid REFERENCES carelink.households (id) ON DELETE SET NULL,
    photo_url                       text,
    legal_first_name                text NOT NULL,
    legal_last_name                 text NOT NULL,
    preferred_name                  text,
    -- searchable display name
    full_name                       text GENERATED ALWAYS AS (
                                        trim(coalesce(legal_first_name,'') || ' ' || coalesce(legal_last_name,''))
                                    ) STORED,
    dob                             date,
    age_group                       text CHECK (age_group IN ('Pediatric','Adult')),
    school_name                     text,
    school_district                 text,
    sex_at_birth                    text CHECK (sex_at_birth IN ('Male','Female','Intersex','Prefer not to say')),
    current_gender                  text,
    address                         text,
    city                            text,
    state                           text DEFAULT 'WA',
    zip                             text,
    primary_phone                   text,
    secondary_phone                 text,
    email                           text,
    -- requirement #3: per-client preferred language
    preferred_language              text NOT NULL DEFAULT 'English'
                                    CHECK (preferred_language IN ('English','Spanish','Russian','Vietnamese','Other')),
    interpreter_needed              boolean NOT NULL DEFAULT false,
    interpreter_language            text,
    voicemail_ok                    boolean NOT NULL DEFAULT true,
    caregiver_name                  text NOT NULL,
    caregiver_relationship          text,
    caregiver_phone                 text,
    caregiver_email                 text,
    legal_authority                 text,
    insurance_provider              text,
    insurance_policy_id             text,
    insurance_holder_name           text,
    insurance_holder_relationship   text,
    housing_status                  text CHECK (housing_status IN
                                        ('Permanent','Doubling up','Transitional','Shelter','Unsheltered','Prefer not to say')),
    ethnicity                       text[] NOT NULL DEFAULT '{}',
    race                            text[] NOT NULL DEFAULT '{}',
    contact_reasons                 text[] NOT NULL DEFAULT '{}',
    programs                        text[] NOT NULL DEFAULT '{}', -- SMART Team, Autism Package, etc.
    documents                       jsonb  NOT NULL DEFAULT '[]', -- uploaded client documents
    attached_resources              jsonb  NOT NULL DEFAULT '[]', -- library resources attached (see resources table)
    staff_notes                     jsonb  NOT NULL DEFAULT '[]', -- private care-coordination notes (see README open Q)
    notes                           text,
    status                          text NOT NULL DEFAULT 'Active'
                                    CHECK (status IN ('Active','Inactive','Pending','Closed')),
    caution_level                   text NOT NULL DEFAULT 'none'
                                    CHECK (caution_level IN ('none','low','medium','high')),
    hipaa_acknowledged              boolean NOT NULL DEFAULT false,
    hipaa_acknowledged_date         timestamptz,
    esignature                      text,
    esignature_date                 timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    deleted_at                      timestamptz
);

COMMENT ON TABLE  carelink.clients IS 'Base44 Client. Clinical spine; PHI. Care-team access via carelink.client_assignments, NOT the legacy assigned_to / programs arrays.';
COMMENT ON COLUMN carelink.clients.programs IS 'Program enrollment (text[]). Base44 RLS gated read on programs overlapping the staff member''s program_assignments; we prefer explicit client_assignments but keep programs for reporting + optional program-level access.';
COMMENT ON COLUMN carelink.clients.staff_notes IS 'jsonb array of inline staff notes from Base44. OPEN QUESTION: promote to its own carelink.client_staff_notes table for per-note audit/mentions.';

CREATE INDEX idx_clients_household     ON carelink.clients (household_id);
CREATE INDEX idx_clients_status        ON carelink.clients (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_name_search   ON carelink.clients USING gin (lower(full_name) gin_trgm_ops);
CREATE INDEX idx_clients_programs      ON carelink.clients USING gin (programs);
CREATE INDEX idx_clients_id_number     ON carelink.clients (client_id_number);

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON carelink.clients
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- client_assignments  (NEW — the care-team model; requirement #1)
-- ----------------------------------------------------------------------------
-- Replaces Base44's loose Client.assigned_to / assigned_providers strings and
-- StaffMember.caseload_assignments arrays with a real join table. A staff
-- member can access a client's records ONLY if a row here links them (active,
-- not soft-deleted) OR they are is_org_admin. `role` records WHY they are on
-- the team (primary coordinator, provider, supervisor, etc.).
-- This table is the heart of 99_rls_policies.sql.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.client_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES carelink.clients (id)        ON DELETE CASCADE,
    staff_member_id uuid NOT NULL REFERENCES carelink.staff_members (id)  ON DELETE CASCADE,
    role            text NOT NULL DEFAULT 'care_coordinator'
                    CHECK (role IN (
                        'primary_coordinator','care_coordinator','provider',
                        'supervisor','navigator','community_health_worker','observer')),
    is_primary      boolean NOT NULL DEFAULT false,          -- the lead/owner for this client
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
    assigned_by     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    -- a staff member holds at most one ACTIVE assignment row per client
    UNIQUE (client_id, staff_member_id)
);

COMMENT ON TABLE carelink.client_assignments IS 'CARE-TEAM ACCESS CONTROL (requirement #1). client <-> staff_member with a role on the assignment. RLS: a non-admin staff member sees a client''s records only if an active row links them here.';

CREATE INDEX idx_assignments_client      ON carelink.client_assignments (client_id)       WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_assignments_staff       ON carelink.client_assignments (staff_member_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_assignments_one_primary
    ON carelink.client_assignments (client_id)
    WHERE is_primary = true AND status = 'active' AND deleted_at IS NULL;

CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON carelink.client_assignments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ============================================================================
-- ACCESS-CONTROL HELPER FUNCTIONS
-- These resolve the *current logged-in staff member* and answer the two
-- questions RLS asks. SECURITY DEFINER + locked search_path so they can read
-- staff_members / client_assignments regardless of the caller's own RLS.
-- The app sets the auth uid via the platform (auth.uid() on Supabase, or a
-- SET LOCAL on RDS). We wrap that lookup in carelink.current_auth_uid() so the
-- platform detail lives in ONE place.
-- ============================================================================

-- Resolve the calling user's auth uid. Adapt the body to the host platform.
CREATE OR REPLACE FUNCTION carelink.current_auth_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    -- Supabase: SELECT auth.uid()
    -- Generic/RDS: SELECT current_setting('carelink.auth_uid', true)::uuid
    SELECT nullif(current_setting('carelink.auth_uid', true), '')::uuid;
$$;

COMMENT ON FUNCTION carelink.current_auth_uid() IS 'Returns the auth uid of the calling user. Single place that depends on the host auth platform (Cognito/Supabase). Replace body with auth.uid() on Supabase.';

-- The current user's staff_members.id (NULL if not a staff member, e.g. a
-- portal/family user — those have no clinical-table access at all).
CREATE OR REPLACE FUNCTION carelink.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT sm.id
    FROM carelink.staff_members sm
    WHERE sm.auth_user_id = carelink.current_auth_uid()
      AND sm.status = 'Active'
      AND sm.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION carelink.current_staff_id() IS 'staff_members.id for the calling user, or NULL. NULL => no clinical access (default deny).';

-- Org-wide admin? (Michelle / directors). Bypasses per-client scoping.
CREATE OR REPLACE FUNCTION carelink.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM carelink.staff_members sm
        WHERE sm.auth_user_id = carelink.current_auth_uid()
          AND sm.is_org_admin = true
          AND sm.status = 'Active'
          AND sm.deleted_at IS NULL
    );
$$;

COMMENT ON FUNCTION carelink.is_org_admin() IS 'TRUE if the caller holds an org-wide role (director/admin). Used by every clinical RLS policy as the "see everything" branch.';

-- Is the current staff member assigned to this client (active assignment)?
CREATE OR REPLACE FUNCTION carelink.is_assigned_to_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM carelink.client_assignments ca
        WHERE ca.client_id = p_client_id
          AND ca.staff_member_id = carelink.current_staff_id()
          AND ca.status = 'active'
          AND ca.deleted_at IS NULL
    );
$$;

COMMENT ON FUNCTION carelink.is_assigned_to_client(uuid) IS 'TRUE if the calling staff member has an active client_assignments row for p_client_id. The per-client access predicate for clinical RLS.';

-- Convenience: may the caller touch this client's record at all?
-- (org admin OR assigned). Clinical-table policies call this with their FK.
CREATE OR REPLACE FUNCTION carelink.can_access_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT carelink.is_org_admin()
        OR (p_client_id IS NOT NULL AND carelink.is_assigned_to_client(p_client_id));
$$;

COMMENT ON FUNCTION carelink.can_access_client(uuid) IS 'Master predicate for clinical RLS: org-admin OR actively assigned to p_client_id. Default-deny: NULL client + non-admin => false.';
