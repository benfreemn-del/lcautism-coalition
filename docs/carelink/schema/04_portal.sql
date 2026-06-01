-- ============================================================================
-- LCAC CareLink — 04_portal.sql
-- Family / client PORTAL: portal users (parents/guardians/youth/advocates),
-- their access grants, invitations, and the family-facing surfaces
-- (appointments, consents, documents, messages, feedback) plus notifications.
--
-- Portal users are NOT staff. They authenticate separately and may only ever
-- see records for the children linked to them. RLS for portal tables keys off
-- carelink.portal_user_child_ids() (the children this portal user is granted),
-- NOT the staff care-team functions. See 99_rls_policies.sql.
-- DESIGN ONLY.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- portal_users  (Base44: PortalUser)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_users (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id                uuid UNIQUE,                 -- FK to auth provider (separate pool from staff)
    household_id                uuid REFERENCES carelink.households (id) ON DELETE SET NULL,
    email                       text NOT NULL UNIQUE,
    full_name                   text NOT NULL,
    preferred_name              text,
    pronouns                    text CHECK (pronouns IN ('he/him','she/her','they/them','custom')),
    custom_pronouns             text,
    profile_photo_url           text,
    role                        text NOT NULL CHECK (role IN
                                    ('primary_parent','secondary_parent','authorized_caregiver','youth',
                                     'advocate','legal_representative')),
    relationship_to_child       text CHECK (relationship_to_child IN
                                    ('parent','grandparent','foster_parent','guardian','advocate','lawyer','self')),
    preferred_language          text NOT NULL DEFAULT 'English' CHECK (preferred_language IN ('English','Spanish')),
    phone                       text,
    status                      text NOT NULL DEFAULT 'pending_registration'
                                CHECK (status IN ('pending_registration','active','suspended','closed')),
    is_verified                 boolean NOT NULL DEFAULT false,
    mfa_enabled                 boolean NOT NULL DEFAULT false,
    mfa_method                  text CHECK (mfa_method IN ('sms','email','authenticator_app')),
    last_login                  timestamptz,
    communication_preferences   jsonb,
    accessibility_settings      jsonb,
    onboarding_completed        boolean NOT NULL DEFAULT false,
    address                     text,
    city                        text,
    state                       text DEFAULT 'WA',
    zip                         text,
    notes                       text,                        -- internal staff notes about this portal user
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE  carelink.portal_users IS 'Base44 PortalUser. Family/guardian/youth portal accounts (separate auth pool from staff). Child links are normalized into carelink.portal_access.';
COMMENT ON COLUMN carelink.portal_users.notes IS 'Internal staff notes — NOT family-visible. RLS hides full row from the portal user except their own profile fields (app projects safe columns).';
CREATE INDEX idx_portal_users_household ON carelink.portal_users (household_id);
CREATE INDEX idx_portal_users_auth      ON carelink.portal_users (auth_user_id);
CREATE TRIGGER trg_portal_users_updated_at BEFORE UPDATE ON carelink.portal_users
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- Deferred FK from 01_core: households.primary_contact_user_id -> portal_users.
ALTER TABLE carelink.households
    ADD CONSTRAINT households_primary_contact_fk
    FOREIGN KEY (primary_contact_user_id) REFERENCES carelink.portal_users (id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- portal_access  (Base44: PortalAccess)  — which child a portal user may see
-- ----------------------------------------------------------------------------
-- Normalizes Base44 PortalUser.children[] into a real grant table, with the
-- permission level + which fields are visible. This is the portal-side
-- equivalent of staff client_assignments and the basis for portal RLS.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_access (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id      uuid NOT NULL REFERENCES carelink.portal_users (id) ON DELETE CASCADE,
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    permission_level    text NOT NULL DEFAULT 'view_only'
                        CHECK (permission_level IN ('view_only','view_and_upload','view_upload_and_message')),
    visible_fields      text[] NOT NULL DEFAULT '{appointments,messages,goals_summary,documents_pending}',
    approved            boolean NOT NULL DEFAULT false,
    approved_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    approved_date       timestamptz,
    status              text NOT NULL DEFAULT 'pending_approval'
                        CHECK (status IN ('pending_approval','active','suspended','revoked')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    UNIQUE (portal_user_id, client_id)
);
COMMENT ON TABLE carelink.portal_access IS 'Base44 PortalAccess. Grant linking a portal user to a child they may view. Coordinator-approved. Drives portal RLS (replaces PortalUser.children[]).';
CREATE INDEX idx_portal_access_user   ON carelink.portal_access (portal_user_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_portal_access_client ON carelink.portal_access (client_id)      WHERE status = 'active' AND deleted_at IS NULL;
CREATE TRIGGER trg_portal_access_updated_at BEFORE UPDATE ON carelink.portal_access
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_invitations  (Base44: PortalInvitation)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_invitations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   text NOT NULL,
    invited_by_staff_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    invited_date            timestamptz,
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    household_id            uuid REFERENCES carelink.households (id) ON DELETE SET NULL,
    role                    text CHECK (role IN
                                ('primary_parent','secondary_parent','authorized_caregiver','youth','advocate','legal_representative')),
    relationship_to_child   text,
    status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
    token                   text UNIQUE,                     -- secure registration-link token
    expires_at              timestamptz,
    message                 text,
    accepted_date           timestamptz,
    portal_user_id          uuid REFERENCES carelink.portal_users (id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.portal_invitations IS 'Base44 PortalInvitation. Tokenized invite to create a portal account for a child. Admin-managed.';
CREATE INDEX idx_portal_invites_token  ON carelink.portal_invitations (token);
CREATE INDEX idx_portal_invites_client ON carelink.portal_invitations (client_id);
CREATE TRIGGER trg_portal_invites_updated_at BEFORE UPDATE ON carelink.portal_invitations
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_appointments  (Base44: PortalAppointment)  — family-facing appt view
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_appointments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id               uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    source_appointment_id   uuid REFERENCES carelink.appointments (id) ON DELETE SET NULL, -- staff-side origin
    title                   text NOT NULL,
    appointment_date        timestamptz NOT NULL,
    end_time                timestamptz,
    type                    text CHECK (type IN
                                ('therapy','evaluation','iep_meeting','504_meeting','school_meeting','medical','visit','other')),
    provider_name           text,
    location                text,
    address                 text,
    is_virtual              boolean NOT NULL DEFAULT false,
    virtual_join_link       text,
    description             text,
    what_to_bring           text[] NOT NULL DEFAULT '{}',
    preparation_notes       text,
    status                  text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled','confirmed','reminder_sent','completed','cancelled','no_show')),
    family_confirmed        boolean NOT NULL DEFAULT false,
    family_confirmed_date   timestamptz,
    reminder_sent           boolean NOT NULL DEFAULT false,
    reminder_preferences    jsonb,
    can_reschedule          boolean NOT NULL DEFAULT true,
    can_cancel              boolean NOT NULL DEFAULT true,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.portal_appointments IS 'Base44 PortalAppointment. Family-friendly appointment surface (links staff-side appointments). Visible to the child''s portal users.';
CREATE INDEX idx_portal_appts_client ON carelink.portal_appointments (client_id);
CREATE TRIGGER trg_portal_appts_updated_at BEFORE UPDATE ON carelink.portal_appointments
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_consents  (Base44: PortalConsent)  — family-facing consent
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_consents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    title               text NOT NULL,
    description         text,
    type                text NOT NULL CHECK (type IN ('roi','treatment','program_participation','media','evaluation','other')),
    sharing_with        jsonb,                               -- [{name,type}]
    sharing_what        text[] NOT NULL DEFAULT '{}',
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked','expired')),
    signed_by           text,
    signed_date         timestamptz,
    start_date          date,
    expiration_date     date,
    can_be_revoked      boolean NOT NULL DEFAULT true,
    revoked_date        timestamptz,
    bilingual_available boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.portal_consents IS 'Base44 PortalConsent. Family-facing consents (family can view + revoke). Distinct from staff-side carelink.consent_forms.';
CREATE INDEX idx_portal_consents_client ON carelink.portal_consents (client_id);
CREATE TRIGGER trg_portal_consents_updated_at BEFORE UPDATE ON carelink.portal_consents
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_documents  (Base44: PortalDocument)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    uploaded_by         text,                                -- staff email OR family; free text (could be staff/portal FK)
    name                text NOT NULL,
    category            text NOT NULL CHECK (category IN
                            ('consent','evaluation','iep','504','school_correspondence','medical','advocacy',
                             'service_summary','assessment_results','other')),
    description         text,
    file_url            text,
    family_visible      boolean NOT NULL DEFAULT true,
    document_type       text CHECK (document_type IN
                            ('consent_form','release','agreement','evaluation','iep','504_plan','medical_record','school_record','other')),
    requires_signature  boolean NOT NULL DEFAULT false,
    signature_status    text NOT NULL DEFAULT 'not_required'
                        CHECK (signature_status IN ('not_required','pending','signed','declined')),
    signed_by           text,
    signed_date         timestamptz,
    signature_data      jsonb,                               -- audit-grade {signature_image_url,signed_timestamp,ip,device}
    expiration_date     date,
    is_expired          boolean NOT NULL DEFAULT false,
    uploaded_date       timestamptz,
    bilingual_available boolean NOT NULL DEFAULT false,
    language            text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish','both')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.portal_documents IS 'Base44 PortalDocument. Documents shared with / uploaded by the family. family_visible gates visibility within the portal.';
CREATE INDEX idx_portal_docs_client ON carelink.portal_documents (client_id);
CREATE TRIGGER trg_portal_docs_updated_at BEFORE UPDATE ON carelink.portal_documents
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_messages  (Base44: PortalMessage)  — family <-> care team messaging
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_messages (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id         uuid NOT NULL,                   -- groups a thread (no separate conversations table; flagged)
    client_id               uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    participants            jsonb,                           -- [{user_id,role,name}]
    sender_id               text NOT NULL,                   -- portal_user id or staff email (heterogeneous; flagged)
    sender_name             text,
    sender_role             text CHECK (sender_role IN ('family','coordinator','provider','team')),
    message_type            text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','templated','system')),
    content                 text NOT NULL,
    attachments             jsonb NOT NULL DEFAULT '[]',
    is_read                 boolean NOT NULL DEFAULT false,
    read_at                 timestamptz,
    language                text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    translation_available   boolean NOT NULL DEFAULT false,
    translated_content      text,
    requires_translation    boolean NOT NULL DEFAULT false,  -- family requested human translation (req #3)
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE  carelink.portal_messages IS 'Base44 PortalMessage. Secure family<->team messages about a child. Bilingual fields support EN/ES + human-translation requests (req #3).';
COMMENT ON COLUMN carelink.portal_messages.conversation_id IS 'Thread id. OPEN QUESTION: model a carelink.portal_conversations parent table for thread metadata + clean FK.';
CREATE INDEX idx_portal_messages_conv   ON carelink.portal_messages (conversation_id, created_at);
CREATE INDEX idx_portal_messages_client ON carelink.portal_messages (client_id);
CREATE TRIGGER trg_portal_messages_updated_at BEFORE UPDATE ON carelink.portal_messages
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- portal_feedback  (Base44: PortalFeedback)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.portal_feedback (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id      uuid REFERENCES carelink.portal_users (id) ON DELETE SET NULL,
    feedback_type       text NOT NULL CHECK (feedback_type IN
                            ('quick_feedback','survey','feature_request','bug_report','general')),
    page_or_feature     text,
    title               text,
    message             text NOT NULL,
    rating              numeric,
    sentiment           text CHECK (sentiment IN ('positive','neutral','negative')),
    is_anonymous        boolean NOT NULL DEFAULT false,
    would_like_followup boolean NOT NULL DEFAULT false,
    contact_email       text,
    status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','in_progress','resolved')),
    language            text NOT NULL DEFAULT 'English' CHECK (language IN ('English','Spanish')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.portal_feedback IS 'Base44 PortalFeedback. Feedback from portal users (creator may insert own; only staff/admin read).';
CREATE INDEX idx_portal_feedback_user ON carelink.portal_feedback (portal_user_id);
CREATE TRIGGER trg_portal_feedback_updated_at BEFORE UPDATE ON carelink.portal_feedback
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- notifications  (Base44: Notification)  — in-app notifications (staff or all)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type            text NOT NULL DEFAULT 'check_in'
                    CHECK (type IN ('check_in','check_out','appointment_status','other')),
    title           text NOT NULL,
    message         text NOT NULL,
    client_id       uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    appointment_id  uuid REFERENCES carelink.appointments (id) ON DELETE SET NULL,
    target_role     text NOT NULL DEFAULT 'all' CHECK (target_role IN ('front_desk','provider','admin','all')),
    is_read         boolean NOT NULL DEFAULT false,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
COMMENT ON TABLE carelink.notifications IS 'Base44 Notification. Staff-facing in-app notifications, role-targeted.';
CREATE INDEX idx_notifications_unread ON carelink.notifications (target_role) WHERE is_read = false AND deleted_at IS NULL;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON carelink.notifications
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- notification_preferences  (Base44: NotificationPreference)  — per client/family
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.notification_preferences (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    email_enabled       boolean NOT NULL DEFAULT true,
    sms_enabled         boolean NOT NULL DEFAULT false,
    portal_enabled      boolean NOT NULL DEFAULT true,
    email_address       text,
    phone_number        text,
    preferred_language  text NOT NULL DEFAULT 'English' CHECK (preferred_language IN ('English','Spanish')),
    notify_appointments boolean NOT NULL DEFAULT true,
    notify_documents    boolean NOT NULL DEFAULT true,
    notify_messages     boolean NOT NULL DEFAULT true,
    notify_screening    boolean NOT NULL DEFAULT true,
    notify_consent      boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.notification_preferences IS 'Base44 NotificationPreference. Per-client notification channels (email/SMS/portal) + language for outbound messages (req #3).';
CREATE UNIQUE INDEX idx_notif_prefs_client ON carelink.notification_preferences (client_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_notif_prefs_updated_at BEFORE UPDATE ON carelink.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();
