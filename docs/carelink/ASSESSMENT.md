# LCAC CareLink — Assessment & Path Forward

**Date:** 2026-06-01
**Source:** Base44 export `lcaccarelink.zip` (the app an employee designed) + director's list of problems with it.
**Status:** Assessment only. **No real patient data should be entered into any current system** (Base44, lcac-crm, or the website's Vercel) — none of them are HIPAA-compliant today.

---

## 1. What this app actually is
Not a CRM — a **full clinical / behavioral-health case-management system**. The export contains **87 data types** and **~90 screens**, including:
- Clinical assessments: ADOS-2, ADHD, executive-function, sensory profiles, screenings
- Clinical notes, chart reviews, case summaries, service & discharge plans
- Safety plans, crisis debriefs, de-escalation plans, behavior incidents
- Consent forms, IEP/IEE prep, PWN tracking
- A family/client **portal**, staff/role management, audit logs, 4 AI agents

**This is PHI (Protected Health Information) end to end.** HIPAA applies.

## 2. The two hard problems
1. **No backend attached.** The export is a Vite/React frontend wired to Base44's hosted backend via `VITE_BASE44_APP_ID` / `VITE_BASE44_APP_BASE_URL`. Without that backend, **nothing saves** — which matches the "data isn't saving" complaint.
2. **Base44 cannot legally hold this data.** As of 2026 Base44 **does not sign a BAA and is not HIPAA-compliant**; its ToS prohibits real PHI. SOC 2 / ISO certs ≠ HIPAA. So it can't be the production home for real patients regardless of plan.

## 3. The director's requirements (what was wrong with what she used)
1. **Persistence** — data must actually save.
2. **Care-team access control** — when you add a user, you must be able to **attach a patient/client to Michelle or other staff**, so the right people see the right clients (role-based, shared-within-care-team visibility).
3. **Intake by text + email** — send intake forms via SMS and email; capture the responses back into the record.
4. **Integrated data** — the modules/pages currently don't share data; entering something one place must flow everywhere relevant (no silos).
5. **Full bilingual EN ⇄ ES, anytime** — work in English, print/produce in Spanish (and vice versa) on demand.
6. **Hosted, fully functional, and HIPAA-compliant**, accessible from their site.

## 4. What "HIPAA-compliant" actually requires (the real cost of #6)
HIPAA is infrastructure + contracts + process, not a setting:
- **A signed BAA with every vendor that touches PHI** — database host, app host, SMS, email, and any AI model.
- **HIPAA-eligible infrastructure** (none of our current stack qualifies):
  - *Database:* Supabase HIPAA is on the **Team plan + HIPAA add-on with BAA** (~$599/mo class), **not** the $10 `lcac-crm` we built. (Alternative: AWS RDS/Aurora — AWS signs a BAA at no extra charge.)
  - *App hosting:* Vercel HIPAA = **Enterprise + BAA**. Cheaper compliant path is **AWS/GCP** (both sign BAAs).
  - *SMS:* **Twilio** signs a BAA (HIPAA-eligible).
  - *Email:* needs a HIPAA-eligible sender (e.g. Paubox, or AWS SES under BAA). **Web3Forms is not for PHI.**
  - *AI agents:* the 4 agents touch PHI → must run on a **BAA-covered model** (e.g. Anthropic/other via AWS Bedrock), not a plain API key.
- **Plus the program:** risk assessment, access controls, audit logging (the app already models `AuditLog`), encryption at rest/in transit, breach-notification process, staff training, written policies.

**Honest scope:** this is a real, multi-month software project with real recurring infra cost (hundreds+/mo once compliant) and a compliance program — not a wiring job. It must be **completely isolated from Michelle's public marketing website** (different infra, different repo). The two should never share a backend.

## 5. Realistic paths
- **A. Rebuild on HIPAA-eligible infra (recommended if this is going forward for real).** Keep the Base44 frontend as the design/blueprint; stand up a real, BAA-covered backend (Postgres + auth + storage), re-point the app at it, and add the 5 missing capabilities (care-team access, SMS/email intake, integrated data, bilingual). Largest effort, but the only path to a compliant, owned system.
- **B. Find a HIPAA platform that signs a BAA** (a healthcare app builder or managed backend) and migrate onto it. Less custom work, monthly platform cost, less control.
- **C. Scope down.** Decide LCAC doesn't need the full 87-entity EHR yet — pick the handful of modules actually used (intake, clients, appointments, notes) and build only those, compliant. Fastest to something real.

## 6. Immediate guardrails
- **Do not enter real patient data** into Base44, `lcac-crm`, or anything on the current Vercel until a compliant home + signed BAAs exist.
- Keep CareLink **separate** from the `lcautism-coalition` website repo and infra.
- Treat the Base44 export as the **design spec**, not the production system.

## 7. Recommended next step
Before any building: confirm (a) that LCAC intends to fund HIPAA-grade infra + BAAs, and (b) which of paths A/B/C. Then I can produce the detailed architecture + data model + phased build plan, starting from the most-used modules.
