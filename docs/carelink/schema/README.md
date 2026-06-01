# LCAC CareLink — PostgreSQL Schema (translation of the Base44 design spec)

**Status:** DESIGN ONLY. Nothing here has been applied to any database. There is
no live DB and **no real patient data exists** — this is the foundation-phase
data model from `docs/carelink/BUILD-PLAN.md` §5. It is stack-agnostic Postgres
intended for AWS RDS (or any Postgres) once HIPAA-eligible infra + BAAs exist.

It translates the **87 Base44 entity definitions** in
`docs/carelink/base44-spec/entities/` into a clean, integrated, owned schema
with care-team access control, real foreign keys, bilingual support, and
audit/soft-delete baked in.

## Files (apply in order)

| File | Contents |
|---|---|
| `00_extensions.sql` | `pgcrypto`, `pg_trgm`, the `carelink` schema, shared `updated_at` trigger fn |
| `01_core.sql` | `staff_members`, `role_templates`, `households`, `clients`, **`client_assignments`**, and the **access-control helper functions** |
| `02_clinical.sql` | Notes, assessments, plans, safety/crisis/behavior, cultural, education/advocacy, wraparound, consultations, outcomes, letters, workflows |
| `03_intake_forms.sql` | `form_distributions`, `submissions`, `intake_progress`, `document_templates`, `pending_registrations`, `onboarding_requests` (SMS/email intake plumbing) |
| `04_portal.sql` | `portal_users`, `portal_access`, invitations, family-facing appointments/consents/documents/messages/feedback, notifications |
| `05_ops.sql` | Grants + billing, inventory + kits + suppliers, training/compliance, policies, tasks, reports, resources, workshops/outreach, PDSA, supervision, interpreters, data sovereignty, **`translations`**, sync state |
| `06_audit.sql` | `audit_log`, `permission_audit_log`, `portal_access_log` (append-only) |
| `99_rls_policies.sql` | RLS enable + grants + **all policies**. Read this to understand access control. |

## Conventions

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on every table.
- `created_at` / `updated_at timestamptz` (trigger-maintained) + `deleted_at timestamptz` (soft delete) on every table (requirement #4).
- `timestamptz` for times; `date` for dates; `numeric` for money/scores.
- `jsonb` where Base44 used freeform/nested objects (`additionalProperties`, deeply nested phase data).
- `text` + `CHECK` for enums (no `ALTER TYPE` pain when the org adds a category).
- snake_case throughout (Base44 mixed `camelCase` like `InventoryItem.nameEn` and snake_case; normalized to `name_en`, etc.).
- Everything lives in a dedicated **`carelink`** schema, not `public`.

## How the 4 baked-in requirements are met

1. **Care-team access control** — `carelink.client_assignments` (client ↔
   staff_member, with a `role` on the assignment). RLS lets a staff member touch
   a client's records only if `carelink.can_access_client(client_id)` returns
   true = **org-admin** (`staff_members.is_org_admin`, e.g. Michelle/directors)
   **OR actively assigned**. Default-deny; no `USING (true)` for PHI. All policies
   live in `99_rls_policies.sql` and target the `app_staff`/`app_portal` roles —
   never `public`.
2. **Integrated data (real FKs)** — every clinical record carries a real
   `client_id` FK to `carelink.clients`; assessments/notes/plans/units-of-service
   all join up. Examples of resolved cross-references: `units_of_service` →
   `clinical_notes` + `grants`; `crisis_debriefs` → `behavior_incidents`;
   `service_plan_versions` → `service_plans`; `portal_access` → `portal_users` +
   `clients`; `inventory_*` → `inventory_items` + `kit_assemblies`; `grants` →
   `logic_models`. Base44's loose string IDs (`client_id` as text, `assigned_to`
   as a name) became proper UUID FKs.
3. **Bilingual EN/ES** — `clients.preferred_language`; staff-authored free-text
   records carry a `language` column (`clinical_notes`, `screenings`,
   `generated_letters`, portal messages/documents, etc.); bilingual catalogs use
   paired `*_en`/`*_es` columns (`inventory_items`, `kit_templates`,
   `resources`); and a generic **`carelink.translations`** table holds on-demand
   EN↔ES renderings of any field, gated by the `translation_reviews` human-approval
   workflow. See "Bilingual approach" below.
