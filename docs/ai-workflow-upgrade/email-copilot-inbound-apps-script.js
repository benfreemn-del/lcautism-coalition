/* =====================================================================
 * LCAC Email Co-Pilot — INBOUND Apps Script (forwards new email -> draft function)
 *
 * One copy per inbox. Paste into script.google.com signed in as that inbox's
 * Workspace account, set INBOX_NAME, add a time-based trigger (every 5 min)
 * on checkAndForwardNewEmails, and put WEBHOOK_SECRET in Script Properties.
 * ===================================================================== */

function checkAndForwardNewEmails() {
  var WEBHOOK_URL = "https://byxuapnhhuxekamgnwaf.supabase.co/functions/v1/draft-email-reply";
  var WEBHOOK_SECRET = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  var INBOX_NAME = "info"; // 'info' | 'outreach' | 'executivedirector' — set per account

  var threads = GmailApp.search("is:unread -label:ai-drafted", 0, 10);
  var label = GmailApp.getUserLabelByName("ai-drafted") || GmailApp.createLabel("ai-drafted");

  threads.forEach(function (thread) {
    var msg = thread.getMessages()[0];
    var from = msg.getFrom();
    var payload = {
      inbox: INBOX_NAME,
      from_email: (from.match(/<(.+)>/) || [])[1] || from,
      from_name: ((from.match(/^(.+?)\s*</) || [])[1] || "").trim(),
      subject: msg.getSubject(),
      body_text: msg.getPlainBody().slice(0, 3000),
      gmail_thread_id: thread.getId(),
      gmail_message_id: msg.getId()
    };

    var res = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      headers: { "x-webhook-secret": WEBHOOK_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    // Only label (so we don't re-process) if the draft was accepted.
    if (res.getResponseCode() === 200) {
      thread.addLabel(label);
    }
  });
}
