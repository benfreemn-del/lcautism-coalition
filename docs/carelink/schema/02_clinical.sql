-- ============================================================================
-- LCAC CareLink — 02_clinical.sql
-- Clinical records: notes, assessments, plans, safety, behavior, cultural,
-- coordination, referrals, appointments, scheduling, units of service.
-- Every table here is PHI and carries a real client_id FK (requirement #2).
-- Access is governed by carelink.can_access_client(client_id) — see 99_rls.
-- DESIGN ONLY.
--
-- Bilingual note (requirement #3): staff-authored free-text records that may
-- be produced in EN or ES carry a `language` column (default 'English').
-- Machine/staff translations are tracked separately in carelink.translations
-- (see 05_ops.sql) + the TranslationReview workflow.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- referrals  (Base44: Referral)  — INTAKE FUNNEL, pre-client
-- ----------------------------------------------------------------------------
-- A referral may exist BEFORE a client record. When accepted it converts to a
-- client (converted_client_id). So client_id here is nullable and the FK is to
-- clients only once converted. Assigned coordinator drives access.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.referrals (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    converted_client_id     uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    assigned_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    child_name              text NOT NULL,
    dob                     date,
    age                     text,
    county                  text,
    preferred_language      text DEFAULT 'English'
                            CHECK (preferred_language IN ('English','Spanish','Russian','Vietnamese','Other')),
    source                  text CHECK (source IN
                                ('Healthcare Provider','School / District','Self / Family','Community Partner',
                                 'WA INCLUDE','DDA','Crisis / ER','Other')),
    referrer_name           text,
    referrer_org            text,
    referrer_phone          text,
    referrer_email          text,
    contact_name            text,
    contact_phone           text,
    contact_email           text,
    contact_relationship    text,
    requested_services      text[] NOT NULL DEFAULT '{}',
    presenting_concerns     text,
    urgency_notes           text,
    iep_status              text CHECK (iep_status IN ('Has IEP','Has 504','Evaluation Pending','No IEP/504','Unknown')),
    school_name             text,
    school_grade            text,
    school_district         text,
    diagnosis_known         boolean NOT NULL DEFAULT false,
    diagnosis_notes         text,
    insurance_type          text,
    consent_obtained        boolean NOT NULL DEFAULT false,
    consent_date            date,
    consent_notes           text,
    date_received           date,
    date_first_contact      date,
    contact_attempts        integer NOT NULL DEFAULT 0,
    intake_appointment_date timestamptz,
    priority                text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
    status                  text NOT NULL DEFAULT 'New'
                            CHECK (status IN ('New','Under Review','Pending Information','Assigned','Contact Attempted',
                                              'Engaged','Enrolled','Declined','Closed','Transferred')),
    decline_reason          text,
    internal_notes          text,
    reason                  text,                            -- legacy
    notes                   text,
    created_by_staff_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.referrals IS 'Base44 Referral. Intake funnel; may precede a client record, converts via converted_client_id. Access: assigned coordinator, creator, or org admin.';
CREATE INDEX idx_referrals_status   ON carelink.referrals (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_referrals_assigned ON carelink.referrals (assigned_staff_id);
CREATE INDEX idx_referrals_client   ON carelink.referrals (converted_client_id);
CREATE TRIGGER trg_referrals_updated_at BEFORE UPDATE ON carelink.referrals
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- appointments  (Base44: Appointment)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.appointments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    referral_id         uuid REFERENCES carelink.referrals (id) ON DELETE SET NULL,
    provider_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    title               text NOT NULL,
    description         text,
    appointment_date    timestamptz NOT NULL,
    end_time            timestamptz,
    duration_minutes    integer,
    appointment_type    text NOT NULL DEFAULT 'Other'
                        CHECK (appointment_type IN ('Assessment','Follow-up','Intake','Treatment','Consultation','Other')),
    location_type       text NOT NULL DEFAULT 'In person'
                        CHECK (location_type IN ('In person','Online','Drop-off')),
    location            text,
    status              text NOT NULL DEFAULT 'Scheduled'
                        CHECK (status IN ('Scheduled','Completed','Cancelled','No-show','Rescheduled')),
    check_in_time       timestamptz,
    check_in_provider   text,
    check_out_time      timestamptz,
    check_out_provider  text,
    referral_source     text,
    required_forms      jsonb NOT NULL DEFAULT '[]',         -- [{form_distribution_id,form_title,is_required}]
    notes               text,
    send_reminder       boolean NOT NULL DEFAULT true,
    reminder_sent       boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.appointments IS 'Base44 Appointment. Staff-side scheduling. required_forms links FormDistribution rows (intake; see 03_intake_forms.sql).';
CREATE INDEX idx_appointments_client ON carelink.appointments (client_id);
CREATE INDEX idx_appointments_date   ON carelink.appointments (appointment_date);
CREATE INDEX idx_appointments_status ON carelink.appointments (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON carelink.appointments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- blocked_time  (Base44: BlockedTime)  — staff calendar blocks (no client)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.blocked_time (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE CASCADE,
    start_time          timestamptz NOT NULL,
    end_time            timestamptz NOT NULL,
    reason              text NOT NULL DEFAULT 'Other'
                        CHECK (reason IN ('Lunch','Meeting','Time Off','Training','Administrative','Clinic Close','Other')),
    description         text,
    is_recurring        boolean NOT NULL DEFAULT false,
    recurring_pattern   text CHECK (recurring_pattern IN ('Daily','Weekly','Bi-weekly','Monthly')),
    recurring_end_date  date,
    series_id           uuid,                                -- groups a batch of recurring blocks
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.blocked_time IS 'Base44 BlockedTime. Staff calendar unavailability. Not PHI; staff-scoped.';
CREATE INDEX idx_blocked_time_staff ON carelink.blocked_time (staff_member_id, start_time);
CREATE TRIGGER trg_blocked_time_updated_at BEFORE UPDATE ON carelink.blocked_time
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- waitlist_entries  (Base44: WaitlistEntry)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.waitlist_entries (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    preferred_provider_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    appointment_type            text CHECK (appointment_type IN
                                    ('Assessment','Follow-up','Intake','Treatment','Consultation','Other')),
    preferred_date_range_start  date,
    preferred_date_range_end    date,
    notes                       text,
    status                      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','matched','cancelled')),
    position                    integer,
    date_added                  timestamptz NOT NULL DEFAULT now(),
    date_matched                timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.waitlist_entries IS 'Base44 WaitlistEntry. Clients awaiting an appointment slot.';
CREATE INDEX idx_waitlist_client ON carelink.waitlist_entries (client_id);
CREATE INDEX idx_waitlist_active ON carelink.waitlist_entries (status, position) WHERE status = 'active';
CREATE TRIGGER trg_waitlist_updated_at BEFORE UPDATE ON carelink.waitlist_entries
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- clinical_notes  (Base44: ClinicalNote)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.clinical_notes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    provider_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    note_type           text CHECK (note_type IN
                            ('Care Coordination','Home Visit','Phone Contact','School Meeting','Team Meeting',
                             'Crisis Intervention','Intake','Discharge','Follow-up','Collateral Contact')),
    session_date        date NOT NULL,
    start_time          text,
    end_time            text,
    duration_minutes    integer,
    location            text,
    participants        text[] NOT NULL DEFAULT '{}',
    note_body           text,
    intervention        text,
    outcome             text,
    follow_up_plan      text,
    billing_codes       text[] NOT NULL DEFAULT '{}',
    language            text NOT NULL DEFAULT 'English'
                        CHECK (language IN ('English','Spanish')),
    validation_passed   boolean NOT NULL DEFAULT false,
    validation_errors   text[] NOT NULL DEFAULT '{}',
    ai_suggestions_used boolean NOT NULL DEFAULT false,
    authored_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Pending Review','Submitted','Approved','Rejected')),
    signature_data      jsonb,                               -- {signature_image_url,signed_timestamp,signed_by}
    attachments         jsonb NOT NULL DEFAULT '[]',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.clinical_notes IS 'Base44 ClinicalNote. Encounter documentation; source for UnitOfService billing. `language` supports EN/ES authoring (req #3).';
CREATE INDEX idx_clinical_notes_client ON carelink.clinical_notes (client_id);
CREATE INDEX idx_clinical_notes_date   ON carelink.clinical_notes (session_date);
CREATE INDEX idx_clinical_notes_status ON carelink.clinical_notes (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_clinical_notes_updated_at BEFORE UPDATE ON carelink.clinical_notes
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- chart_reviews  (Base44: ChartReview)  — QA review of a clinical note
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.chart_reviews (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    note_id                 uuid REFERENCES carelink.clinical_notes (id) ON DELETE SET NULL,
    reviewer_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reviewee_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    review_date             date NOT NULL,
    review_type             text CHECK (review_type IN
                                ('Random Sample','Triggered Review','Quarterly Audit','New Staff Review','Performance Plan')),
    scores                  jsonb,                           -- criterion -> 1..4
    total_score             numeric,
    max_score               numeric,
    percentage              numeric,
    strengths               text,
    areas_for_improvement   text,
    coaching_feedback       text,
    action_items            text[] NOT NULL DEFAULT '{}',
    staff_acknowledged      boolean NOT NULL DEFAULT false,
    staff_response          text,
    follow_up_date          date,
    status                  text NOT NULL DEFAULT 'Draft'
                            CHECK (status IN ('Draft','Delivered','Acknowledged','Closed')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.chart_reviews IS 'Base44 ChartReview. Supervisory QA of a clinical note. Base44 also let the reviewer/reviewee read their own; here admin/supervisor scoped (see 99_rls).';
CREATE INDEX idx_chart_reviews_client   ON carelink.chart_reviews (client_id);
CREATE INDEX idx_chart_reviews_reviewee ON carelink.chart_reviews (reviewee_staff_id);
CREATE TRIGGER trg_chart_reviews_updated_at BEFORE UPDATE ON carelink.chart_reviews
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- case_summaries  (Base44: CaseSummary)  — AI-assisted period summary
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.case_summaries (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    summary_period_start    date,
    summary_period_end      date,
    source_notes_count      integer,
    ai_draft_summary        text NOT NULL,
    ai_key_themes           text[] NOT NULL DEFAULT '{}',
    coordinator_edits       text,
    status                  text NOT NULL DEFAULT 'Draft'
                            CHECK (status IN ('Draft','Under Review','Approved','Saved')),
    reviewed_by_staff_id    uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reviewed_date           date,
    saved                   boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.case_summaries IS 'Base44 CaseSummary. AI-drafted summary of a period of clinical notes; coordinator approves before saved=true.';
CREATE INDEX idx_case_summaries_client ON carelink.case_summaries (client_id);
CREATE TRIGGER trg_case_summaries_updated_at BEFORE UPDATE ON carelink.case_summaries
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- ASSESSMENTS — one table per Base44 instrument. Score columns kept numeric;
-- per-item responses kept jsonb (Base44 used additionalProperties objects).
-- ----------------------------------------------------------------------------

-- ADOS-2  (Base44: ADOS2Assessment)
CREATE TABLE carelink.ados2_assessments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    module              text NOT NULL CHECK (module IN ('Toddler','Module 1','Module 2','Module 3','Module 4')),
    administered_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    administered_date   date,
    age_years           numeric,
    domain_scores       jsonb,
    sa_total            numeric,                             -- Social Affect total
    rrb_total           numeric,                             -- Restricted & Repetitive Behaviors total
    overall_total       numeric,
    comparison_score    numeric,                             -- Calibrated Severity Score 1-10
    classification      text CHECK (classification IN
                            ('No Concern','Mild-Moderate Concern','Autism Spectrum Concern','Autism Concern')),
    algorithm_items     jsonb,
    clinical_observations text,
    summary_narrative   text,
    status              text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Complete','Reviewed')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.ados2_assessments IS 'Base44 ADOS2Assessment. Autism Diagnostic Observation Schedule, 2nd ed.';
CREATE INDEX idx_ados2_client ON carelink.ados2_assessments (client_id);
CREATE TRIGGER trg_ados2_updated_at BEFORE UPDATE ON carelink.ados2_assessments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ADHD  (Base44: ADHDAssessment)
CREATE TABLE carelink.adhd_assessments (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    clinician_staff_id          uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    assessment_date             date,
    parent_responses            jsonb,
    teacher_responses           jsonb,
    parent_inattention_score    numeric,
    parent_hyperactivity_score  numeric,
    teacher_inattention_score   numeric,
    teacher_hyperactivity_score numeric,
    parent_total                numeric,
    teacher_total               numeric,
    classification              text CHECK (classification IN ('Below Threshold','At Risk','Clinically Significant')),
    presentation                text CHECK (presentation IN
                                    ('Predominantly Inattentive','Predominantly Hyperactive-Impulsive',
                                     'Combined Presentation','Insufficient Data')),
    summary                     text,
    recommendations             text[] NOT NULL DEFAULT '{}',
    status                      text NOT NULL DEFAULT 'Incomplete'
                                CHECK (status IN ('Incomplete','Awaiting Teacher','Complete')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.adhd_assessments IS 'Base44 ADHDAssessment. Parent/teacher rating-scale ADHD assessment.';
CREATE INDEX idx_adhd_client ON carelink.adhd_assessments (client_id);
CREATE TRIGGER trg_adhd_updated_at BEFORE UPDATE ON carelink.adhd_assessments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- Executive function  (Base44: ExecFunctionAssessment)
CREATE TABLE carelink.exec_function_assessments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    administered_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    administered_date       date,
    age_years               numeric,
    grade                   text,
    domain_scores           jsonb,
    domain_ratings          jsonb,
    identified_weaknesses   text[] NOT NULL DEFAULT '{}',
    identified_strengths    text[] NOT NULL DEFAULT '{}',
    goals                   jsonb,
    strategies              jsonb,
    overall_rating          text CHECK (overall_rating IN
                                ('Within Normal Limits','Mild Concern','Moderate Concern','Significant Concern')),
    notes                   text,
    status                  text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Complete','In Progress')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.exec_function_assessments IS 'Base44 ExecFunctionAssessment.';
CREATE INDEX idx_execfn_client ON carelink.exec_function_assessments (client_id);
CREATE TRIGGER trg_execfn_updated_at BEFORE UPDATE ON carelink.exec_function_assessments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- Sensory profile  (Base44: SensoryProfile)
CREATE TABLE carelink.sensory_profiles (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    administered_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    administered_date       date,
    age_months              numeric,
    responses               jsonb,
    domain_scores           jsonb,                           -- auditory, visual, tactile, vestibular, ...
    domain_patterns         jsonb,                           -- Hyper/Hypo/Typical per domain
    recommendations         text[] NOT NULL DEFAULT '{}',
    strategies              jsonb,
    overall_pattern         text,
    notes                   text,
    status                  text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Complete')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.sensory_profiles IS 'Base44 SensoryProfile.';
CREATE INDEX idx_sensory_client ON carelink.sensory_profiles (client_id);
CREATE TRIGGER trg_sensory_updated_at BEFORE UPDATE ON carelink.sensory_profiles
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- Screening  (Base44: Screening)  — ASQ-3, M-CHAT-R/F, SWYC
CREATE TABLE carelink.screenings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    administered_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    tool                    text NOT NULL CHECK (tool IN ('ASQ-3','M-CHAT-R/F','SWYC','Other')),
    age_months              numeric,
    administered_date       date,
    language                text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    responses               jsonb,
    total_score             numeric,
    domain_scores           jsonb,
    result                  text CHECK (result IN ('Typical','Monitor','Refer','Incomplete')),
    flagged_domains         text[] NOT NULL DEFAULT '{}',
    follow_up_action        text,
    follow_up_date          date,
    notes                   text,
    status                  text NOT NULL DEFAULT 'Complete' CHECK (status IN ('Complete','In Progress','Pending Review')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.screenings IS 'Base44 Screening. Developmental screening instruments.';
CREATE INDEX idx_screenings_client ON carelink.screenings (client_id);
CREATE TRIGGER trg_screenings_updated_at BEFORE UPDATE ON carelink.screenings
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- Diagnostic equity record  (Base44: DiagnosticEquityRecord) — timeline metrics
CREATE TABLE carelink.diagnostic_equity_records (
    id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    referral_date                       date NOT NULL,
    first_concern_date                  date,
    first_screening_date                date,
    evaluation_referral_date            date,
    evaluation_completed_date           date,
    diagnosis_date                      date,
    diagnosis                           text,
    days_referral_to_screening          numeric,
    days_screening_to_eval              numeric,
    days_eval_to_diagnosis              numeric,
    days_total_referral_to_diagnosis    numeric,
    age_at_first_concern_months         numeric,
    age_at_diagnosis_months             numeric,
    language                            text,
    ethnicity                           text,
    race                                text,
    county                              text,
    insurance_type                      text CHECK (insurance_type IN ('Medicaid','Private','CHIP','Uninsured','Other')),
    barriers_identified                 text[] NOT NULL DEFAULT '{}',
    provider_type_diagnosed             text,
    notes                               text,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    updated_at                          timestamptz NOT NULL DEFAULT now(),
    deleted_at                          timestamptz
);
COMMENT ON TABLE carelink.diagnostic_equity_records IS 'Base44 DiagnosticEquityRecord. Diagnosis-timeline + equity metrics per client.';
CREATE INDEX idx_diag_equity_client ON carelink.diagnostic_equity_records (client_id);
CREATE TRIGGER trg_diag_equity_updated_at BEFORE UPDATE ON carelink.diagnostic_equity_records
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- service_plans  (Base44: ServicePlan)  + versions
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.service_plans (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    plan_title      text NOT NULL,
    goals_summary   text,
    goals           jsonb NOT NULL DEFAULT '[]',             -- [{id,description,status,start_date,target_date,...}]
    interventions   jsonb NOT NULL DEFAULT '[]',
    progress_notes  jsonb NOT NULL DEFAULT '[]',
    status          text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Completed','On Hold','Archived')),
    start_date      date,
    end_date        date,
    last_reviewed   date,
    reviewed_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    version_number  integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
COMMENT ON TABLE carelink.service_plans IS 'Base44 ServicePlan. Goals/interventions/progress for a client. Versioned via carelink.service_plan_versions.';
CREATE INDEX idx_service_plans_client ON carelink.service_plans (client_id);
CREATE TRIGGER trg_service_plans_updated_at BEFORE UPDATE ON carelink.service_plans
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

CREATE TABLE carelink.service_plan_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             uuid NOT NULL REFERENCES carelink.service_plans (id) ON DELETE CASCADE,
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    plan_title          text NOT NULL,
    version_number      integer NOT NULL,
    snapshot            jsonb NOT NULL,                      -- full plan data at this version (immutable history)
    changed_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    change_description  text,
    change_timestamp    timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    UNIQUE (plan_id, version_number)
);
COMMENT ON TABLE carelink.service_plan_versions IS 'Base44 ServicePlanVersion. Immutable point-in-time snapshots of a service plan (Base44 RLS: insert-only, admin-read).';
CREATE INDEX idx_plan_versions_plan ON carelink.service_plan_versions (plan_id);
CREATE TRIGGER trg_plan_versions_updated_at BEFORE UPDATE ON carelink.service_plan_versions
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- service_coordination  (Base44: ServiceCoordination)  — external services
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.service_coordination (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    service_name        text NOT NULL,
    service_type        text NOT NULL CHECK (service_type IN
                            ('Speech Therapy','Occupational Therapy','ABA','Physical Therapy','Mental Health',
                             'School Support','Respite Care','Medical','Community','Other')),
    provider_name       text,
    provider_org        text,
    status              text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Pending','On Hold','Discontinued')),
    start_date          date,
    reauthorization_date date,
    frequency           text,
    goals               text,
    notes               text,
    gaps_identified     text[] NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.service_coordination IS 'Base44 ServiceCoordination. External services a client receives + gaps.';
CREATE INDEX idx_service_coord_client ON carelink.service_coordination (client_id);
CREATE TRIGGER trg_service_coord_updated_at BEFORE UPDATE ON carelink.service_coordination
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- outgoing_referrals  (Base44: OutgoingReferral)  — refer client OUT
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.outgoing_referrals (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    referral_type           text NOT NULL DEFAULT 'Specialist'
                            CHECK (referral_type IN ('Evaluator','Therapist','Specialist','School','Community','Other')),
    provider_name           text NOT NULL,
    provider_org            text,
    provider_phone          text,
    provider_email          text,
    reason                  text,
    date_sent               date,
    expected_wait_weeks     numeric,
    expected_contact_date   date,
    status                  text NOT NULL DEFAULT 'Sent'
                            CHECK (status IN ('Sent','Pending Confirmation','Scheduled','In Progress','Completed','Declined','No Response')),
    outcome                 text,
    outcome_date            date,
    notes                   text,
    priority                text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
    consent_obtained        boolean NOT NULL DEFAULT false,
    consent_notes           text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.outgoing_referrals IS 'Base44 OutgoingReferral. Referrals LCAC sends out to external providers for a client.';
CREATE INDEX idx_outgoing_ref_client ON carelink.outgoing_referrals (client_id);
CREATE TRIGGER trg_outgoing_ref_updated_at BEFORE UPDATE ON carelink.outgoing_referrals
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- SAFETY / CRISIS / BEHAVIOR
-- ----------------------------------------------------------------------------

-- behavior_incidents  (Base44: BehaviorIncident)
CREATE TABLE carelink.behavior_incidents (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    incident_date           date NOT NULL,
    incident_time           text,
    location                text,
    duration_minutes        numeric,
    staff_present           text,
    antecedent_setting      text,
    antecedent_triggers     text[] NOT NULL DEFAULT '{}',
    behavior_description    text,
    behavior_topography     text[] NOT NULL DEFAULT '{}',
    intensity               text CHECK (intensity IN ('Mild','Moderate','Severe')),
    consequence             text,
    consequence_type        text[] NOT NULL DEFAULT '{}',
    function_hypothesis     text CHECK (function_hypothesis IN
                                ('Attention','Escape/Avoidance','Sensory/Automatic','Tangible/Access','Communication','Unknown')),
    function_confidence     text CHECK (function_confidence IN ('Low','Moderate','High')),
    intervention_used       text,
    intervention_outcome    text CHECK (intervention_outcome IN ('Effective','Partially Effective','Ineffective')),
    injury_occurred         boolean NOT NULL DEFAULT false,
    injury_details          text,
    property_damage         boolean NOT NULL DEFAULT false,
    restraint_used          boolean NOT NULL DEFAULT false,
    parent_notified         boolean NOT NULL DEFAULT false,
    parent_notified_date    text,
    notes                   text,
    status                  text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Complete','Reviewed')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.behavior_incidents IS 'Base44 BehaviorIncident. ABC behavior incident log; parent of crisis_debriefs.';
CREATE INDEX idx_behavior_incidents_client ON carelink.behavior_incidents (client_id);
CREATE TRIGGER trg_behavior_incidents_updated_at BEFORE UPDATE ON carelink.behavior_incidents
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- crisis_debriefs  (Base44: CrisisDebrief)  — links a behavior incident
CREATE TABLE carelink.crisis_debriefs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    incident_id             uuid REFERENCES carelink.behavior_incidents (id) ON DELETE SET NULL,
    debrief_date            date NOT NULL,
    debrief_facilitator     text,
    staff_present           text[] NOT NULL DEFAULT '{}',
    what_happened           text,
    what_worked             text,
    what_could_improve      text,
    staff_reflections       jsonb,                           -- [{staff_name,reflection,stress_level}]
    contributing_factors    text[] NOT NULL DEFAULT '{}',
    plan_adjustments        text,
    family_communication    text,
    family_response         text,
    commitments_to_family   jsonb,                           -- [{commitment,owner,due_date,completed}]
    follow_up_actions       text[] NOT NULL DEFAULT '{}',
    staff_support_needed    boolean NOT NULL DEFAULT false,
    staff_support_notes     text,
    status                  text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Complete','Follow-Up Required')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.crisis_debriefs IS 'Base44 CrisisDebrief. Post-incident debrief tied to a behavior_incident.';
CREATE INDEX idx_crisis_debriefs_client   ON carelink.crisis_debriefs (client_id);
CREATE INDEX idx_crisis_debriefs_incident ON carelink.crisis_debriefs (incident_id);
CREATE TRIGGER trg_crisis_debriefs_updated_at BEFORE UPDATE ON carelink.crisis_debriefs
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- de_escalation_plans  (Base44: DeEscalationPlan)
CREATE TABLE carelink.de_escalation_plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    last_reviewed               date,
    sensory_triggers            text[] NOT NULL DEFAULT '{}',
    communication_preferences   text[] NOT NULL DEFAULT '{}',
    early_warning_signs         text[] NOT NULL DEFAULT '{}',
    escalation_signals          text[] NOT NULL DEFAULT '{}',
    effective_strategies        text[] NOT NULL DEFAULT '{}',
    ineffective_strategies      text[] NOT NULL DEFAULT '{}',
    preferred_calming_items     text[] NOT NULL DEFAULT '{}',
    preferred_spaces            text,
    avoid_during_crisis         text,
    language_to_use             text,
    language_to_avoid           text,
    staff_notes                 text,
    status                      text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Archived')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.de_escalation_plans IS 'Base44 DeEscalationPlan. Client-specific de-escalation guidance.';
CREATE INDEX idx_deescalation_client ON carelink.de_escalation_plans (client_id);
CREATE TRIGGER trg_deescalation_updated_at BEFORE UPDATE ON carelink.de_escalation_plans
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- safety_plans  (Base44: SafetyPlan)
CREATE TABLE carelink.safety_plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    last_reviewed               date,
    warning_signs               text[] NOT NULL DEFAULT '{}',
    internal_coping             text[] NOT NULL DEFAULT '{}',
    social_distractions         text[] NOT NULL DEFAULT '{}',
    support_contacts            jsonb,
    professional_contacts       jsonb,
    crisis_lines                jsonb,
    environmental_safety_steps  text[] NOT NULL DEFAULT '{}',
    reasons_for_living          text[] NOT NULL DEFAULT '{}',
    safe_environment_confirmed  boolean NOT NULL DEFAULT false,
    caregiver_involved          boolean NOT NULL DEFAULT true,
    caregiver_name              text,
    signature                   text,
    signature_date              text,
    notes                       text,
    status                      text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Expired','Revised')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.safety_plans IS 'Base44 SafetyPlan. Stanley-Brown-style safety plan. Highly sensitive PHI.';
CREATE INDEX idx_safety_plans_client ON carelink.safety_plans (client_id);
CREATE TRIGGER trg_safety_plans_updated_at BEFORE UPDATE ON carelink.safety_plans
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- consent_forms  (Base44: ConsentForm)  — staff-side ROI/consent
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.consent_forms (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    recipient_name          text NOT NULL,
    recipient_organization  text,
    recipient_phone         text,
    recipient_email         text,
    purpose                 text,
    information_to_release  text[] NOT NULL DEFAULT '{}',
    authorized_by           text NOT NULL,
    relationship            text,
    signature               text,
    signature_date          text,
    effective_date          date,
    expiration_date         date,
    status                  text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Expired','Revoked','Pending')),
    revocation_date         text,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.consent_forms IS 'Base44 ConsentForm. Release-of-information / consent authored staff-side. (Family-facing equivalent: carelink.portal_consents.)';
CREATE INDEX idx_consent_forms_client ON carelink.consent_forms (client_id);
CREATE TRIGGER trg_consent_forms_updated_at BEFORE UPDATE ON carelink.consent_forms
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- CULTURAL RECORDS
-- ----------------------------------------------------------------------------

-- cultural_identity  (Base44: CulturalIdentity)
CREATE TABLE carelink.cultural_identity (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    tribal_affiliations         text[] NOT NULL DEFAULT '{}',
    tribal_enrollment_status    text CHECK (tribal_enrollment_status IN
                                    ('Enrolled Member','Descendant','Affiliated','Prefer Not to Say','Not Applicable')),
    tribal_enrollment_number    text,                        -- sensitive; app/RLS may further restrict to admin
    heritage_nations            text[] NOT NULL DEFAULT '{}',
    languages_spoken_at_home    text[] NOT NULL DEFAULT '{}',
    indigenous_language         text,
    spiritual_practices         text CHECK (spiritual_practices IN
                                    ('Traditional','Christian','Blend of Both','Other','Prefer Not to Share')),
    clan_society                text,
    cultural_identity_notes     text,
    family_cultural_values      text[] NOT NULL DEFAULT '{}',
    two_spirit_identity         boolean NOT NULL DEFAULT false,
    access_level                text NOT NULL DEFAULT 'Coordinator Only'
                                CHECK (access_level IN ('Coordinator Only','Full Care Team','Admin Only')),
    data_sharing_consent        boolean NOT NULL DEFAULT false,
    data_sharing_consent_date   text,
    completed_by                text,
    completed_date              date,
    last_reviewed               date,
    review_notes                text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.cultural_identity IS 'Base44 CulturalIdentity. Family cultural/tribal identity; access_level + DataSovereigntyConfig add restrictions beyond care-team RLS (see README).';
CREATE INDEX idx_cultural_identity_client ON carelink.cultural_identity (client_id);
CREATE TRIGGER trg_cultural_identity_updated_at BEFORE UPDATE ON carelink.cultural_identity
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- cultural_practices  (Base44: CulturalPractice)
CREATE TABLE carelink.cultural_practices (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    practice_name               text NOT NULL,
    practice_type               text NOT NULL CHECK (practice_type IN
                                    ('Ceremony','Seasonal Gathering','Food Tradition','Language Practice',
                                     'Prayer / Spiritual Ritual','Traditional Healing','Storytelling','Arts / Crafts',
                                     'Song / Dance','Land-based Activity','Family Gathering','Other')),
    description                 text,
    frequency                   text CHECK (frequency IN ('Daily','Weekly','Monthly','Seasonally','Annually','As Needed','Varies')),
    season_or_timing            text,
    care_plan_integration       text,
    scheduling_considerations   text,
    staff_guidance              text,
    things_to_avoid             text,
    community_involved          boolean NOT NULL DEFAULT false,
    elder_or_healer_involved    boolean NOT NULL DEFAULT false,
    contact_for_coordination    text,
    priority                    text NOT NULL DEFAULT 'Important' CHECK (priority IN ('Core Identity','Important','Nice to Honor')),
    included_in_care_plan       boolean NOT NULL DEFAULT false,
    access_level                text NOT NULL DEFAULT 'Full Care Team'
                                CHECK (access_level IN ('Coordinator Only','Full Care Team','Admin Only')),
    documented_by               text,
    documented_date             date,
    status                      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Seasonal')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.cultural_practices IS 'Base44 CulturalPractice. Family cultural practices to honor in care.';
CREATE INDEX idx_cultural_practices_client ON carelink.cultural_practices (client_id);
CREATE TRIGGER trg_cultural_practices_updated_at BEFORE UPDATE ON carelink.cultural_practices
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- EDUCATION / ADVOCACY (IEP, IEE, PWN, transition, discharge)
-- ----------------------------------------------------------------------------

-- iep_meetings  (Base44: IEPMeeting)
CREATE TABLE carelink.iep_meetings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    meeting_date        date,
    meeting_type        text CHECK (meeting_type IN ('Annual','Triennial','Initial','Revision','Transition','Other')),
    school              text,
    district            text,
    attendees           text[] NOT NULL DEFAULT '{}',
    parent_concerns     text,
    current_goals       text[] NOT NULL DEFAULT '{}',
    assessment_scores   jsonb,
    progress_notes      text,
    coordinator_notes   text,
    proposed_services   text[] NOT NULL DEFAULT '{}',
    packet_generated    boolean NOT NULL DEFAULT false,
    status              text NOT NULL DEFAULT 'Upcoming'
                        CHECK (status IN ('Upcoming','Packet Ready','Meeting Complete','Follow-up Needed')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.iep_meetings IS 'Base44 IEPMeeting. IEP/504 meeting prep + notes (educational records — FERPA).';
CREATE INDEX idx_iep_meetings_client ON carelink.iep_meetings (client_id);
CREATE TRIGGER trg_iep_meetings_updated_at BEFORE UPDATE ON carelink.iep_meetings
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- iee_requests  (Base44: IEERequest)
CREATE TABLE carelink.iee_requests (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id           uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    district                    text,
    request_date                date,
    evaluation_area             text CHECK (evaluation_area IN
                                    ('Psychoeducational','Speech-Language','Occupational Therapy','Physical Therapy',
                                     'Functional Behavioral','Assistive Technology','Other')),
    reason_for_request          text,
    letter_sent_date            text,
    district_response           text CHECK (district_response IN
                                    ('Pending','Agreed - At Public Expense','Denied - Will Conduct Own','Partial Agreement','No Response')),
    district_response_date      text,
    evaluator_selected          text,
    evaluation_completed_date   text,
    outcome                     text,
    notes                       text,
    status                      text NOT NULL DEFAULT 'Draft'
                                CHECK (status IN ('Draft','Letter Sent','Awaiting Response','Evaluation Scheduled','Complete','Disputed')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.iee_requests IS 'Base44 IEERequest. Independent Educational Evaluation requests to a district.';
CREATE INDEX idx_iee_requests_client ON carelink.iee_requests (client_id);
CREATE TRIGGER trg_iee_requests_updated_at BEFORE UPDATE ON carelink.iee_requests
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- pwn_logs  (Base44: PWNLog)  — Prior Written Notice tracking
CREATE TABLE carelink.pwn_logs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    district                text,
    pwn_date                date,
    pwn_type                text CHECK (pwn_type IN
                                ('Evaluation Proposed','Evaluation Refused','Placement Change','Service Change',
                                 'Eligibility Determination','Other')),
    description             text,
    response_deadline       date,
    parent_response         text,
    parent_response_date    text,
    follow_up_actions       text[] NOT NULL DEFAULT '{}',
    status                  text NOT NULL DEFAULT 'Received'
                            CHECK (status IN ('Received','Response Pending','Responded','Disputed','Resolved')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.pwn_logs IS 'Base44 PWNLog. Prior Written Notice (special-ed) tracking.';
CREATE INDEX idx_pwn_logs_client ON carelink.pwn_logs (client_id);
CREATE TRIGGER trg_pwn_logs_updated_at BEFORE UPDATE ON carelink.pwn_logs
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- transition_plans  (Base44: TransitionPlan)
CREATE TABLE carelink.transition_plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id           uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    current_age                 numeric,
    transition_age_target       numeric,
    self_advocacy_goals         text[] NOT NULL DEFAULT '{}',
    vocational_goals            text[] NOT NULL DEFAULT '{}',
    adult_services_identified   text[] NOT NULL DEFAULT '{}',
    dda_referral_status         text CHECK (dda_referral_status IN ('Not Started','In Progress','Submitted','Approved','Denied')),
    iep_transition_section      boolean NOT NULL DEFAULT false,
    guardianship_discussion     boolean NOT NULL DEFAULT false,
    housing_planning            text,
    employment_interest         text,
    strengths                   text,
    barriers                    text,
    next_review_date            date,
    status                      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','On Hold','Complete')),
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.transition_plans IS 'Base44 TransitionPlan. Transition-to-adulthood planning.';
CREATE INDEX idx_transition_plans_client ON carelink.transition_plans (client_id);
CREATE TRIGGER trg_transition_plans_updated_at BEFORE UPDATE ON carelink.transition_plans
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- discharge_plans  (Base44: DischargePlan)
CREATE TABLE carelink.discharge_plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_staff_id           uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    discharge_date              date,
    discharge_reason            text CHECK (discharge_reason IN
                                    ('Goals Met','Family Request','Moved','Aged Out','Declined Services','Other')),
    steps_completed             text[] NOT NULL DEFAULT '{}',
    summary_letter_generated    boolean NOT NULL DEFAULT false,
    summary_letter_date         text,
    summary_notes               text,
    family_feedback_sent        boolean NOT NULL DEFAULT false,
    family_feedback_received    boolean NOT NULL DEFAULT false,
    family_feedback_rating      numeric,
    family_feedback_comments    text,
    status                      text NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress','Complete')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.discharge_plans IS 'Base44 DischargePlan. Case closure plan + family feedback.';
CREATE INDEX idx_discharge_plans_client ON carelink.discharge_plans (client_id);
CREATE TRIGGER trg_discharge_plans_updated_at BEFORE UPDATE ON carelink.discharge_plans
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- WRAPAROUND / TEAM MEETINGS / CONSULTATIONS
-- NOTE: Base44 shipped TWO near-identical entities, WrapAroundTeam and
-- WraparoundTeam. We MERGE them into one table (carelink.wraparound_teams),
-- keeping the richer WraparoundTeam shape. Flagged in README.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.wraparound_teams (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    facilitator         text,
    team_members        jsonb,                               -- [{name,role,type,phone,email}]
    natural_supports    jsonb,                               -- from WrapAroundTeam variant
    professional_supports jsonb,                             -- from WrapAroundTeam variant
    family_vision       text,
    team_vision         text,
    family_strengths    text[] NOT NULL DEFAULT '{}',
    family_needs        text[] NOT NULL DEFAULT '{}',
    meeting_notes       jsonb,                               -- [{date,attendees,summary,action_items}]
    shared_action_items jsonb,                               -- [{task,owner,due_date,status}]
    next_meeting_date   date,
    assigned_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Closed','On Hold','Complete')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.wraparound_teams IS 'MERGED from Base44 WrapAroundTeam + WraparoundTeam (duplicate entities). Wraparound team-of-support for a client.';
CREATE INDEX idx_wraparound_client ON carelink.wraparound_teams (client_id);
CREATE TRIGGER trg_wraparound_updated_at BEFORE UPDATE ON carelink.wraparound_teams
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- consultations  (Base44: Consultation)  — case consult panels (client optional)
CREATE TABLE carelink.consultations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    title                   text NOT NULL,
    presenter               text,
    consultation_date       date,
    consultation_type       text NOT NULL CHECK (consultation_type IN
                                ('WA INCLUDE','ECHO','MDT','Peer Consultation','Supervisor Review','Other')),
    panel_members           text[] NOT NULL DEFAULT '{}',
    presenting_concerns     text,
    background_summary      text,
    panel_recommendations   text,
    action_items            text[] NOT NULL DEFAULT '{}',
    follow_up_date          date,
    outcome                 text,
    status                  text NOT NULL DEFAULT 'Scheduled'
                            CHECK (status IN ('Scheduled','Completed','Cancelled','Follow-Up Pending')),
    attachments             jsonb NOT NULL DEFAULT '[]',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.consultations IS 'Base44 Consultation. Case-consultation panels (ECHO, MDT, etc.). client_id optional (some are general).';
CREATE INDEX idx_consultations_client ON carelink.consultations (client_id);
CREATE TRIGGER trg_consultations_updated_at BEFORE UPDATE ON carelink.consultations
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- meeting_transcripts  (Base44: MeetingTranscript)
CREATE TABLE carelink.meeting_transcripts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    meeting_type            text CHECK (meeting_type IN
                                ('IEP Meeting','Multidisciplinary Team','Care Coordination','Family Meeting','Other')),
    meeting_date            date NOT NULL,
    meeting_time            text,
    location                text,
    participants            jsonb,                           -- [{name,role,organization}]
    audio_file_url          text,
    raw_transcript          text,
    redaction_notes         jsonb,
    final_transcript        text,
    key_decisions           text[] NOT NULL DEFAULT '{}',
    consent_status          text NOT NULL DEFAULT 'Pending'
                            CHECK (consent_status IN ('Not Obtained','Pending','Obtained','Declined')),
    consent_obtained_from   text,
    consent_date            date,
    transcribed_by          text,
    transcription_date      date,
    reviewed_by_staff_id    uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reviewed_date           date,
    status                  text NOT NULL DEFAULT 'Recording'
                            CHECK (status IN ('Recording','Transcribing','Awaiting Consent','Under Review','Final','Archived')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.meeting_transcripts IS 'Base44 MeetingTranscript. Recorded/transcribed meetings with redaction workflow + recording consent.';
CREATE INDEX idx_transcripts_client ON carelink.meeting_transcripts (client_id);
CREATE TRIGGER trg_transcripts_updated_at BEFORE UPDATE ON carelink.meeting_transcripts
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- OUTCOMES + GENERATED LETTERS + RESOURCE MATCH + CLIENT WORKFLOW
-- ----------------------------------------------------------------------------

-- outcome_records  (Base44: OutcomeRecord)
CREATE TABLE carelink.outcome_records (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    recorded_by_staff_id    uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    record_date             date NOT NULL,
    period_label            text,
    developmental_domain    text NOT NULL CHECK (developmental_domain IN
                                ('Communication','Adaptive Behavior','Social-Emotional','Motor','Cognitive',
                                 'Academic','Self-Care','Overall')),
    baseline_score          numeric,
    current_score           numeric,
    goal_score              numeric,
    measurement_tool        text,
    school_placement        text CHECK (school_placement IN
                                ('General Ed (Full Inclusion)','General Ed w/ Support','Resource Room','Self-Contained',
                                 'Special Day Class','Non-Public School','Home/Hospital','None/Pre-K','Post-Secondary')),
    school_placement_change boolean NOT NULL DEFAULT false,
    family_wellbeing_score  numeric,
    family_wellbeing_notes  text,
    services_active         text[] NOT NULL DEFAULT '{}',
    service_hours_monthly   numeric,
    primary_diagnosis       text,
    language                text,
    ethnicity               text,
    county                  text,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.outcome_records IS 'Base44 OutcomeRecord. Periodic outcome measurement per developmental domain.';
CREATE INDEX idx_outcome_records_client ON carelink.outcome_records (client_id);
CREATE TRIGGER trg_outcome_records_updated_at BEFORE UPDATE ON carelink.outcome_records
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- generated_letters  (Base44: GeneratedLetter)  — bilingual letters (req #3)
CREATE TABLE carelink.generated_letters (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    generated_by_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    letter_type             text NOT NULL CHECK (letter_type IN
                                ('Referral Letter','Advocacy Letter','School Communication','Insurance Appeal',
                                 'Diagnosis Support Letter','Service Request','IEP Support Letter','Transition Letter')),
    language                text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    recipient_name          text,
    recipient_organization  text,
    letter_body             text,
    merge_fields_used       jsonb,
    generated_date          date,
    sent_date               text,
    status                  text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Ready','Sent','Archived')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.generated_letters IS 'Base44 GeneratedLetter. Letters produced in EN or ES on demand (req #3 bilingual print).';
CREATE INDEX idx_generated_letters_client ON carelink.generated_letters (client_id);
CREATE TRIGGER trg_generated_letters_updated_at BEFORE UPDATE ON carelink.generated_letters
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- resource_matches  (Base44: ResourceMatch)
CREATE TABLE carelink.resource_matches (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    approved_by_staff_id    uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    match_date              date,
    profile_factors         text[] NOT NULL DEFAULT '{}',
    suggested_resources     jsonb NOT NULL DEFAULT '[]',     -- [{resource_id,resource_name,category,match_score,reason,...}]
    coordinator_approval    boolean NOT NULL DEFAULT false,
    approved_date           date,
    shared_with_family      boolean NOT NULL DEFAULT false,
    family_feedback         text,
    status                  text NOT NULL DEFAULT 'Pending Approval'
                            CHECK (status IN ('Pending Approval','Approved','Shared','Archived')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.resource_matches IS 'Base44 ResourceMatch. AI-suggested resources for a client (references resources catalog in 05_ops.sql).';
CREATE INDEX idx_resource_matches_client ON carelink.resource_matches (client_id);
CREATE TRIGGER trg_resource_matches_updated_at BEFORE UPDATE ON carelink.resource_matches
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- client_workflows  (Base44: ClientWorkflow)  — visit lifecycle (large jsonb)
CREATE TABLE carelink.client_workflows (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id          uuid REFERENCES carelink.appointments (id) ON DELETE SET NULL,
    client_id               uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    workflow_status         text NOT NULL DEFAULT 'pre-arrival'
                            CHECK (workflow_status IN
                                ('pre-arrival','arrived','in-session','checking-out','checked-out',
                                 'documentation-pending','closed')),
    visit_type              text CHECK (visit_type IN
                                ('initial-intake','developmental-screening','diagnostic-consultation',
                                 'post-diagnosis-welcome','iep-504-advocacy','crisis-followup','routine-coordination',
                                 'workshop-group','home-visit')),
    phase_data              jsonb,                           -- pre_arrival/arrival/active_session/check_out/post_visit
    visit_note              jsonb,
    service_plan            jsonb,
    feedback                jsonb,
    accessibility_preferences jsonb,
    closure_data            jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.client_workflows IS 'Base44 ClientWorkflow. Per-visit state machine; nested phase data kept as jsonb (deeply nested, app-driven).';
CREATE INDEX idx_client_workflows_client ON carelink.client_workflows (client_id);
CREATE INDEX idx_client_workflows_appt   ON carelink.client_workflows (appointment_id);
CREATE TRIGGER trg_client_workflows_updated_at BEFORE UPDATE ON carelink.client_workflows
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();
