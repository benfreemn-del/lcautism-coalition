# LCAC CareLink — Architecture & Build Plan

**Decision (2026-06-01):** Full rebuild of the CareLink system on **owned, HIPAA-eligible infrastructure**, with **recurring infra cost kept minimal**. Base44 export is the design spec; the backend is built fresh.

> Reality check: "minimal cost" applies to monthly **infrastructure**, not to **effort**. 87 entities + ~90 screens is a large, multi-phase engineering project. We build toward the full system but ship usable slices so it's testable early and never a year-long black box.

---

## 1. The stack — owned + HIPAA-eligible + cheapest defensible
The cheapest way to get a **signed BAA + HIPAA-eligible** services on owned infra is **all-AWS** (AWS signs **one** BAA via AWS Artifact at *no charge*, covering the services below), plus Twilio for SMS. At low usage this is roughly **$40–100/mo**, not the ~$600/mo Supabase-Team or Vercel-Enterprise paths.

| Need | Service (BAA-eligible) | Why / rough low-usage cost |
| --- | --- | --- |
| Database | **AWS RDS Postgres** (small instance) or **Aurora Serverless v2** scaled low | Postgres = clean fit for the entity model; ~$15–40/mo small |
| App hosting | **AWS Amplify** or **S3 + CloudFront** | Hosts the React/Vite frontend; pennies–$ at low traffic |
| Auth | **AWS Cognito** | User pools, roles; first 50k MAU free tier |
| File storage | **AWS S3** | Consent forms, documents; cents |
| Email | **AWS SES** | Intake emails; ~$0.10/1k |
| SMS | **Twilio** (separate BAA) | Intake by text; ~$0.0079/msg |
| AI agents | **AWS Bedrock** (Anthropic models) | The 4 existing agents; pay-per-use, BAA-covered |

**Not used for PHI:** the current `lcac-crm` ($10 Supabase) and the website's Vercel — neither is HIPAA-eligible. CareLink stays **fully isolated** from Michelle's marketing site (separate repo, separate AWS account/project).

## 2. How the director's 6 requirements map to the build
1. **Persistence** → real Postgres backend (the whole point).
2. **Care-team access control** → a `client_assignments` table (client ↔ staff) + role model in Cognito, enforced by **Postgres Row-Level Security**: a staff member sees a client only if assigned (or has an org-wide role like Michelle). No `USING(true)` policies — ever.
3. **Intake by text + email** → Twilio (SMS) + SES (email) send a tokenized intake link; submissions write straight back into the client record. The export already has `FormDistribution` / `Submission` / `IntakeProgress` entities to model this.
4. **Integrated data** → one shared schema with real foreign keys; modules read/write the same records (no per-page silos). This is the core fix vs. Base44.
5. **Full EN ⇄ ES anytime** → an i18n layer (en/es resource bundles) for all UI, a `preferred_language` per client, free-text capture stored with a language tag, and **bilingual PDF/print** (generate a document in either language on demand). Built in from day one, not bolted on.
6. **HIPAA hosting** → the AWS stack above + the compliance program in §4.

## 3. Build phases (ship usable slices)
- **Phase 0 — Foundation:** AWS account + signed BAA; infra skeleton (RDS, Cognito, Amplify, CI); translate Base44 entities → Postgres schema; RLS + audit-log + soft-delete baked in; i18n scaffold. *(Schema translation can start now — see §5.)*
- **Phase 1 — Core case management:** Clients, StaffMembers, care-team assignment + RLS, Appointments, Intake (SMS/email), Tasks, Dashboard. → a genuinely usable system.
- **Phase 2 — Clinical:** ClinicalNotes, the assessments (ADOS-2, ADHD, exec-function, sensory), ConsentForms, ServicePlans, SafetyPlans.
- **Phase 3 — Extended:** Family/client Portal, the 4 AI agents (on Bedrock), reporting/outcomes, grants, inventory.
- **Cross-cutting (every phase):** bilingual, audit logging, access controls, encryption.

## 4. Compliance — what I can and can't do
- **I can build:** the software, RLS, audit logging, encryption config, access controls — the technical safeguards.
- **You/LCAC must own (real-world, not code):** sign the **AWS BAA** (free, AWS Artifact) and **Twilio BAA**; a **HIPAA risk assessment**; written **policies**; **staff training**; breach-notification process; and confirming whether LCAC is a HIPAA **covered entity** / business associate. For the legal/program side, budget a **HIPAA consultant** — that's not a coding task.
- **Guardrail until all that exists:** **no real patient data** goes into any system.

## 5. Immediate next step (free, starts now)
Translate the **87 Base44 entity definitions → a clean Postgres schema** (tables, relationships, the care-team assignment model, audit + soft-delete columns, RLS scaffolding, bilingual fields). This is stack-agnostic (works on RDS or anything Postgres), costs nothing, and is the foundation everything else sits on. Output: a reviewable `schema.sql` + notes, on a branch.

**Then you, in parallel (real-world):** open/confirm an AWS account and sign the BAA via AWS Artifact, and line up whoever handles the HIPAA compliance program.
