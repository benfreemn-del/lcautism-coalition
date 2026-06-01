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

### 5. Inbound Apps Scripts — 20 min · script.google.com (×3 inboxes)
For **each** inbox (info@, outreach@, executivedirector@), signed in as that account:
1. New project at script.google.com → paste `email-copilot-inbound-apps-script.js`.
2. Set `INBOX_NAME` to `info` / `outreach` / `executivedirector`.
3. Project Settings → Script Properties → add `WEBHOOK_SECRET` = the same string from step 4.
4. Triggers → add a **time-based** trigger on `checkAndForwardNewEmails`, every 5 minutes.
5. Run once manually to approve the Gmail permission prompt.

### 6. Outbound Apps Scripts — 15 min · same 3 accounts
For **each** inbox (can be the same project as step 5, or a new one):
1. Paste `email-copilot-send-apps-script.js`, set `INBOX_NAME` to match.
2. Script Properties: `SUPABASE_URL` = `https://byxuapnhhuxekamgnwaf.supabase.co`, `SUPABASE_SERVICE_KEY` = the lcac-crm **service_role** key (Supabase → Settings → API).
3. Triggers → time-based on `sendApprovedReplies`, every 5 minutes.
4. Run once to approve the Gmail send permission.

### 7. Test end-to-end — 10 min
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
- **Decision:** you can ship steps 1–5 first (drafts appear, Michelle approves but nothing sends yet), then add step 6 later to turn on sending. Approve & Send just marks them "approved" until the outbound script exists.
