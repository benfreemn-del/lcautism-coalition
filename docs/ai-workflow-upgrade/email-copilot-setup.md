# Email Co-Pilot — Go-Live Setup Checklist

**Status:** SCAFFOLD. The code is written and reviewable, but nothing is live.
A developer (Ben) must plug in the items below before any email gets drafted or
sent. Until then the Drafts tab shows a friendly "not connected yet" message and
**no email can be drafted or sent**.

This builds **Option 1** from `email-copilot-plan.md`: always-on drafting in
Michelle's voice, a hard monthly spend cap, approve-before-send. **Nothing ever
auto-sends.**

---

## What's in the repo (the scaffold)

| Piece | Path |
|---|---|
| Database migration (3 tables, RLS-locked) | `docs/ai-workflow-upgrade/migrations/0002_email_copilot.sql` |
| Drafting function (inbound → AI draft → store) | `supabase/functions/draft-reply/index.ts` |
| Send function (approved drafts only) | `supabase/functions/send-approved/index.ts` |
| Staff read/edit/approve API for the UI | `supabase/functions/drafts-api/index.ts` |
| Provider-agnostic inbound seam | `supabase/functions/_shared/inbound.ts` |
| Voice profile + prompt builder | `supabase/functions/_shared/voice.ts` |
| LLM call + hard spend cap | `supabase/functions/_shared/llm.ts` |
| Service-role DB client | `supabase/functions/_shared/db.ts` |
| Function config (JWT settings) | `supabase/config.toml` |
| Secret names (template, no values) | `supabase/functions/.env.example` |
| CRM "Drafts" tab | `crm-admin/index.html`, `crm-admin/app.js` |

---

## Step 1 — Apply the database migration

The migration adds `email_messages`, `email_drafts`, `email_usage_log` —
RLS-on, no policies, grants revoked from anon/authenticated (service-role-only,
consistent with `backend-review-snapshot.md`). It references the existing
`contacts` table, so apply it **after** `lcac_crm_initial_schema`.

1. Review `migrations/0002_email_copilot.sql` end to end.
2. Apply it to the `lcac-crm` project (`byxuapnhhuxekamgnwaf`) — Supabase SQL
   editor, `supabase db push`, or MCP `apply_migration`. **Never run it from the
   browser or with the anon key.**
3. Verify the lockdown (should all be the safe answer):
   ```sql
   SELECT has_table_privilege('anon','email_messages','SELECT');  -- false
   SELECT has_table_privilege('anon','email_drafts','SELECT');    -- false
   SELECT has_table_privilege('anon','email_usage_log','SELECT'); -- false
   ```
   Then run `get_advisors(security)` and confirm **0 new** permissive
   public/anon policies.

---

## Step 2 — Decide the mailbox / inbound seam

The inbound provider is **not hard-committed**. Pick one and set
`INBOUND_PROVIDER`:

- **`inbound_parse` (default, simplest):** forward LCAC mail to a Postmark (or
  SendGrid/Mailgun) inbound-parse webhook that POSTs to the `draft-reply`
  function. Set `INBOUND_PARSE_USER` / `INBOUND_PARSE_PASS` (HTTP Basic). A
  worked parser is already in `_shared/inbound.ts`.
- **`gmail` (Google Workspace):** if info@ / outreach@ / executivedirector@ are
  Workspace mailboxes and you want true two-way sync. You must finish
  `gmailInboundParser.parse` (OAuth + Gmail API), set `GMAIL_PUSH_SECRET`, and
  wire Pub/Sub push or a polling job. More setup, more power.

**Confirm which mailbox(es)** the co-pilot watches and whether they're Google
Workspace before choosing.

---

## Step 3 — Set the secrets (all by name, never in the repo)

Set these as Supabase function secrets (`supabase secrets set NAME=value`).
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them. Names live in `supabase/functions/.env.example`.

- `LLM_API_KEY` — the paid LLM key. **Drafting does nothing without it.**
- `LLM_MODEL` — model id (default `claude-3-5-haiku-latest`).
- `MONTHLY_USD_CAP` — the hard ceiling. **Default 15.** See Step 5.
- `LLM_INPUT_USD_PER_MTOK` / `LLM_OUTPUT_USD_PER_MTOK` — cost-estimate rates for
  the cap; set to match your provider's pricing.
- Inbound auth: `INBOUND_PROVIDER` + (`INBOUND_PARSE_USER`/`INBOUND_PARSE_PASS`)
  **or** `GMAIL_PUSH_SECRET`.
- Outbound send: `EMAIL_PROVIDER_KEY` + `EMAIL_FROM` (e.g.
  `executivedirector@lcautism.org`).

---

## Step 4 — Finish the outbound send + deploy functions

1. In `send-approved/index.ts`, implement the `sendEmail` body for your chosen
   provider (a Postmark example is in the comments). Until then it returns an
   honest "not configured" error — it never fakes a send.
2. Deploy the functions:
   ```
   supabase functions deploy draft-reply
   supabase functions deploy send-approved
   supabase functions deploy drafts-api
   ```
   `config.toml` already sets `verify_jwt`: off for `draft-reply` (it does its
   own provider auth), on for `send-approved` and `drafts-api` (staff only).

---

## Step 5 — Set + confirm the spend cap (the guardrail)

- The cap is `MONTHLY_USD_CAP` (default **15**), enforced in
  `_shared/llm.ts` → `checkSpendCap`. Before every draft, the function sums this
  month's logged spend; at/over the cap it **skips drafting** (logs the message
  as `skipped` / `monthly_cap_reached`) — **no LLM call, no spend.**
- To change the cap later, just update the `MONTHLY_USD_CAP` secret — no code
  change. The Drafts tab shows "used $X of $Y this month."
- Record this paid LLM + its cap in the guardrails log as a **deliberate, capped
  exception** (per `PACKAGE-SCOPE.md` §4.1 and §5).

---

## Step 6 — Build the voice profile

`_shared/voice.ts` ships with a starter profile distilled from `CLAUDE.md` +
`lcac-knowledge-base.md`. Improve it from **20–50 of Michelle's real sent
emails** (tone, sign-off, common phrasings). Bump `VOICE_PROFILE_VERSION` when
you change it — drafts record which version produced them.

---

## Step 7 — Confirm the human gate end to end

Before handing it to Michelle, verify with a test email:

1. Inbound test email → `email_messages` row + a `pending` `email_drafts` row.
2. Drafts tab shows it; editing + "Save edit" persists; "Approve" sets the draft
   to `approved` and **does not send**.
3. Sending happens **only** via an explicit "send approved reply" action that
   calls `send-approved`, which **refuses any draft that isn't `approved`**.
4. There is **no** code path that sends without approval. Confirm by reading
   `send-approved/index.ts` — the only send is gated on `status === 'approved'`.

---

## What a developer must still plug in (summary)

- [ ] Apply `0002_email_copilot.sql` to `lcac-crm` + verify anon can't read it.
- [ ] Choose mailbox + inbound provider (`INBOUND_PROVIDER`); finish the Gmail
      parser if Gmail is chosen.
- [ ] Set secrets: `LLM_API_KEY`, `MONTHLY_USD_CAP`, inbound auth,
      `EMAIL_PROVIDER_KEY`, `EMAIL_FROM`.
- [ ] Implement `sendEmail` in `send-approved` for the chosen send provider.
- [ ] Deploy the three edge functions.
- [ ] Set + confirm the monthly cap; log it as a deliberate guardrail exception.
- [ ] Refine the voice profile from real sent emails.
- [ ] Run the end-to-end human-gate test above.
