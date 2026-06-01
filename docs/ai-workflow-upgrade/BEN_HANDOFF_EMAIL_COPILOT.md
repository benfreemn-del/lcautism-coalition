# Ben Handoff — Email Co-Pilot (Tier 2)
**Status:** Scaffolded and ready to build. Needs your on-site session.
**Built so far:** schema SQL, edge function, this handoff.
**Est. time to finish:** ~1.5 days (can split across sessions)

---

## What this does when done

Every email that hits info@, outreach@, or executivedirector@ gets an AI draft
written in Michelle's voice and waiting in the CRM "Inbox" tab. She opens the CRM,
reads the draft, clicks Approve → it sends. That's it.

Nothing auto-sends. Ever. Michelle approves every reply.

---

## Files already built

| File | What it is |
|---|---|
| `docs/ai-workflow-upgrade/email-copilot-schema.sql` | Run this in Supabase SQL editor to create `queued_replies` + `system_costs` tables |
| `docs/ai-workflow-upgrade/email-copilot-edge-function.ts` | The Supabase edge function — deploy as `draft-email-reply` |
| `docs/ai-workflow-upgrade/email-copilot-plan.md` | Original architecture doc with all decisions |

---

## Step-by-step build order

### Step 1 — Anthropic API key (5 min, your console)
1. Go to console.anthropic.com → API Keys → Create Key
2. Name it `lcac-email-copilot`
3. **Set a hard $20/month spend limit** (Billing → Usage Limits)
4. Copy the key — you'll inject it in Step 4

### Step 2 — Run the schema (10 min, Supabase)
1. Open Supabase Dashboard → `lcac-crm` project
2. SQL Editor → paste contents of `email-copilot-schema.sql` → Run
3. Confirm `queued_replies` and `system_costs` tables appear in Table Editor

### Step 3 — Google Apps Script webhook (30 min, on-site)
This is what forwards Gmail → edge function. One script per inbox.

```javascript
// Paste this into script.google.com, connected to the info@ Workspace account
// Set a time-based trigger: runs every 5 minutes

function checkAndForwardNewEmails() {
  const WEBHOOK_URL = "https://byxuapnhhuxekamgnwaf.supabase.co/functions/v1/draft-email-reply";
  const WEBHOOK_SECRET = "YOUR_WEBHOOK_SECRET_HERE"; // set this in script properties
  const INBOX_NAME = "info"; // change to 'outreach' or 'executivedirector' for other inboxes

  const threads = GmailApp.search("is:unread -label:ai-drafted", 0, 10);

  threads.forEach(thread => {
    const msg = thread.getMessages()[0];
    const payload = {
      inbox: INBOX_NAME,
      from_email: msg.getFrom().match(/<(.+)>/)?.[1] || msg.getFrom(),
      from_name: msg.getFrom().match(/^(.+?)\s*</)?.[1]?.trim() || "",
      subject: msg.getSubject(),
      body_text: msg.getPlainBody().slice(0, 3000), // cap at 3000 chars
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: { "x-webhook-secret": WEBHOOK_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const res = UrlFetchApp.fetch(WEBHOOK_URL, options);
    if (res.getResponseCode() === 200) {
      // Label the thread so it doesn't get processed again
      let label = GmailApp.getUserLabelByName("ai-drafted");
      if (!label) label = GmailApp.createLabel("ai-drafted");
      thread.addLabel(label);
    }
  });
}
```

**Do this for all 3 inboxes** (info@, outreach@, executivedirector@) — separate
Apps Script projects, each with their own 5-min trigger and the correct `INBOX_NAME`.

### Step 4 — Deploy the edge function (15 min)
```bash
# From your machine with Supabase CLI installed
cd path/to/lcautism-coalition
supabase functions deploy draft-email-reply \
  --project-ref byxuapnhhuxekamgnwaf \
  --import-map ./docs/ai-workflow-upgrade/email-copilot-edge-function.ts

# Set secrets (do this BEFORE the function gets any real traffic)
supabase secrets set --project-ref byxuapnhhuxekamgnwaf \
  ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE \
  WEBHOOK_SECRET=make-up-a-long-random-string
```

Use the SAME `WEBHOOK_SECRET` value in the Apps Script (Step 3).

### Step 5 — Build the CRM Inbox tab (half day)
Add a new tab to `crm-admin/` that:
- Lists `queued_replies` where `status = 'pending'`, newest first
- Shows: from name, subject, received time, draft body
- Three buttons per row: **Approve & Send** | **Edit** | **Discard**
- On Approve: calls a `/send-reply` edge function (build this too — see below)
- Shows monthly cost from `system_costs` in a small footer chip

### Step 6 — Build the send-reply edge function (2 hours)
When Michelle clicks Approve, this function:
1. Sends the reply via Gmail API (or `edited_body` if she edited it)
2. Updates `queued_replies` status → `sent`, logs `sent_at` + `sent_message_id`
3. Creates an `interaction` record on the matching contact (type: `email`)

Gmail API send requires OAuth — use the same Workspace OAuth you set up in Step 3.

---

## Secrets checklist (inject on-site, never in repo)

| Secret | Where | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | Supabase edge function secrets | `sk-ant-...` (lcac-email-copilot key) |
| `WEBHOOK_SECRET` | Supabase + Apps Script properties | Any long random string — same in both places |
| Gmail OAuth tokens | Apps Script project properties | Set via `ScriptApp.getOAuthToken()` flow |

---

## Cost estimate at LCAC email volume

Assumes ~20 emails/day across all 3 inboxes using Claude Haiku:
- ~500 tokens in + ~200 tokens out per draft
- ~$0.0003 per draft
- 20 drafts/day × 30 days = **~$0.18/month**

Well under the $20 cap. The cap is there as a safety net, not an expectation.

---

## What Michelle sees when it's done

1. Opens CRM → clicks "Inbox" tab
2. Sees list of emails with draft replies already written
3. Reads draft, maybe tweaks a word
4. Clicks **Approve & Send**
5. Done — reply sent, interaction logged on the contact automatically

---

## Questions / blockers before on-site

- [ ] Confirm all 3 inboxes are Google Workspace (info@, outreach@, executivedirector@)
- [ ] Confirm you have access to Google Cloud Console for that Workspace
- [ ] Set the $20 hard cap on the API key BEFORE the on-site session
- [ ] Decide: build send-reply in same session or ship approve-UI first and add send later?
