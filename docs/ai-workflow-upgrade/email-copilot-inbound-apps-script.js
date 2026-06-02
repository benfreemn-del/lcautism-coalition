/* =====================================================================
 * LCAC Email Co-Pilot — INBOUND Apps Script (forwards new email -> draft function)
 *
 * One copy per inbox. Paste into script.google.com signed in as that inbox's
 * Workspace account, set INBOX_NAME, add a time-based trigger (every 5 min)
 * on checkAndForwardNewEmails, and put WEBHOOK_SECRET in Script Properties.
 *
 * v2: now also sends (a) the earlier messages in the same thread and (b) recent
 * past emails with the same person, so the draft is accurate and personal.
 * ===================================================================== */

function checkAndForwardNewEmails() {
  var WEBHOOK_URL = "https://byxuapnhhuxekamgnwaf.supabase.co/functions/v1/draft-email-reply";
  var WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  var INBOX_NAME = "info"; // 'info' | 'outreach' | 'executivedirector' — set per account

  var threads = GmailApp.search("is:unread -label:ai-drafted", 0, 10);
  var label = GmailApp.getUserLabelByName("ai-drafted") || GmailApp.createLabel("ai-drafted");

  threads.forEach(function (thread) {
    var msgs = thread.getMessages();
    var msg = msgs[msgs.length - 1];                 // newest message in the thread
    var from = msg.getFrom();
    var fromEmail = (from.match(/<(.+)>/) || [])[1] || from;

    // (a) Earlier messages in THIS thread — the conversation so far.
    var threadCtx = [];
    for (var i = 0; i < msgs.length - 1; i++) {
      threadCtx.push({ from: msgs[i].getFrom(), body: msgs[i].getPlainBody().slice(0, 1500) });
    }

    // (b) Recent PAST emails with this same person, from other threads.
    var prior = [];
    try {
      var hist = GmailApp.search('(from:' + fromEmail + ' OR to:' + fromEmail + ')', 0, 6);
      for (var h = 0; h < hist.length && prior.length < 3; h++) {
        if (hist[h].getId() === thread.getId()) continue; // skip the current thread
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

    // Only label (so we don't re-process) if the draft was accepted.
    if (res.getResponseCode() === 200) thread.addLabel(label);
  });
}
