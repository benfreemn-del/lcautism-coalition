# Email Co-Pilot — Ben's Manual Checklist

Everything that needs a human (you) is here, in order. All the **code is already written and in this repo** — your part is keys, clicks, and pasting. Budget ~1–1.5 hrs, mostly Google Workspace setup. Do it once.

**How it works when done:** new email → an Apps Script forwards it to a Supabase function → the function drafts a reply in Michelle's voice → it appears in the CRM's **"Email Replies"** tab → Michelle reads/edits → clicks **Approve & Send** → a second Apps Script sends it from the real mailbox. **Nothing ever auto-sends.**

---

## What's already built (no action needed)
| File | Role |
|---|---|
| `email-copilot-schema.sql` | Creates `queued_replies` + `system_costs` tables, locked down |
| `email-copilot-edge-function.ts` | The `draft-email-reply` function (drafts + cap check) |
| `email-copilot-inbound-apps-script.js` | Forwards new Gmail → the function (1 per inbox) |
| `email-copilot-send-apps-script.js` | Sends approved replies from the mailbox (1 per inbox) |
| `crm-admin/` **Email Replies** tab | Where Michelle reviews/approves (already wired in) |

---

## Your steps

### 1. Anthropic API key — 5 min · console.anthropic.com
1. API Keys → **Create Key**, name it `lcac-email-copilot`.
2. Billing → Usage Limits → **set a hard $20/month cap**.
3. Copy the key (`sk-ant-...`) — used in step 4.

### 2. Run the database schema — 5 min · Supabase
1. Supabase Dashboard → **lcac-crm** → SQL Editor.
2. Paste all of `email-copilot-schema.sql` → **Run**.
3. Confirm `queued_replies` and `system_costs` show up in the Table Editor.

### 3. Deploy the draft function — 10 min · your machine (Supabase CLI)
```bash
cd path/to/lcautism-coalition
# copy the function into place (Supabase expects functions/<name>/index.ts)
mkdir -p supabase/functions/draft-email-reply
cp docs/ai-workflow-upgrade/email-copilot-edge-function.ts supabase/functions/draft-email-reply/index.ts

# deploy WITHOUT jwt check (it's protected by WEBHOOK_SECRET instead)
supabase functions deploy draft-email-reply --project-ref byxuapnhhuxekamgnwaf --no-verify-jwt
```

### 4. Set the secrets — 5 min · Supabase CLI
Pick any long random string for `WEBHOOK_SECRET` (you'll reuse it in step 5).
```bash
supabase secrets set --project-ref byxuapnhhuxekamgnwaf \
  ANTHROPIC_API_KEY=sk-ant-YOUR-KEY \
  WEBHOOK_SECRET=your-long-random-string \
  MONTHLY_USD_CAP=20
```

### 5. Apps Scripts — 25 min · script.google.com (one project per inbox)
Do this **once per inbox** (info@, outreach@, executivedirector@), signed in as that account. Both scripts go in the **same** project — that's 3 projects total, not 6.
1. New project at script.google.com.
2. Paste **both** `email-copilot-inbound-apps-script.js` and `email-copilot-send-apps-script.js` into it (no conflicts — different function names).
3. Set `INBOX_NAME` to `info` / `outreach` / `executivedirector` in **both** functions.
4. Project Settings → Script Properties → add all three:
   - `WEBHOOK_SECRET` = the same string from step 4
   - `SUPABASE_URL` = `https://byxuapnhhuxekamgnwaf.supabase.co`
   - `SUPABASE_SERVICE_KEY` = the lcac-crm **service_role** key (Supabase → Settings → API)
5. Triggers → add **two** time-based triggers (every 5 min): one on `checkAndForwardNewEmails`, one on `sendApprovedReplies`.
6. Run each function once to approve the Gmail permission prompts.

### 6. Test end-to-end — 10 min
1. Send a test email to info@.
2. Within ~5 min it appears in the CRM **Email Replies** tab with a draft.
3. Edit a word, click **Approve & Send** → within ~5 min the reply lands in your test inbox, sent from info@.
4. CRM shows the monthly cost (should be a fraction of a cent).

---

## Secrets you'll create (never commit these)
| Secret | Where it lives |
|---|---|
| `ANTHROPIC_API_KEY` | Supabase function secret |
| `WEBHOOK_SECRET` | Supabase function secret **and** each inbound Apps Script |
| `SUPABASE_SERVICE_KEY` | each outbound Apps Script (server-side only) |
| `MONTHLY_USD_CAP` | Supabase function secret (default 20) |

## Notes
- **Cost:** ~$0.18/month at LCAC volume (Haiku). The $20 cap is a safety net, not an expectation.
- **Confirm before you start:** all 3 inboxes are Google Workspace, and you have access to each account to add Apps Scripts.
- **Drafts-only first (optional):** to start with drafts only — Michelle reviews and approves, but nothing sends yet — just skip the `sendApprovedReplies` trigger in step 5. Approved replies queue up safely until you add it.
