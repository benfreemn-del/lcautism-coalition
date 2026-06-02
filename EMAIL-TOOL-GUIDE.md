# 📧 The Email Helper — plain-English guide

**For Michelle (and Ben).** This explains the email "co-pilot" that drafts replies
to LCAC emails in your voice, so you just review and send. If you're reading this
inside Claude Code, you can say *"walk me through the email helper"* and Claude
will use this file to guide you step by step.

---

## What it does (in one breath)

When an email comes into one of LCAC's inboxes (info@, outreach@, executivedirector@),
the helper reads it and writes a **draft reply in your voice** — warm, plain, signed
as you. The draft waits in your CRM for you to **read, tweak, and approve**. Nothing
is ever sent until you click **Approve & Send**. You're always in control.

It also **never makes up facts**. If it doesn't know a date, price, or phone number,
it leaves a `[blank in brackets]` for you to fill in.

There's a **$20-a-month spending cap** built in. If it's ever hit, the helper just
stops drafting for the rest of the month and tells you — it can't run up a bill.

---

## How you use it day to day

1. **Open your CRM:** https://lcautism-coalition.vercel.app/crm-admin/
   - Email: **benfreemn@gmail.com**   Password: **bluejay**
   - *(If you ever can't get in, hard-refresh with Ctrl+Shift+R, or text Ben.)*
2. Click the **Email Replies** tab. A number badge shows how many drafts are waiting.
3. Click a draft to read it. You'll see:
   - who the email is from and what they asked
   - the reply the helper wrote for you
4. **Edit anything you want** right there — fill in any `[bracket blanks]`, change the
   wording, whatever. It's your words now.
5. When it looks right, click **Approve & Send**. The reply goes out from that inbox.
   - Not happy with it? Click **Discard** and it goes away (you can always reply by hand).

That's the whole job: **read → tweak → Approve & Send.**

---

## What's already done ✅

- The drafting "brain" is built, deployed, and tested (it's written real drafts already).
- The CRM **Email Replies** tab is live.
- The $20/month cap is on.
- Your CRM login works.

## What's left (one-time, Ben does this) ⬜

The only missing piece is connecting LCAC's actual Gmail inboxes so real emails flow
in and approved replies go out. That's a one-time setup using **Google Apps Scripts**,
done once per inbox (info@, outreach@, executivedirector@).

Step-by-step instructions are in **`docs/ai-workflow-upgrade/email-copilot-setup.md`**
(Step 5). The short version:

1. Sign into Google as the inbox (e.g. info@lcautism.org) → **script.google.com** → New project.
2. Paste in the two ready-made scripts (in that same folder:
   `email-copilot-inbound-apps-script.js` and `email-copilot-send-apps-script.js`).
3. Set `INBOX_NAME` to match the inbox, and add three Script Properties:
   - `WEBHOOK_SECRET` — the shared secret (Ben has it)
   - `SUPABASE_URL` — `https://byxuapnhhuxekamgnwaf.supabase.co`
   - `SUPABASE_SERVICE_KEY` — the service_role key (Supabase → Settings → API)
4. Authorize it once, add two 5-minute triggers (`checkAndForwardNewEmails`,
   `sendApprovedReplies`), and repeat for the other two inboxes.

Once that's in, the loop is fully automatic: email arrives → draft appears in your tab
within ~5 minutes → you approve → it sends.

---

## If something seems off

- **No new drafts showing up?** The Gmail connection (above) may not be set up yet, or
  a trigger stopped. Text Ben.
- **A draft has a weird blank like `[phone number]`?** That's on purpose — just type the
  real info in before sending.
- **Worried about cost?** You can't overspend; the $20 cap stops it automatically.

When in doubt, open Claude Code and just ask — *"is the email helper working?"* — and it
can check for you.
