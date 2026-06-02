# 🔌 CONNECT THE LCAC EMAIL HELPER — drop this whole file into Claude Code

**Michelle:** Don't read all of this. Just **drag this file into Claude Code**
(or open it, select all, copy, and paste it into the chat) and type:

> "Do what this file says — connect my email."

Then follow what Claude tells you on the screen. Keep Ben on the phone.

---

**Claude — read carefully.** This file is **self-contained**: you do NOT need any
repository, project folder, or other files. Everything you need is below.

You are driving **Michelle's own Chrome** (she is not technical). Your job: set up
Google Apps Script in **each** of her three inboxes — `info@`, `outreach@`,
`executivedirector@` — so new emails flow into the LCAC CRM and approved replies
send back out. Work one inbox at a time. Take a screenshot after each major step to
confirm it worked. **STOP and ask the human** at the two points marked 🧍 HUMAN.

## Values to use
- **WEBHOOK_SECRET:** `38c81d040b09d965fb34f0c74e92f831e6fcff21244853ae6cf0314b744ebe84`
- **SUPABASE_URL:** `https://byxuapnhhuxekamgnwaf.supabase.co`
- **SUPABASE_SERVICE_KEY:** 🧍 HUMAN must provide — ask Ben for the lcac-crm
  **service_role** key (Supabase → lcac-crm → Settings → API). Never guess it; never
  save it anywhere except the Script Property in step 4.

## ⚠️ Before each inbox
Confirm which Google account is signed in (screenshot the top-right Google avatar
and ask the human to confirm it's the right inbox). **Setting up the wrong account
is the #1 mistake.**

## Steps — do ALL of this for each inbox (`info`, then `outreach`, then `executivedirector`)
1. Open a new tab to **https://script.google.com** → click **New project**.
2. In the code editor, **select all, delete**, then paste **the entire script in the
   "SCRIPT TO PASTE" section at the bottom of this file.**
3. Change the line near the top of that script to match this inbox:
   `var INBOX_NAME = "info";`  → use `"outreach"` or `"executivedirector"`.
4. Open **Project Settings** (⚙️ gear, left sidebar) → **Script Properties** →
   **Add script property** three times:
   - `WEBHOOK_SECRET` = the value above
   - `SUPABASE_URL` = `https://byxuapnhhuxekamgnwaf.supabase.co`
   - `SUPABASE_SERVICE_KEY` = 🧍 HUMAN: paste the service_role key here
   Save.
5. Back in the **Editor**, save (Ctrl/Cmd+S). Choose **checkAndForwardNewEmails** in
   the function dropdown → **Run**.
6. 🧍 **HUMAN STEP — permission screen.** Google pops up an authorization window. A
   person clicks: **choose this inbox's account → Advanced → "Go to (project)
   (unsafe)" → Allow.** (Normal and safe — it's her own script.) Tell the human
   exactly what to click and wait.
7. Run **sendApprovedReplies** once too (usually no scary screen the second time).
8. Open **Triggers** (⏰ clock, left sidebar) → **Add Trigger**:
   - **checkAndForwardNewEmails** · Time-driven · Minutes timer · **Every 5 minutes** → Save
   - **Add Trigger** again → **sendApprovedReplies** · Time-driven · **Every 5 minutes** → Save
9. Confirm two triggers are listed. Done — move to the next inbox.

## When all three are done — test
1. From a phone, email **info@lcautism.org**.
2. Wait ~5 min (or run **checkAndForwardNewEmails** manually in the editor).
3. Open the CRM → **Email Replies** tab → the draft should appear.
4. Approve it; the reply should arrive at the sender within ~5 min.

## If Chrome automation gets stuck
script.google.com is a heavy app. If you can't reliably click something or paste
into the editor, **don't force it** — screenshot it, tell the human the exact click
to make, and continue once they confirm.

---

# ===================  SCRIPT TO PASTE  ===================
# Paste everything between the lines below into the Apps Script editor.
# ---------------------------------------------------------

```javascript
// LCAC Email Co-Pilot — combined script for ONE inbox (inbound + send).

// >>> SET THIS to match the account: "info" | "outreach" | "executivedirector"
var INBOX_NAME = "info";

var WEBHOOK_URL = "https://byxuapnhhuxekamgnwaf.supabase.co/functions/v1/draft-email-reply";

function checkAndForwardNewEmails() {
  var WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  var threads = GmailApp.search("is:unread -label:ai-drafted", 0, 10);
  var label = GmailApp.getUserLabelByName("ai-drafted") || GmailApp.createLabel("ai-drafted");

  threads.forEach(function (thread) {
    var msgs = thread.getMessages();
    var msg = msgs[msgs.length - 1];
    var from = msg.getFrom();
    var fromEmail = (from.match(/<(.+)>/) || [])[1] || from;

    var threadCtx = [];
    for (var i = 0; i < msgs.length - 1; i++) {
      threadCtx.push({ from: msgs[i].getFrom(), body: msgs[i].getPlainBody().slice(0, 1500) });
    }

    var prior = [];
    try {
      var hist = GmailApp.search('(from:' + fromEmail + ' OR to:' + fromEmail + ')', 0, 6);
      for (var h = 0; h < hist.length && prior.length < 3; h++) {
        if (hist[h].getId() === thread.getId()) continue;
        var hm = hist[h].getMessages();
        var last = hm[hm.length - 1];
        prior.push({
          date: Utilities.formatDate(last.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
          subject: hist[h].getFirstMessageSubject(),
          body: last.getPlainBody().slice(0, 800)
        });
      }
    } catch (e) { /* best-effort */ }

    var payload = {
      inbox: INBOX_NAME,
      from_email: fromEmail,
      from_name: ((from.match(/^(.+?)\s*</) || [])[1] || "").trim(),
      subject: msg.getSubject(),
      body_text: msg.getPlainBody().slice(0, 3000),
      gmail_thread_id: thread.getId(),
      gmail_message_id: msg.getId(),
      thread: threadCtx,
      prior: prior
    };

    var res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      headers: { "x-webhook-secret": WEBHOOK_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) thread.addLabel(label);
  });
}

function sendApprovedReplies() {
  var props = PropertiesService.getScriptProperties();
  var SUPABASE_URL = props.getProperty("SUPABASE_URL");
  var SERVICE_KEY = props.getProperty("SUPABASE_SERVICE_KEY");
  var base = SUPABASE_URL + "/rest/v1/queued_replies";
  var auth = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

  var res = UrlFetchApp.fetch(
    base + "?status=eq.approved&inbox=eq." + INBOX_NAME + "&select=*",
    { headers: auth, muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return;

  JSON.parse(res.getContentText()).forEach(function (r) {
    var body = r.edited_body || r.draft_body || "";
    if (!body) return;
    try {
      var thread = r.gmail_thread_id ? GmailApp.getThreadById(r.gmail_thread_id) : null;
      if (thread) thread.reply(body);
      else GmailApp.sendEmail(r.from_email, "Re: " + (r.subject || ""), body);
      patch(base, r.id, auth, {
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_message_id: r.gmail_thread_id || ""
      });
    } catch (e) {
      patch(base, r.id, auth, { status: "pending", error: String(e).slice(0, 300) });
    }
  });
}

function patch(base, id, auth, fields) {
  UrlFetchApp.fetch(base + "?id=eq." + id, {
    method: "patch",
    contentType: "application/json",
    headers: Object.assign({ Prefer: "return=minimal" }, auth),
    payload: JSON.stringify(fields),
    muteHttpExceptions: true
  });
}
```
