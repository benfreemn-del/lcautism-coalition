/* =====================================================================
 * LCAC Email Co-Pilot — COMBINED Apps Script for ONE inbox (inbound + send).
 *
 * Paste this WHOLE file into a new script.google.com project, signed in as the
 * inbox account. Set INBOX_NAME below, add the 3 Script Properties, run once to
 * authorize, then add two 5-minute triggers:
 *   - checkAndForwardNewEmails
 *   - sendApprovedReplies
 *
 * Script Properties needed:
 *   WEBHOOK_SECRET        (provided)
 *   SUPABASE_URL          https://byxuapnhhuxekamgnwaf.supabase.co
 *   SUPABASE_SERVICE_KEY  lcac-crm service_role key (secret; server-side only, safe here)
 * ===================================================================== */

// >>> SET THIS to match the account: "info" | "outreach" | "executivedirector"
var INBOX_NAME = "info";

var WEBHOOK_URL = "https://byxuapnhhuxekamgnwaf.supabase.co/functions/v1/draft-email-reply";

/* ---- INBOUND: new email -> ask the drafter for a reply ---- */
function checkAndForwardNewEmails() {
  var WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  // category:primary skips Gmail's Promotions/Social/Updates tabs (marketing, newsletters).
  var threads = GmailApp.search("is:unread -label:ai-drafted category:primary", 0, 10);
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
    } catch (e) { /* prior context is best-effort */ }

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

/* ---- OUTBOUND: send the replies Michelle approved in the CRM ---- */
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
