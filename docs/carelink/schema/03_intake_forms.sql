-- ============================================================================
-- LCAC CareLink — 03_intake_forms.sql
-- Intake-by-text/email plumbing (requirement #3 of the director's list):
-- distributing forms, capturing responses, tracking multi-step intake, and the
-- staff/account onboarding requests. These are the entities BUILD-PLAN.md §2.3
-- names for the SMS/email intake flow (FormDistribution / Submission /
-- IntakeProgress).
-- DESIGN ONLY.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- form_distributions  (Base44: FormDistribution)
-- ----------------------------------------------------------------------------
-- A form sent to a family via email (and, in the rebuild, SMS) with a tokenized
-- access_link. The family completes it; response_data captures the answers.
-- access_token is the secret used by the public tokenized intake endpoint —
-- the ONLY family-without-login write path (handled by the app, not anon SQL).
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.form_distributions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    appointment_id      uuid REFERENCES carelink.appointments (id) ON DELETE SET NULL,
    sent_by_staff_id    uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    client_email        text,
    client_phone        text,                                -- added for SMS intake (req #3)
    form_type           text NOT NULL CHECK (form_type IN ('demographic','roi','consent','intake','session_log')),
    form_title          text NOT NULL,
    language            text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    sent_date           date,
    sent_via_email      boolean NOT NULL DEFAULT true,
    sent_via_sms        boolean NOT NULL DEFAULT false,      -- added for SMS intake (req #3)
    access_link         text,
    access_token        text UNIQUE,                         -- secret token for the tokenized public link
    token_expires_at    timestamptz,
    reminder_sent       boolean NOT NULL DEFAULT false,
    reminder_sent_date  date,
    completion_status   text NOT NULL DEFAULT 'pending'
                        CHECK (completion_status IN ('pending','in_progress','completed','expired')),
    completed_date      date,
    response_data       jsonb,                               -- captured answers
    expiration_date     date,
    notes               text,
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','cancelled')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE  carelink.form_distributions IS 'Base44 FormDistribution. Tokenized intake form sent by email/SMS; response_data flows back into the record (req #3). access_token gates the public tokenized endpoint (app-enforced, not anon SQL).';
COMMENT ON COLUMN carelink.form_distributions.access_token IS 'Secret single-purpose token for the public intake link. The app validates it server-side and writes via service role; never exposed to broad anon SELECT.';
CREATE INDEX idx_form_dist_client ON carelink.form_distributions (client_id);
CREATE INDEX idx_form_dist_status ON carelink.form_distributions (completion_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_form_dist_token  ON carelink.form_distributions (access_token);
CREATE TRIGGER trg_form_dist_updated_at BEFORE UPDATE ON carelink.form_distributions
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- submissions  (Base44: Submission)  — a completed form bound to a client
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.submissions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    form_distribution_id uuid REFERENCES carelink.form_distributions (id) ON DELETE SET NULL,
    form_type           text NOT NULL,
    form_title          text,
    status              text NOT NULL DEFAULT 'Complete'
                        CHECK (status IN ('Complete','Draft','Awaiting Signature','Pending Review')),
    data                jsonb,                               -- form field values
    signature           text,
    signature_date      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.submissions IS 'Base44 Submission. A completed form''s data bound to a client (links its FormDistribution).';
CREATE INDEX idx_submissions_client ON carelink.submissions (client_id);
CREATE INDEX idx_submissions_dist   ON carelink.submissions (form_distribution_id);
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON carelink.submissions
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- intake_progress  (Base44: IntakeProgress)  — multi-step intake wizard state
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.intake_progress (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    current_step    integer NOT NULL DEFAULT 0,
    total_steps     integer NOT NULL DEFAULT 6,
    step_data       jsonb,
    language        text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    status          text NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress','Complete','Abandoned')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
COMMENT ON TABLE carelink.intake_progress IS 'Base44 IntakeProgress. Saved state of the multi-step intake wizard (resumable, bilingual).';
CREATE INDEX idx_intake_progress_client ON carelink.intake_progress (client_id);
CREATE TRIGGER trg_intake_progress_updated_at BEFORE UPDATE ON carelink.intake_progress
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- document_templates  (Base44: DocumentTemplate)  — merge templates (not PHI)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.document_templates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    name                text NOT NULL,
    category            text NOT NULL CHECK (category IN ('Medical','Legal','Intake','Referral','Other')),
    description         text,
    content             text NOT NULL,                       -- body with {{placeholders}}
    placeholders        text[] NOT NULL DEFAULT '{}',
    file_extension      text NOT NULL DEFAULT 'docx' CHECK (file_extension IN ('pdf','docx','txt')),
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.document_templates IS 'Base44 DocumentTemplate. Reusable merge templates. Reference data, not PHI; staff-readable.';
CREATE TRIGGER trg_doc_templates_updated_at BEFORE UPDATE ON carelink.document_templates
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- pending_registrations  (Base44: PendingRegistration)  — staff access requests
-- ----------------------------------------------------------------------------
-- Self-service request for STAFF system access (Base44 allowed anon create).
-- Reviewed by an admin. Not PHI; admin-only read/update.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.pending_registrations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           text NOT NULL,
    email               text NOT NULL,
    role_requested      text CHECK (role_requested IN
                            ('Care Coordinator','Community Health Worker','Family Navigator','Administrative Support','Other')),
    organization        text,
    reason              text,
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
    reviewed_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reviewed_date       timestamptz,
    admin_notes         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.pending_registrations IS 'Base44 PendingRegistration. Staff access requests awaiting admin review. Submitted via app endpoint (not raw anon SQL).';
CREATE TRIGGER trg_pending_reg_updated_at BEFORE UPDATE ON carelink.pending_registrations
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- onboarding_requests  (Base44: OnboardingRequest)  — new-staff request (admin)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.onboarding_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_name          text NOT NULL,
    email               text NOT NULL,
    role                text NOT NULL,
    program_assignments text[] NOT NULL DEFAULT '{}',
    start_date          date NOT NULL,
    contract_end_date   date,
    requested_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    requested_date      date,
    approved_by_staff_id  uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    approved_date       date,
    status              text NOT NULL DEFAULT 'Pending Approval'
                        CHECK (status IN ('Pending Approval','Approved','Completed','Rejected')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.onboarding_requests IS 'Base44 OnboardingRequest. Request to onboard a new staff member; Program Director approves.';
CREATE TRIGGER trg_onboarding_req_updated_at BEFORE UPDATE ON carelink.onboarding_requests
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();
