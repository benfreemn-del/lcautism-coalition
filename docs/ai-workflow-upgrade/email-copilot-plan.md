# Email Co-Pilot — Build Plan (Module C)

**Status:** ✅ **DECISION (2026-06-01, Ben at office): Option 1 chosen** — always-on drafting in her voice with a hard monthly spend cap. Still a from-scratch build that needs mailbox access + a capped LLM key + secrets, so it gets built in a focused session (partly on-site). The rest of this doc is the blueprint.

**To build Option 1, we still need:** (1) the mailboxes confirmed (info@ / outreach@ / executivedirector@) and whether they're Google Workspace; (2) inbound-parse vs Gmail API decided; (3) a paid LLM key with a hard cap set (e.g. $10–20/mo) + usage logging; (4) the approval UI tab in the CRM. **Nothing auto-sends — ever; she approves every reply.**

**Goal:** incoming emails to LCAC get a draft reply written *in Michelle's voice*; she reviews and approves; only approved replies send. She goes from "write every email" to "skim and click approve."

**Scaffold status (built, not live):** the code for Option 1 now exists in the repo — DB migration (`migrations/0002_email_copilot.sql`), edge functions (`supabase/functions/draft-reply`, `send-approved`, `drafts-api`), a provider-agnostic inbound seam, voice profile, hard-capped LLM call, and a "Drafts" tab in the CRM. Nothing is wired or deployed yet. The exact plug-in steps (migration, mailbox decision, secrets, cap) are in `email-copilot-setup.md`.

---

## ⚠️ Important: nothing existing is reusable here

The `inbound-email` edge function on the OTHER Supabase project is a **Washington State Patrol DUI report drafter** — it is not an email assistant and shares nothing with LCAC. The LCAC email co-pilot is a **new build** on the `lcac-crm` project.

---

## The cost decision (must pick before building)

Drafting in someone's voice requires an LLM API call, which **bills per use** — this is the one place that touches the "no paid-usage APIs without a cap" guardrail. Options (from PACKAGE-SCOPE §5):

- **Option 1 — One paid LLM, drafting-only, hard monthly cap.** Always-on: every inbound email auto-gets a draft waiting for her. Cost is small (a few dollars/month at this volume) but real. **← Recommended.** Add it to the guardrails as a *deliberate, capped* exception.
- **Option 2 — In-session only (no always-on service).** Drafts are generated only when she opens a Claude Code session and runs a "draft my replies" routine. $0 standing cost; cost tracks her usage. Less magical (not waiting in her inbox), but zero surprise spend.
- **Option 3 — Templates, no LLM.** Pick-and-tweak canned replies. Free, but not "in her voice / context-aware."

**Recommendation:** **Option 1** with a hard cap (e.g. $10–20/mo alert + ceiling). At LCAC's email volume the cost is negligible and the value (inbox triaged every morning) is the headline feature. If you want zero standing cost for now, **Option 2** is the safe interim and can upgrade to Option 1 later.

---

## Architecture (Option 1)

```
Inbound email ──> inbound parse webhook ──> edge function ──> draft with LLM ──> queued_replies table
                                                                                      │
Michelle opens CRM "Inbox" tab ──> reads draft ──> Approve / Edit / Discard ──────────┘
        │
   Approve ──> send via email API ──> mark sent + log interaction on the contact
```

**Pieces to build:**
1. **Mailbox connection.** Two clean options:
   - **Inbound-parse (simplest, mirrors the WSP setup):** forward LCAC mail to a parse webhook (Postmark inbound or similar) → edge function. Good for a shared inbox like info@/outreach@.
   - **Gmail API (OAuth):** if these are Google Workspace mailboxes and she wants true two-way sync. More setup (OAuth consent, token storage), more power.
2. **`queued_replies` table** on `lcac-crm` (incoming subject/from/body, generated draft, status: pending/approved/sent/discarded, links to a `contact`). Service-role only; staff read via the CRM.
3. **Drafting edge function** — calls the LLM with her **voice profile** + the incoming email + relevant CRM context (who is this contact, history). Writes the draft to `queued_replies`. Never sends.
4. **Approval UI** — a tab in the CRM admin app: list pending drafts, edit inline, **Approve & Send** / Discard. (The CRM UI being built now is where this lives.)
5. **Send + log** — on approve, send via the email API and log an `interaction` (type `email`) on the contact so the history is captured.
6. **Voice profile** — collect 20–50 of her sent emails to distill a short style guide (tone, sign-off, common phrasings). Stored once; fed into every draft.

## Guardrails (baked in)
- **Nothing sends without her explicit approval.** No auto-send, ever, in v1.
- **Hard spend cap** on the LLM key + usage logging (reuse the `system_costs` pattern).
- **Allowlist / safe categories** — optionally only auto-draft for certain sender types; skip anything sensitive.
- **PII stays in the locked-down `lcac-crm` project.** Drafts and contacts never exposed to anon.

## What's needed from you (the blockers)
1. Pick **Option 1 or 2** (and the monthly cap if Option 1).
2. Confirm the **mailboxes** (info@ / outreach@ / executivedirector@) and whether they're Google Workspace.
3. Decide **inbound-parse vs Gmail API**.
4. Provide/inject the secrets (LLM key, email-send key) — on-site, not in the repo.

## Estimated build (once decided)
- Table + drafting edge function + voice profile: ~half a day.
- Approval UI tab (extends the CRM app): ~half a day.
- Mailbox/inbound wiring + secrets + testing: ~half a day, partly on-site.
