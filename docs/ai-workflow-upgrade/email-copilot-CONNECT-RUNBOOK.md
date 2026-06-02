# 🔌 Connect LCAC email — runbook for Claude (with Chrome connected)

**For Michelle to start:** open Claude Code on your computer and say:
> "Connect my LCAC email — follow the connect runbook."

**For Claude reading this:** You are driving Michelle's own Chrome (she's not
technical). Your job is to set up Google Apps Script in **each** of her three
inboxes so emails flow into the CRM and approved replies send back out. Go slowly,
take a screenshot after each major step to confirm it worked, and **stop and ask
the human** at the two points marked 🧍 HUMAN below. Do all three inboxes:
`info`, `outreach`, `executivedirector`.

---

## Values to use
- **WEBHOOK_SECRET:** `38c81d040b09d965fb34f0c74e92f831e6fcff21244853ae6cf0314b744ebe84`
- **SUPABASE_URL:** `https://byxuapnhhuxekamgnwaf.supabase.co`
- **SUPABASE_SERVICE_KEY:** 🧍 HUMAN must provide this (it's a secret). Ask Ben for the
  lcac-crm **service_role** key, or get it from Supabase → lcac-crm → Settings → API.
  Do not guess it. Do not commit it anywhere.
- **The script to paste:** the file `email-copilot-combined-Code.gs` in this folder.

---

## Do this for EACH inbox (`info@`, then `outreach@`, then `executivedirector@`)

> ⚠️ Before starting an inbox, **confirm which Google account is signed in.**
> Take a screenshot of the top-right Google avatar and ask the human to confirm
> it's the correct inbox. The #1 failure is setting up the wrong account.

1. Open a new tab to **https://script.google.com** → click **New project**.
2. In the code editor, **select all and delete** the sample code, then **paste the
   entire contents of `email-copilot-combined-Code.gs`.**
3. Change the line near the top to match this inbox:
   `var INBOX_NAME = "info";` → use `"outreach"` or `"executivedirector"` as appropriate.
4. Open **Project Settings** (the ⚙️ gear, left sidebar) → scroll to **Script
   Properties** → **Add script property** three times:
   - `WEBHOOK_SECRET` = the value above
   - `SUPABASE_URL` = `https://byxuapnhhuxekamgnwaf.supabase.co`
   - `SUPABASE_SERVICE_KEY` = 🧍 HUMAN: paste the service_role key here
   Save.
5. Back in the **Editor**, save the project (Ctrl/Cmd+S). In the function dropdown
   choose **checkAndForwardNewEmails** and click **Run**.
6. 🧍 **HUMAN STEP — the permission screen.** Google will pop up an authorization
   window. A person needs to click through it: **Choose this inbox's account →
   Advanced → "Go to (project) (unsafe)" → Allow.** (This is normal and safe — it's
   her own script.) Tell the human exactly what to click and wait for them.
7. Run **sendApprovedReplies** once too (it should not need the scary screen again).
8. Open **Triggers** (the ⏰ clock, left sidebar) → **Add Trigger**:
   - Function **checkAndForwardNewEmails** · Time-driven · Minutes timer · **Every 5 minutes** → Save
   - **Add Trigger** again → Function **sendApprovedReplies** · Time-driven · **Every 5 minutes** → Save
9. Confirm two triggers are listed. That inbox is done. Move to the next one.

---

## When all three are done — test it
1. From a phone or another address, send a short email to **info@lcautism.org**.
2. Wait ~5 minutes (or in the script editor, run **checkAndForwardNewEmails** manually).
3. Open the CRM → **Email Replies** tab → a new draft should appear.
4. Approve it; within ~5 minutes the reply should arrive at the sender.

If anything doesn't work, check the script editor's **Executions** panel (left
sidebar) for a red error and report it.

---

## If Chrome automation gets stuck
script.google.com is a heavy app. If you (Claude) can't reliably find a button or
paste into the editor, **don't force it** — take a screenshot, tell the human the
exact click to make, and continue once they confirm. Getting it right matters more
than doing every click yourself.
