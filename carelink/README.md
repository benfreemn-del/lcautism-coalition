# LCAC CareLink — Phase 1 dev scaffold

> **This is a RUNNABLE DEV SCAFFOLD, not a finished product.** It runs locally
> against a throwaway Postgres with **obviously-fake seed data**. There is **no
> real patient data, no live database, no cloud, and no secrets** here. Auth is
> a local stub. Do **not** point this at any real or HIPAA database, and do not
> claim it is production-ready — it is pending real infrastructure + auth
> (Phase 0 in `docs/carelink/BUILD-PLAN.md`).

It implements the Phase 1 "core case management" slice from
`docs/carelink/BUILD-PLAN.md` §3 against the Postgres schema in
`docs/carelink/schema/` (the source of truth for data shapes).

## What's in here

```
carelink/
  api/   Thin Node API (Hono + node-postgres), stub JWT auth, parameterized SQL
  web/   Vite + React + Tailwind SPA, bilingual EN/ES
```

### Flows built (Phase 1 scope, nothing more)
1. **Login** — stub JWT issued by the local API (`/api/auth/login`). Any
   password works for a seeded staff email. Designed to swap to AWS Cognito
   (see "Auth: what's stubbed" below).
2. **Dashboard** — today's appointments + open tasks for the signed-in staff.
3. **Clients** — list + detail (demographics, `preferred_language`, household).
4. **Staff** — staff directory list.
5. **Care-team assignment** — assign staff to a client (`client_assignments`).
   A non-admin staff member only sees clients they are actively assigned to;
   org admins see all. This mirrors the schema's `can_access_client()` logic.
6. **Appointments** — list + create, tied to a client + staff.
7. **Tasks** — list + create + complete, tied to a client + staff.
8. **Intake capture** — a public, bilingual intake form (`/intake`) that creates
   a pending client + a `submissions` record (modeled on the schema's intake /
   submission tables).

### Cross-cutting (built in from the start)
- **Bilingual EN ⇄ ES** — a language toggle is in the header (and on the
  public login/intake pages) and switches every UI string. Strings live in
  `web/src/i18n/en.js` and `es.js`. The client's `preferred_language` is shown
  and labeled in the active UI language.
- **Access control** — enforced in the API layer (`api/src/lib/access.js`),
  default-deny, mirroring the schema's RLS care-team rule. The schema's RLS
  (`docs/carelink/schema/99_rls_policies.sql`) is the authoritative DB guard for
  the AWS target; this scaffold enforces the same rule in the app because the
  dev DB connects as a single owner role.
- **Audit** — create/update/delete of core records (login, assignments,
  appointments, tasks, intake) write to `carelink.audit_log`
  (`api/src/lib/audit.js`), per requirement #4.

## Run it locally

You need: Node 18+ and a **local** Postgres you control (Docker or native).
Do **not** use a real database.

### 1. Start a local Postgres (example with Docker)
```bash
docker run --name carelink-dev-db -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=carelink_dev -p 5432:5432 -d postgres:16
```
(Or use any local Postgres and create a `carelink_dev` database.)

### 2. API
```bash
cd carelink/api
cp .env.example .env          # then edit .env:
#   set DATABASE_URL to your local DB, e.g.
#   postgres://postgres:devpass@localhost:5432/carelink_dev
#   set JWT_SECRET to any random string (dev only)
npm install
npm run db:load               # loads docs/carelink/schema/*.sql into the LOCAL db
npm run db:seed               # inserts obviously-fake demo data
npm run dev                   # API on http://localhost:8787
```

### 3. Web
```bash
cd carelink/web
cp .env.example .env          # optional; defaults are fine for local
npm install
npm run dev                   # app on http://localhost:5173 (proxies /api -> 8787)
```

### 4. Try it
Open http://localhost:5173 and sign in (password is ignored — it's a stub):
- `admin@example.test` — org admin, sees **all** clients.
- `coordinator@example.test` — sees **only Client A and B** (assigned), **not
  Client C** — this demonstrates the care-team access rule.

Public intake form is at http://localhost:5173/intake (no login).

> Convenience: `npm run db:reset` (in `api/`) reloads schema + reseeds.

## Stack rationale (portable to the AWS-minimal target)
- **Vite + React + Tailwind** matches the Base44 origin and the BUILD-PLAN
  frontend (AWS Amplify / S3+CloudFront hosting later). Built fresh — **no
  Base44 SDK dependency**.
- **Hono (Node) + node-postgres** is a thin, parameterized-SQL API. Hono runs on
  Node now and ports cleanly to Lambda/edge later. Parameterized queries only.
- **Postgres schema** is exactly `docs/carelink/schema/` — the same SQL intended
  for AWS RDS. Nothing schema-specific is hidden in the app.

## Auth: what's stubbed and how it maps to AWS later
- **Now (stub):** `api/src/lib/auth.js` issues a symmetric-key JWT. Login looks
  up a seeded staff row by email and signs a token carrying `staffId`,
  `authUid` (= `staff_members.auth_user_id`), and `isOrgAdmin`. **No passwords
  are stored or checked.**
- **Later (AWS Cognito):** Cognito issues RS256 JWTs (verified via JWKS); its
  `sub` becomes `staff_members.auth_user_id` (already modeled). Replace
  `signDevToken`/`verifyToken` with the Hosted-UI redirect + JWKS verification.
  The rest of the API (which reads `req.auth.staffId`) is unchanged. The schema
  already isolates the platform dependency in `carelink.current_auth_uid()`.

## Explicitly OUT OF SCOPE for Phase 1 (deferred)
- **Phase 0 infra:** AWS account + signed BAA, RDS, Cognito, Amplify/CloudFront,
  SES/Twilio, CI. None of that is here — this is local-only.
- Real authentication / passwords / MFA (stub only).
- Live database, migrations against real infra, applying the schema anywhere
  but a local throwaway DB.
- Clinical entities (notes, assessments, consents, service/safety plans) —
  **Phase 2**.
- Family/guardian portal, the 4 AI agents, reporting/outcomes, grants,
  inventory — **Phase 3**.
- Real intake-by-SMS/email delivery (Twilio/SES tokenized links). The intake
  form here writes directly to a pending record; the tokenized delivery path is
  Phase 0/1 infra work.
- On-demand bilingual PDF/print generation and the `translations` review
  workflow (modeled in the schema; not built here).
- Per-request DB role switching to exercise RLS as `app_staff` end-users. The
  scaffold runs as a single dev role and mirrors the rule in the app layer.

## A note on the schema
`docs/carelink/schema/*.sql` is labeled **DESIGN ONLY**. The `db:load` script is
a developer convenience that applies it to a **local** DB for demoing the UI. It
does not change the schema's status or imply it has been applied to real infra.