4. **Audit + safety** — `created_at`/`updated_at`/`deleted_at` on every table;
   Base44's `AuditLog` → `audit_log`, `PermissionAuditLog` → `permission_audit_log`,
   `PortalAccessLog` → `portal_access_log`. Audit tables are **append-only**
   (insert + admin-read policies only; no update/delete).

## Bilingual approach (detail)

Three complementary mechanisms, so the org can "work in English, produce in
Spanish on demand" (and vice versa):

- **Structured language tags** — `preferred_language` on `clients` /
  `portal_users` / `notification_preferences` drives which language outbound
  comms and printed docs use.
- **Paired columns** for reference/catalog content that is authored in both
  languages up front (`inventory_items.name_en`/`name_es`, `kit_templates`
  scripts/checklists, `resources` titles/descriptions).
- **`carelink.translations`** (polymorphic: `source_table`, `source_id`,
  `field`, `target_language`) for staff-authored free text where a second-language
  rendering is generated on demand. Machine translations stay `is_approved=false`
  until a human signs off via `translation_reviews` (Base44 `TranslationReview`),
  after which the app may show/print them. This avoids widening every clinical
  table with a `_es` twin while still supporting full bilingual output.

## Access-control roles (in `99_rls_policies.sql`)

- `service_role` — server-side app / edge functions / migrations. **Bypasses RLS**
  by design (never shipped to a browser). Does most real work.
- `app_staff` — logged-in staff sessions. Scoped by `can_access_client()`.
- `app_portal` — logged-in family/guardian sessions. Scoped to their granted
  children via `portal_access`. **No access to clinical tables.**
- `anon` — unauthenticated. **Zero grants** in the `carelink` schema. Public /
  tokenized intake is the app server validating a form token and writing via
  `service_role` — there is no anon SQL path into PHI.

The helper functions (`current_staff_id`, `is_org_admin`,
`is_assigned_to_client`, `can_access_client`, `current_portal_user_id`,
`portal_user_can_access_client`) are `SECURITY DEFINER` with a locked
`search_path`. `carelink.current_auth_uid()` is the single place that depends on
the host auth platform — replace its body with `auth.uid()` on Supabase or a
`current_setting('carelink.auth_uid')` on RDS.

---

## Entity → table mapping (all 87 Base44 entities)

86 tables map 1:1 from the 87 entities (one duplicate pair merged), plus **2 new
tables** the build plan requires (`client_assignments`, `translations`).

