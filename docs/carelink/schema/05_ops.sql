-- ============================================================================
-- LCAC CareLink — 05_ops.sql
-- Operations & program support: grants + billing, inventory + kits + suppliers,
-- training & compliance, staff onboarding/policy, tasks, reports, resources,
-- workshops/outreach, quality (logic model, PDSA), supervision, interpreters,
-- data sovereignty config, the translations layer (req #3), and sync state.
--
-- Most of these are operational (NOT direct client PHI), but several carry a
-- client_id and ARE PHI (units_of_service, inventory_transactions to a client,
-- inventory_holds for a client, tasks tied to a client). Those use the
-- can_access_client() predicate; the rest are staff/admin-scoped. See 99_rls.
-- DESIGN ONLY.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRANSLATIONS LAYER (requirement #3)
-- ----------------------------------------------------------------------------
-- Lightweight, generic store for EN<->ES translations of staff-authored
-- free-text records. Polymorphic by (source_table, source_id, field). Lets any
-- record carry an on-demand alternate-language rendering without widening every
-- table. The TranslationReview workflow (below) governs human approval before
-- a machine translation is shown.
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.translations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table    text NOT NULL,                           -- e.g. 'clinical_notes'
    source_id       uuid NOT NULL,                           -- row id in that table
    field           text NOT NULL,                           -- e.g. 'note_body'
    source_language text NOT NULL DEFAULT 'English' CHECK (source_language IN ('English','Spanish')),
    target_language text NOT NULL CHECK (target_language IN ('English','Spanish')),
    translated_text text NOT NULL,
    is_machine      boolean NOT NULL DEFAULT true,           -- machine vs. human translation
    is_approved     boolean NOT NULL DEFAULT false,          -- shown to families only when approved
    review_id       uuid,                                    -- FK -> translation_reviews (added after that table)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    UNIQUE (source_table, source_id, field, target_language)
);
COMMENT ON TABLE carelink.translations IS 'Bilingual layer (req #3). Polymorphic EN/ES translations of free-text fields on any record. Approved human/machine translations power on-demand bilingual output.';
CREATE INDEX idx_translations_source ON carelink.translations (source_table, source_id);
CREATE TRIGGER trg_translations_updated_at BEFORE UPDATE ON carelink.translations
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- translation_reviews  (Base44: TranslationReview)  — human QA of a translation
CREATE TABLE carelink.translation_reviews (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type        text NOT NULL CHECK (content_type IN ('Letter','Message','Portal Content','Notification','Form')),
    original_text       text NOT NULL,
    translated_text     text NOT NULL,                       -- AI-generated
    confidence_score    numeric NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    flagged_for_review  boolean NOT NULL DEFAULT false,
    review_status       text NOT NULL DEFAULT 'Pending' CHECK (review_status IN ('Pending','Under Review','Approved','Rejected')),
    reviewed_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reviewed_date       date,
    final_translation   text,
    review_notes        text,
    published           boolean NOT NULL DEFAULT false,
    published_date      date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.translation_reviews IS 'Base44 TranslationReview. Human review/approval of AI translations before publishing (req #3).';
CREATE TRIGGER trg_translation_reviews_updated_at BEFORE UPDATE ON carelink.translation_reviews
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

ALTER TABLE carelink.translations
    ADD CONSTRAINT translations_review_fk
    FOREIGN KEY (review_id) REFERENCES carelink.translation_reviews (id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- GRANTS + BILLING
-- ----------------------------------------------------------------------------

-- logic_models  (Base44: LogicModel)  — referenced by grants
CREATE TABLE carelink.logic_models (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name          text NOT NULL,
    program_name        text NOT NULL,
    model_version       text,
    inputs              jsonb,
    activities          jsonb,
    outputs             jsonb,
    short_term_outcomes jsonb,
    long_term_outcomes  jsonb,
    assumptions         text[] NOT NULL DEFAULT '{}',
    external_factors    text[] NOT NULL DEFAULT '{}',
    target_population   text,
    theory_of_change    text,
    created_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    last_reviewed_date  date,
    status              text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Approved','Active','Archived')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.logic_models IS 'Base44 LogicModel. Program logic model (inputs->outcomes); grants may require alignment.';
CREATE TRIGGER trg_logic_models_updated_at BEFORE UPDATE ON carelink.logic_models
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- grants  (Base44: Grant)  — NOTE: distinct from the donor-CRM `grants` table
CREATE TABLE carelink.grants (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    logic_model_id          uuid REFERENCES carelink.logic_models (id) ON DELETE SET NULL,
    grant_name              text NOT NULL,
    funder_name             text NOT NULL,
    grant_period_start      date NOT NULL,
    grant_period_end        date NOT NULL,
    total_award_amount      numeric,                         -- dollars
    current_year_budget     numeric,
    program_areas           text[] NOT NULL DEFAULT '{}',
    required_metrics        jsonb,                           -- [{metric_name,metric_type,annual_target,definition}]
    eligible_service_codes  text[] NOT NULL DEFAULT '{}',
    reporting_frequency     text NOT NULL DEFAULT 'Annual' CHECK (reporting_frequency IN ('Quarterly','Semi-Annual','Annual')),
    report_due_dates        jsonb,                           -- [{period,due_date}]
    logic_model_required    boolean NOT NULL DEFAULT false,
    notes                   text,
    status                  text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Completed','Pending','Closed')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.grants IS 'Base44 Grant. Clinical-program grant (metrics, service codes, reporting). Separate from the donor-CRM grants pipeline.';
CREATE INDEX idx_carelink_grants_status ON carelink.grants (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_carelink_grants_updated_at BEFORE UPDATE ON carelink.grants
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- grant_reports  (Base44: GrantReport)
CREATE TABLE carelink.grant_reports (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id                    uuid NOT NULL REFERENCES carelink.grants (id) ON DELETE CASCADE,
    generated_by_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    report_period_start         date NOT NULL,
    report_period_end           date NOT NULL,
    report_type                 text CHECK (report_type IN ('Quarterly','Semi-Annual','Annual')),
    due_date                    date,
    units_of_service_count      numeric,
    total_hours                 numeric,
    metrics_data                jsonb,
    clients_served              integer,
    program_highlights          text,
    challenges_and_adaptations  text,
    narrative_sections          jsonb,
    generated_date              date,
    submitted_date              date,
    status                      text NOT NULL DEFAULT 'Draft'
                                CHECK (status IN ('Draft','Ready for Review','Submitted','Approved','Archived')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.grant_reports IS 'Base44 GrantReport. Periodic funder report rolled up from units of service + metrics.';
CREATE INDEX idx_grant_reports_grant ON carelink.grant_reports (grant_id);
CREATE TRIGGER trg_grant_reports_updated_at BEFORE UPDATE ON carelink.grant_reports
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- units_of_service  (Base44: UnitOfService)  — billable units (PHI: has client)
CREATE TABLE carelink.units_of_service (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES carelink.clients (id) ON DELETE CASCADE,
    grant_id            uuid REFERENCES carelink.grants (id) ON DELETE SET NULL,
    clinical_note_id    uuid REFERENCES carelink.clinical_notes (id) ON DELETE SET NULL,
    coordinator_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    service_date        date NOT NULL,
    service_type        text NOT NULL CHECK (service_type IN
                            ('Service Coordination','Care Conference','Crisis Contact','Transition Planning',
                             'IEP Support','Family Training','Outreach Contact','Discharge Summary','Progress Note','Intake Note')),
    duration_minutes    numeric,
    billing_code        text NOT NULL,                       -- e.g. T1016, H0046
    funding_source      text NOT NULL,
    location            text CHECK (location IN ('Home','Office','School','Community','Telehealth','Phone','Hospital','Other')),
    participants        text[] NOT NULL DEFAULT '{}',
    invoice_batch_id    uuid,                                -- groups into an invoice batch (no batch table yet; flagged)
    invoice_status      text NOT NULL DEFAULT 'Draft' CHECK (invoice_status IN ('Draft','Submitted','Billed','Paid')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.units_of_service IS 'Base44 UnitOfService. Billable service unit tying a client + clinical note + grant + billing code. PHI (carries client_id).';
CREATE INDEX idx_uos_client ON carelink.units_of_service (client_id);
CREATE INDEX idx_uos_grant  ON carelink.units_of_service (grant_id);
CREATE INDEX idx_uos_date   ON carelink.units_of_service (service_date);
CREATE TRIGGER trg_uos_updated_at BEFORE UPDATE ON carelink.units_of_service
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- INVENTORY + KITS + SUPPLIERS
-- ----------------------------------------------------------------------------

-- suppliers  (Base44: Supplier)
CREATE TABLE carelink.suppliers (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    contact_name            text,
    email                   text NOT NULL,
    phone                   text,
    address                 text,
    website                 text,
    product_categories      text[] NOT NULL DEFAULT '{}',
    typical_lead_time_days  numeric,
    minimum_order_amount    numeric,
    minimum_order_quantity  numeric,
    payment_terms           text,
    is_active               boolean NOT NULL DEFAULT true,
    price_history           jsonb,                           -- [{item_id,item_name,price,effective_date,quantity}]
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.suppliers IS 'Base44 Supplier. Vendors for inventory items. Operational, not PHI.';
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON carelink.suppliers
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- inventory_items  (Base44: InventoryItem)  — bilingual catalog (req #3)
CREATE TABLE carelink.inventory_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id             uuid REFERENCES carelink.suppliers (id) ON DELETE SET NULL,
    sku                     text NOT NULL UNIQUE,
    name_en                 text NOT NULL,
    name_es                 text,
    description_en          text,
    description_es          text,
    category                text NOT NULL CHECK (category IN
                                ('Post-Diagnosis Binder','SMART Packet','Entendiendo El Autismo','Sensory & Fidget Tools',
                                 'Weighted & Proprioceptive','Communication Supports','Books & Parent Guides','School Advocacy',
                                 'Sibling Resources','Community Resources','Visual Schedules','AAC Cards','Other')),
    subcategory             text,
    type                    text NOT NULL DEFAULT 'Physical Item'
                            CHECK (type IN ('Physical Item','Kit','Digital Resource','Printed Material')),
    supplier_contact        text,
    unit_cost               numeric,
    funding_source          text,
    stock_on_hand           numeric NOT NULL DEFAULT 0,
    reorder_threshold       numeric NOT NULL DEFAULT 10,
    reorder_quantity        numeric NOT NULL DEFAULT 25,
    storage_location        text NOT NULL DEFAULT 'Spectrum Center'
                            CHECK (storage_location IN ('Spectrum Center','Mobile Outreach Kit','Partner Site','Off-site Storage','Other')),
    storage_location_detail text,
    language_version        text NOT NULL DEFAULT 'Non-language specific'
                            CHECK (language_version IN ('English','Spanish','Bilingual','Non-language specific')),
    cultural_relevance      text[] NOT NULL DEFAULT '{}',    -- {Latino,Indigenous,Taíno,General,Other}
    age_range               text,
    purpose                 text,
    how_to_use              text,
    photo_url               text,
    resource_id             uuid,                            -- FK -> resources (added after that table)
    status                  text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Retired','Out of Stock','Discontinued')),
    is_kit_component        boolean NOT NULL DEFAULT false,
    lead_time_days          numeric,
    minimum_order_quantity  numeric NOT NULL DEFAULT 1,
    last_reorder_date       date,
    last_distributed_date   date,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.inventory_items IS 'Base44 InventoryItem. Bilingual resource/material catalog with stock levels (name_en/name_es support req #3).';
CREATE INDEX idx_inventory_category ON carelink.inventory_items (category);
CREATE INDEX idx_inventory_low_stock ON carelink.inventory_items (sku) WHERE status = 'Active';
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON carelink.inventory_items
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- kit_templates  (Base44: KitTemplate)
CREATE TABLE carelink.kit_templates (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_staff_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    name                    text NOT NULL,
    name_es                 text,
    description             text,
    description_es          text,
    category                text NOT NULL CHECK (category IN
                                ('Post-Diagnosis Welcome','SMART Team','Entendiendo El Autismo','Sensory Starter',
                                 'School Advocacy','Workshop Materials','Community Outreach','Sibling Support',
                                 'Crisis & Stabilization','Transition to Adulthood','Healthcare Partner','Custom')),
    version                 text DEFAULT '1.0',
    is_active               boolean NOT NULL DEFAULT true,
    contents                jsonb NOT NULL DEFAULT '[]',     -- [{item_id,quantity,is_required,allow_substitution,...}]
    target_age_range        text,
    target_diagnosis        text[] NOT NULL DEFAULT '{}',
    language_preference     text DEFAULT 'Auto-detect' CHECK (language_preference IN ('English','Spanish','Bilingual','Auto-detect')),
    estimated_cost          numeric,
    assembly_time_minutes   numeric,
    handoff_script_en       text,
    handoff_script_es       text,
    checklist_en            text,
    checklist_es            text,
    change_history          jsonb,
    auto_suggest_triggers   text[] NOT NULL DEFAULT '{}',
    funding_source          text,
    is_standalone           boolean NOT NULL DEFAULT true,
    compatible_with_kits    text[] NOT NULL DEFAULT '{}',
    requires_ot_review      boolean NOT NULL DEFAULT false,
    cultural_relevance      text[] NOT NULL DEFAULT '{}',
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.kit_templates IS 'Base44 KitTemplate. Reusable kit recipe (bill of materials in jsonb contents, bilingual scripts).';
CREATE TRIGGER trg_kit_templates_updated_at BEFORE UPDATE ON carelink.kit_templates
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- kit_assemblies  (Base44: KitAssembly)  — an assembled kit (may be for a client)
CREATE TABLE carelink.kit_assemblies (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_template_id             uuid REFERENCES carelink.kit_templates (id) ON DELETE SET NULL,
    reserved_for_client_id      uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    assembled_by_staff_id       uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    custom_kit_name             text,
    unique_kit_id               text NOT NULL UNIQUE,        -- e.g. KIT-2026-0001
    status                      text NOT NULL DEFAULT 'Assembling'
                                CHECK (status IN ('Assembling','Ready for Distribution','Reserved','Distributed','Cancelled')),
    assembled_date              timestamptz,
    contents                    jsonb NOT NULL DEFAULT '[]', -- actual items in this kit
    total_cost                  numeric,
    funding_source              text,
    storage_location            text,
    reserved_by_staff_id        uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    reserved_date               timestamptz,
    hold_expiration_date        date,
    distributed_date            timestamptz,
    distributed_to              text,
    distributed_by_staff_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    distribution_location       text,
    language                    text CHECK (language IN ('English','Spanish')),
    family_acknowledgement      boolean NOT NULL DEFAULT false,
    signature_url               text,
    photo_url                   text,
    checklist_reviewed          boolean NOT NULL DEFAULT false,
    handoff_script_used         boolean NOT NULL DEFAULT false,
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.kit_assemblies IS 'Base44 KitAssembly. A physically assembled kit; reserved_for_client_id makes it PHI when tied to a client.';
CREATE INDEX idx_kit_assemblies_client ON carelink.kit_assemblies (reserved_for_client_id);
CREATE INDEX idx_kit_assemblies_status ON carelink.kit_assemblies (status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_kit_assemblies_updated_at BEFORE UPDATE ON carelink.kit_assemblies
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- inventory_holds  (Base44: InventoryHold)
CREATE TABLE carelink.inventory_holds (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id             uuid NOT NULL REFERENCES carelink.inventory_items (id) ON DELETE CASCADE,
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    kit_assembly_id     uuid REFERENCES carelink.kit_assemblies (id) ON DELETE SET NULL,
    quantity            numeric NOT NULL,
    hold_type           text NOT NULL CHECK (hold_type IN
                            ('Client Reservation','Kit Assembly','Event Preparation','Workshop Preparation')),
    status              text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Fulfilled','Expired','Cancelled')),
    created_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    expiration_date     date,
    fulfilled_date      timestamptz,
    fulfilled_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.inventory_holds IS 'Base44 InventoryHold. Reserves stock for a client/kit/event. PHI when client_id set.';
CREATE INDEX idx_inventory_holds_item   ON carelink.inventory_holds (item_id);
CREATE INDEX idx_inventory_holds_client ON carelink.inventory_holds (client_id);
CREATE TRIGGER trg_inventory_holds_updated_at BEFORE UPDATE ON carelink.inventory_holds
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- inventory_transactions  (Base44: InventoryTransaction)
CREATE TABLE carelink.inventory_transactions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id                 uuid NOT NULL REFERENCES carelink.inventory_items (id) ON DELETE CASCADE,
    client_id               uuid REFERENCES carelink.clients (id) ON DELETE SET NULL,
    kit_assembly_id         uuid REFERENCES carelink.kit_assemblies (id) ON DELETE SET NULL,
    hold_id                 uuid REFERENCES carelink.inventory_holds (id) ON DELETE SET NULL,
    performed_by_staff_id   uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    transaction_type        text NOT NULL CHECK (transaction_type IN
                                ('Receipt','Distribution','Adjustment','Kit Assembly','Kit Disassembly','Return',
                                 'Transfer','Damaged','Donation Received','Donation Given','Lost')),
    quantity                numeric NOT NULL,                -- +in / -out
    quantity_before         numeric,
    quantity_after          numeric,
    transaction_date        timestamptz NOT NULL,
    reason                  text,
    reason_category         text CHECK (reason_category IN
                                ('Standard Distribution','Workshop Distribution','Community Event','Damaged','Expired',
                                 'Donation','Lost','Found','Count Correction','Transfer','Other')),
    funding_source          text,
    supplier_name           text,
    purchase_order_number   text,
    unit_cost               numeric,
    total_cost              numeric,
    storage_location        text,
    storage_location_from   text,
    storage_location_to     text,
    supervisor_approval     boolean NOT NULL DEFAULT false,
    supervisor_approved_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    supervisor_approved_date timestamptz,
    signature_url           text,
    photo_url               text,
    family_acknowledgement  boolean NOT NULL DEFAULT false,
    language                text CHECK (language IN ('English','Spanish')),
    handoff_script_used     boolean NOT NULL DEFAULT false,
    items_reviewed          boolean NOT NULL DEFAULT false,
    substitutions           jsonb,
    expiration_date         date,
    batch_number            text,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.inventory_transactions IS 'Base44 InventoryTransaction. Stock movement ledger. PHI when client_id set (distribution to a family).';
CREATE INDEX idx_inv_txn_item   ON carelink.inventory_transactions (item_id, transaction_date);
CREATE INDEX idx_inv_txn_client ON carelink.inventory_transactions (client_id);
CREATE TRIGGER trg_inv_txn_updated_at BEFORE UPDATE ON carelink.inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- RESOURCES CATALOG  (Base44: Resource)  — referenced by inventory + matches
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.resources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title_en        text NOT NULL,
    title_es        text,
    description_en  text,
    description_es  text,
    category        text NOT NULL CHECK (category IN
                        ('Autism','ADHD','IEP/504','Family Support','Crisis','Screening','Community','Legal','Other')),
    type            text NOT NULL CHECK (type IN ('Guide','Workshop','Toolkit','Video','Website','Form','Hotline','Other')),
    languages       text[] NOT NULL DEFAULT '{}',
    source          text,
    url             text,
    featured        boolean NOT NULL DEFAULT false,
    tags            jsonb,                                   -- [{tag_type,value}]
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
COMMENT ON TABLE carelink.resources IS 'Base44 Resource. Bilingual resource library catalog. Reference data, not PHI.';
CREATE INDEX idx_resources_category ON carelink.resources (category);
CREATE TRIGGER trg_resources_updated_at BEFORE UPDATE ON carelink.resources
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- deferred FK: inventory_items.resource_id -> resources
ALTER TABLE carelink.inventory_items
    ADD CONSTRAINT inventory_items_resource_fk
    FOREIGN KEY (resource_id) REFERENCES carelink.resources (id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- TASKS  (Base44: Task)  — may relate to a client (PHI) or be admin
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.tasks (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid REFERENCES carelink.clients (id) ON DELETE CASCADE,
    assigned_to_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    title               text NOT NULL,
    description         text,
    status              text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Complete','Cancelled')),
    priority            text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
    due_date            date,
    program             text,
    category            text NOT NULL DEFAULT 'Other'
                        CHECK (category IN ('Follow-up','Documentation','Coordination','Outreach','Admin','Other')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.tasks IS 'Base44 Task. To-do items. PHI when client_id set; otherwise staff/admin operational. RLS: assignee, admin, or care-team for the client.';
CREATE INDEX idx_tasks_assignee ON carelink.tasks (assigned_to_staff_id) WHERE status <> 'Complete' AND deleted_at IS NULL;
CREATE INDEX idx_tasks_client   ON carelink.tasks (client_id);
CREATE INDEX idx_tasks_due      ON carelink.tasks (due_date) WHERE status <> 'Complete';
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON carelink.tasks
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- REPORTS  (Base44: Report)  — saved report definitions (not PHI itself)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.reports (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    name        text NOT NULL,
    description text,
    entity      text NOT NULL CHECK (entity IN
                    ('Client','Referral','Task','Submission','Screening','Consultation','ConsentForm')),
    filters     jsonb,
    columns     text[] NOT NULL DEFAULT '{}',
    sort_by     text,
    sort_dir    text DEFAULT 'desc' CHECK (sort_dir IN ('asc','desc')),
    chart_type  text DEFAULT 'none' CHECK (chart_type IN ('none','bar','pie','line')),
    chart_field text,
    is_pinned   boolean NOT NULL DEFAULT false,
    last_run    timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);
COMMENT ON TABLE carelink.reports IS 'Base44 Report. Saved report builder definitions (the report RUN obeys the underlying table''s RLS).';
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON carelink.reports
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- WORKSHOPS + OUTREACH  (program/community; not individual PHI)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.workshops (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title               text NOT NULL,
    title_es            text,
    workshop_type       text NOT NULL CHECK (workshop_type IN
                            ('Entendiendo El Autismo','ADHD Info','IEP Rights','Sensory Strategies','Crisis Support','Community Awareness','Other')),
    date                date,
    time                text,
    location            text,
    language            text DEFAULT 'Spanish' CHECK (language IN ('Spanish','English','Bilingual')),
    facilitator         text,
    max_capacity        integer,
    registrations       jsonb,
    attendees_count     integer,
    materials_distributed text[] NOT NULL DEFAULT '{}',
    survey_responses    jsonb,
    avg_satisfaction    numeric,
    notes               text,
    status              text NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned','Registration Open','Complete','Cancelled')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.workshops IS 'Base44 Workshop. Group education sessions; registrations may include names (treat as sensitive).';
CREATE TRIGGER trg_workshops_updated_at BEFORE UPDATE ON carelink.workshops
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

CREATE TABLE carelink.outreach_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type              text CHECK (event_type IN
                                ('Presentation','Health Fair','School Visit','Faith Community','Partner Meeting','Media','Other')),
    title                   text NOT NULL,
    date                    date,
    organization            text,
    location                text,
    languages_served        text[] NOT NULL DEFAULT '{}',
    staff_presenter         text,
    audience_count          integer,
    topics_covered          text[] NOT NULL DEFAULT '{}',
    materials_distributed   text[] NOT NULL DEFAULT '{}',
    referrals_generated     integer NOT NULL DEFAULT 0,
    follow_up_contacts      integer NOT NULL DEFAULT 0,
    engagement_outcome      text,
    grant_program           text,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.outreach_events IS 'Base44 OutreachEvent. Community outreach activity log (aggregate, not PHI).';
CREATE TRIGGER trg_outreach_events_updated_at BEFORE UPDATE ON carelink.outreach_events
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- QUALITY IMPROVEMENT  (PDSA)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.pdsa_projects (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name        text NOT NULL,
    description         text,
    team_lead           text NOT NULL,
    team_members        text[] NOT NULL DEFAULT '{}',
    start_date          date NOT NULL,
    cycle_number        integer NOT NULL DEFAULT 1,
    plan_statement      text,
    plan_hypothesis     text,
    do_actions          text[] NOT NULL DEFAULT '{}',
    do_date_range       jsonb,
    measurement_method  text,
    baseline_metric     numeric,
    current_metric      numeric,
    metric_unit         text,
    study_findings      text,
    study_data          jsonb,
    adaptations         text,
    lessons_learned     text[] NOT NULL DEFAULT '{}',
    next_cycle_plan     text,
    impact_summary      text,
    status              text NOT NULL DEFAULT 'Planning'
                        CHECK (status IN ('Planning','In Progress','Study Phase','Completed','On Hold')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.pdsa_projects IS 'Base44 PDSAProject. Plan-Do-Study-Act quality improvement projects.';
CREATE TRIGGER trg_pdsa_updated_at BEFORE UPDATE ON carelink.pdsa_projects
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- STAFF DEVELOPMENT, ONBOARDING, COMPLIANCE, POLICIES
-- ----------------------------------------------------------------------------

-- supervision_meetings  (Base44: SupervisionMeeting)
CREATE TABLE carelink.supervision_meetings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    supervisee_staff_id uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    supervisor_name     text NOT NULL,
    supervisee_name     text NOT NULL,
    meeting_date        date NOT NULL,
    duration_minutes    numeric,
    meeting_type        text NOT NULL DEFAULT 'Individual Supervision'
                        CHECK (meeting_type IN ('Individual Supervision','Group Supervision','Case Consultation','Professional Development','Performance Review')),
    topics_covered      text[] NOT NULL DEFAULT '{}',
    case_presentations  text[] NOT NULL DEFAULT '{}',
    pd_goals            jsonb,
    supervision_notes   text,
    consultation_summary text,
    action_items        jsonb,
    status              text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Scheduled','Completed','Rescheduled','Cancelled')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.supervision_meetings IS 'Base44 SupervisionMeeting. Clinical supervision sessions. Visible to admin + the supervisor/supervisee.';
CREATE INDEX idx_supervision_supervisee ON carelink.supervision_meetings (supervisee_staff_id);
CREATE TRIGGER trg_supervision_updated_at BEFORE UPDATE ON carelink.supervision_meetings
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- training_courses  (Base44: TrainingCourse)  — catalog
CREATE TABLE carelink.training_courses (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title                       text NOT NULL,
    category                    text NOT NULL CHECK (category IN
                                    ('HIPAA Training','FERPA Training','CPR/First Aid','BCBA Certification','Clinical Skills',
                                     'Culturally Responsive Practice','Safety Protocols','Other')),
    description                 text,
    provider                    text,
    required_for_roles          text[] NOT NULL DEFAULT '{}',
    renewal_frequency_months    integer,
    compliance_tracked          boolean NOT NULL DEFAULT true,
    status                      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Archived')),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    deleted_at                  timestamptz
);
COMMENT ON TABLE carelink.training_courses IS 'Base44 TrainingCourse. Training catalog. Staff-readable reference data.';
CREATE TRIGGER trg_training_courses_updated_at BEFORE UPDATE ON carelink.training_courses
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- training_records  (Base44: TrainingRecord)  — per-staff completion
CREATE TABLE carelink.training_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE CASCADE,
    training_course_id  uuid REFERENCES carelink.training_courses (id) ON DELETE SET NULL,
    training_type       text CHECK (training_type IN
                            ('Certification','Continuing Education','Culturally Responsive Practice','Internal Workshop','Mandatory Training','Other')),
    title               text NOT NULL,
    provider            text,
    completion_date     date NOT NULL,
    expiration_date     date,
    hours_earned        numeric,
    certificate_url     text,
    status              text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed','In Progress','Expired','Renewal Due')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.training_records IS 'Base44 TrainingRecord. A staff member''s completion of a training. Visible to admin + the staff member themself.';
CREATE INDEX idx_training_records_staff ON carelink.training_records (staff_member_id);
CREATE TRIGGER trg_training_records_updated_at BEFORE UPDATE ON carelink.training_records
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- compliance_links  (Base44: ComplianceLink)  — doc <-> training mapping
CREATE TABLE carelink.compliance_links (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid NOT NULL REFERENCES carelink.staff_members (id) ON DELETE CASCADE,
    training_course_id  uuid REFERENCES carelink.training_courses (id) ON DELETE SET NULL,
    document_id         text NOT NULL,                       -- references a doc inside staff_members.documents jsonb (flagged)
    document_name       text,
    training_course_name text,
    link_date           date,
    completion_status   text NOT NULL DEFAULT 'Completed'
                        CHECK (completion_status IN ('Completed','Renewal Due','Expired','Pending Review')),
    expiration_date     date,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.compliance_links IS 'Base44 ComplianceLink. Links a staff document to the training it satisfies. document_id points into staff_members.documents jsonb (OPEN Q: promote staff documents to a table).';
CREATE INDEX idx_compliance_links_staff ON carelink.compliance_links (staff_member_id);
CREATE TRIGGER trg_compliance_links_updated_at BEFORE UPDATE ON carelink.compliance_links
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- onboarding_records  (Base44: OnboardingRecord)  — 30/60/90 onboarding
CREATE TABLE carelink.onboarding_records (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id         uuid REFERENCES carelink.staff_members (id) ON DELETE SET NULL,
    staff_member            text NOT NULL,
    staff_email             text,
    hire_date               date NOT NULL,
    position                text NOT NULL,
    supervisor              text,
    onboarding_start_date   date,
    documents_required      jsonb,                           -- [{document,completed,completion_date}]
    system_access_items     jsonb,
    training_milestones     jsonb,
    day_30_checkin          jsonb,
    day_60_checkin          jsonb,
    day_90_checkin          jsonb,
    orientation_completed   boolean NOT NULL DEFAULT false,
    status                  text NOT NULL DEFAULT 'In Progress' CHECK (status IN ('In Progress','Completed','On Hold')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.onboarding_records IS 'Base44 OnboardingRecord. New-staff 30/60/90 onboarding checklist. Admin + the staff member.';
CREATE INDEX idx_onboarding_records_staff ON carelink.onboarding_records (staff_member_id);
CREATE TRIGGER trg_onboarding_records_updated_at BEFORE UPDATE ON carelink.onboarding_records
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- policy_documents  (Base44: PolicyDocument)
CREATE TABLE carelink.policy_documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_number       text,
    title               text NOT NULL,
    category            text NOT NULL CHECK (category IN
                            ('Operations','Clinical','HR','Finance','Compliance','Technology','Safety')),
    version             text DEFAULT '1.0',
    effective_date      date,
    last_revised        date,
    author              text NOT NULL,
    approval_authority  text,
    approval_date       date,
    document_url        text,
    summary             text,
    key_procedures      text[] NOT NULL DEFAULT '{}',
    revision_history    jsonb,
    mandatory_for_roles text[] NOT NULL DEFAULT '{}',
    status              text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published','Under Review','Superseded')),
    search_keywords     text[] NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.policy_documents IS 'Base44 PolicyDocument. Org policies. Published ones are staff-readable; admin manages.';
CREATE TRIGGER trg_policy_documents_updated_at BEFORE UPDATE ON carelink.policy_documents
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- policy_acknowledgements  (Base44: PolicyAcknowledgement)
CREATE TABLE carelink.policy_acknowledgements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_member_id     uuid REFERENCES carelink.staff_members (id) ON DELETE CASCADE,
    policy_id           uuid REFERENCES carelink.policy_documents (id) ON DELETE SET NULL,
    staff_member        text NOT NULL,
    policy_title        text NOT NULL,
    policy_version      text,
    acknowledged_date   date,
    acknowledgement_type text NOT NULL DEFAULT 'Initial Review'
                        CHECK (acknowledgement_type IN ('Initial Review','Annual Review','Update Review','Mandatory Refresh')),
    signature           text,
    signature_date      date,
    status              text NOT NULL DEFAULT 'Acknowledged' CHECK (status IN ('Acknowledged','Pending','Overdue')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
COMMENT ON TABLE carelink.policy_acknowledgements IS 'Base44 PolicyAcknowledgement. Staff sign-off on a policy. Admin + the staff member.';
CREATE INDEX idx_policy_ack_staff  ON carelink.policy_acknowledgements (staff_member_id);
CREATE INDEX idx_policy_ack_policy ON carelink.policy_acknowledgements (policy_id);
CREATE TRIGGER trg_policy_ack_updated_at BEFORE UPDATE ON carelink.policy_acknowledgements
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- INTERPRETERS  (Base44: Interpreter)  — language-access directory (req #3)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.interpreters (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    organization            text,
    phone                   text,
    email                   text,
    language_pairs          text[] NOT NULL DEFAULT '{}',
    dialects                text[] NOT NULL DEFAULT '{}',
    credential_type         text CHECK (credential_type IN ('Certified Medical','Community','Staff Bilingual','Contractor','Other')),
    certification_number    text,
    certification_expiry    date,
    modalities              text[] NOT NULL DEFAULT '{}',
    availability            text,
    avg_family_rating       numeric,
    total_sessions          integer NOT NULL DEFAULT 0,
    status                  text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Pending Verification')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
COMMENT ON TABLE carelink.interpreters IS 'Base44 Interpreter. Interpreter directory supporting language access (req #3).';
CREATE TRIGGER trg_interpreters_updated_at BEFORE UPDATE ON carelink.interpreters
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- DATA SOVEREIGNTY  (Base44: DataSovereigntyConfig)  — tribal data governance
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.data_sovereignty_configs (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nation_name                     text NOT NULL,
    nation_identifier               text UNIQUE,
    contact_name                    text,
    contact_title                   text,
    contact_email                   text,
    contact_phone                   text,
    data_storage_preference         text NOT NULL DEFAULT 'Platform Default'
                                    CHECK (data_storage_preference IN
                                        ('Platform Default','Nation-Controlled Export Only','Restricted — No Cloud Storage','Requires Nation Approval')),
    aggregate_reporting_allowed     boolean NOT NULL DEFAULT true,
    aggregate_reporting_conditions  text,
    external_sharing_allowed        boolean NOT NULL DEFAULT false,
    external_sharing_conditions     text,
    cultural_data_access_policy     text NOT NULL DEFAULT 'Coordinator + Supervisor'
                                    CHECK (cultural_data_access_policy IN
                                        ('Staff Only','Coordinator + Supervisor','Admin Only','Nation-Designated Staff Only')),
    tribal_enrollment_data_visible  boolean NOT NULL DEFAULT false,
    ceremony_data_visible           boolean NOT NULL DEFAULT true,
    export_restrictions             text[] NOT NULL DEFAULT '{}',
    requires_nation_review_for_reports boolean NOT NULL DEFAULT false,
    nation_review_contact           text,
    data_retention_years            integer NOT NULL DEFAULT 7,
    deletion_upon_request           boolean NOT NULL DEFAULT true,
    hipaa_plus_tribal_protections   boolean NOT NULL DEFAULT true,
    custom_consent_language         text,
    custom_consent_language_es      text,
    acknowledgment_signed_by        text,
    acknowledgment_date             date,
    status                          text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Pending Review','Inactive')),
    notes                           text,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    deleted_at                      timestamptz
);
COMMENT ON TABLE carelink.data_sovereignty_configs IS 'Base44 DataSovereigntyConfig. Per-nation data-governance policy layered ON TOP of HIPAA. Admin-only. The app must enforce these rules when handling cultural records / exports.';
CREATE TRIGGER trg_data_sov_updated_at BEFORE UPDATE ON carelink.data_sovereignty_configs
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();

-- ----------------------------------------------------------------------------
-- sync_state  (Base44: SyncState)  — external calendar sync token (singleton)
-- ----------------------------------------------------------------------------
CREATE TABLE carelink.sync_state (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_token  text,                                        -- Google Calendar incremental syncToken
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);
COMMENT ON TABLE carelink.sync_state IS 'Base44 SyncState. Stores external calendar sync tokens. Admin/service only.';
CREATE TRIGGER trg_sync_state_updated_at BEFORE UPDATE ON carelink.sync_state
    FOR EACH ROW EXECUTE FUNCTION carelink.set_updated_at();