### Core (`01_core.sql`)
| Base44 entity | Table | Notes |
|---|---|---|
| StaffMember | `staff_members` | `role`/`program_assignments` kept as `text[]`; added explicit `is_org_admin` + `auth_user_id`. `caseload_assignments[]` replaced by `client_assignments`. |
| RoleTemplate | `role_templates` | Role access-posture reference data. |
| PortalHousehold | `households` | Member/child ID arrays normalized into FKs (`clients.household_id`, `portal_users.household_id`, `portal_access`). |
| Client | `clients` | PHI spine. `assigned_to`/`assigned_providers` replaced by `client_assignments`. `documents`/`attached_resources`/`staff_notes` kept as `jsonb` (see open Qs). |
| — (NEW) | `client_assignments` | **Care-team model (req #1).** client ↔ staff with role/primary/status. |

### Clinical (`02_clinical.sql`)
| Base44 entity | Table |
|---|---|
| Referral | `referrals` |
| Appointment | `appointments` |
| BlockedTime | `blocked_time` |
| WaitlistEntry | `waitlist_entries` |
| ClinicalNote | `clinical_notes` |
| ChartReview | `chart_reviews` |
| CaseSummary | `case_summaries` |
| ADOS2Assessment | `ados2_assessments` |
| ADHDAssessment | `adhd_assessments` |
| ExecFunctionAssessment | `exec_function_assessments` |
| SensoryProfile | `sensory_profiles` |
| Screening | `screenings` |
| DiagnosticEquityRecord | `diagnostic_equity_records` |
| ServicePlan | `service_plans` |
| ServicePlanVersion | `service_plan_versions` |
| ServiceCoordination | `service_coordination` |
| OutgoingReferral | `outgoing_referrals` |
| BehaviorIncident | `behavior_incidents` |
| CrisisDebrief | `crisis_debriefs` |
| DeEscalationPlan | `de_escalation_plans` |
| SafetyPlan | `safety_plans` |
| ConsentForm | `consent_forms` |
| CulturalIdentity | `cultural_identity` |
| CulturalPractice | `cultural_practices` |
| IEPMeeting | `iep_meetings` |
| IEERequest | `iee_requests` |
| PWNLog | `pwn_logs` |
| TransitionPlan | `transition_plans` |
| DischargePlan | `discharge_plans` |
| WrapAroundTeam **+** WraparoundTeam | `wraparound_teams` | **Merged** (duplicate entities). |
| Consultation | `consultations` |
| MeetingTranscript | `meeting_transcripts` |
| OutcomeRecord | `outcome_records` |
| GeneratedLetter | `generated_letters` |
| ResourceMatch | `resource_matches` |
| ClientWorkflow | `client_workflows` |

### Intake & forms (`03_intake_forms.sql`)
| Base44 entity | Table |
|---|---|
| FormDistribution | `form_distributions` (added `client_phone`/`sent_via_sms`/`access_token` for SMS intake) |
| Submission | `submissions` |
| IntakeProgress | `intake_progress` |
| DocumentTemplate | `document_templates` |
| PendingRegistration | `pending_registrations` |
| OnboardingRequest | `onboarding_requests` |

### Portal (`04_portal.sql`)
| Base44 entity | Table |
|---|---|
| PortalUser | `portal_users` (`children[]` normalized into `portal_access`) |
| PortalAccess | `portal_access` |
| PortalInvitation | `portal_invitations` |
| PortalAppointment | `portal_appointments` |
| PortalConsent | `portal_consents` |
| PortalDocument | `portal_documents` |
| PortalMessage | `portal_messages` |
| PortalFeedback | `portal_feedback` |
| Notification | `notifications` |
| NotificationPreference | `notification_preferences` |

### Ops (`05_ops.sql`)
| Base44 entity | Table |
|---|---|
| LogicModel | `logic_models` |
| Grant | `grants` (CareLink program grants — distinct from the donor-CRM `grants`) |
| GrantReport | `grant_reports` |
| UnitOfService | `units_of_service` |
| Supplier | `suppliers` |
| InventoryItem | `inventory_items` |
| KitTemplate | `kit_templates` |
| KitAssembly | `kit_assemblies` |
| InventoryHold | `inventory_holds` |
| InventoryTransaction | `inventory_transactions` |
| Resource | `resources` |
| Task | `tasks` |
| Report | `reports` |
| Workshop | `workshops` |
| OutreachEvent | `outreach_events` |
| PDSAProject | `pdsa_projects` |
| SupervisionMeeting | `supervision_meetings` |
| TrainingCourse | `training_courses` |
| TrainingRecord | `training_records` |
| ComplianceLink | `compliance_links` |
| OnboardingRecord | `onboarding_records` |
| PolicyDocument | `policy_documents` |
| PolicyAcknowledgement | `policy_acknowledgements` |
| Interpreter | `interpreters` |
| DataSovereigntyConfig | `data_sovereignty_configs` |
| SyncState | `sync_state` |
| TranslationReview | `translation_reviews` |
| — (NEW) | `translations` | **Bilingual layer (req #3).** |

### Audit (`06_audit.sql`)
| Base44 entity | Table |
|---|---|
| AuditLog | `audit_log` |
| PermissionAuditLog | `permission_audit_log` |
| PortalAccessLog | `portal_access_log` |

**Merged:** WrapAroundTeam + WraparoundTeam → `wraparound_teams` (1).
**New:** `client_assignments`, `translations` (2).
86 + 2 = **88 tables** from 87 source entities.

---

## Open questions / ambiguities for a human to resolve

These are places the Base44 source was unclear, or where I made a judgment call
that a clinician/admin should confirm. I avoided inventing clinical semantics.

1. **AI agents touch PHI.** The 4 Base44 agents (`base44-spec/agents/`) and the
   AI-drafted fields (`case_summaries.ai_draft_summary`,
   `translation_reviews.translated_text`) imply an AI model processing PHI. Per
   ASSESSMENT.md that model must be BAA-covered (Bedrock). Schema is fine; this
   is an infra/compliance decision, not a column.
2. **`clients.staff_notes` as jsonb vs. its own table.** Base44 inlined an array
   of notes with author/category/mentions/attachments/edit history. I kept it
   `jsonb`. For per-note audit, @mentions, and edit tracking, promote it to a
   `client_staff_notes` table. Same question for `clients.documents` and
   `staff_members.documents` (jsonb arrays of uploaded files) — likely deserve a
   real `documents` table with storage keys.
3. **`portal_messages` threading & polymorphic sender.** `conversation_id` has
   no parent table, and `sender_id` mixes portal-user UUIDs and staff emails.
   Recommend a `portal_conversations` table and a typed sender (e.g.
   `sender_staff_id` / `sender_portal_user_id`). Flagged inline.
4. **`compliance_links.document_id` points into a jsonb array** inside
   `staff_members.documents` rather than a real row. Ties to open Q2 (promote
   staff documents to a table).
5. **`units_of_service.invoice_batch_id`** references a batch/invoice concept
   with no entity in the export. Left as a bare uuid. Add an `invoice_batches`
   table if billing batches are built.
6. **Cultural-data access is stricter than care-team RLS.** `CulturalIdentity`
   and `CulturalPractice` carry an `access_level` ('Coordinator Only' / 'Full
   Care Team' / 'Admin Only'), and `DataSovereigntyConfig` defines per-nation
   rules (who sees enrollment numbers, what may be exported). The DB policies
   currently apply standard care-team scope; **the app must additionally enforce
   `access_level` + data-sovereignty rules** (especially `tribal_enrollment_number`
   and exports). A human should decide whether to push some of this into RLS
   (e.g. an admin-only column-mask) vs. the app layer.
7. **`chart_reviews` / `consultations` / `supervision_meetings` reviewer access.**
   Base44 also let the named reviewer/reviewee/panel-member/presenter read rows
   by matching their full name. I scoped these to admin + (care-team where a
   client is tied) + the supervisor/supervisee FK on supervision. If reviewers
   who are *not* on the care team must read a specific review, add a reviewer-FK
   read policy. Name-string matching was deliberately dropped (fragile/unsafe).
8. **`data_sovereignty_configs` / `sync_state` were admin-only in Base44** but my
   reference-data loop grants any staff `SELECT`. Drop their `*_read` policy for
   strict admin-only parity (noted inline in §8 of the RLS file).
9. **`pending_registrations` / `onboarding_requests` are admin-review tables;**
   the broad staff policy is convenient but loose. Tighten to `is_org_admin()`
   if only admins should see access requests (noted inline).
10. **Family read of the core `clients` row.** A `clients_portal_read` policy
    exists but I did **not** issue the `SELECT` grant to `app_portal` by default
    (families normally see portal-projection tables, not the raw PHI row).
    Enable the grant if the portal must read the client row directly.
11. **`Appointment` vs. `PortalAppointment` duplication.** Two appointment models
    (staff-side + family-facing). Kept both with a `source_appointment_id` link.
    Confirm whether they should be one table with a visibility flag.
12. **Money/score precision.** Base44 used untyped "number". I used `numeric`
    (unbounded) for costs/scores. Pin precision/scale (e.g. `numeric(12,2)` for
    dollars) once finance confirms.
13. **`client_id_number` generation.** `clients.client_id_number` (e.g.
    LCAC-0001) is a human ID; sequence/format generation is an app concern, left
    as a unique text column.
