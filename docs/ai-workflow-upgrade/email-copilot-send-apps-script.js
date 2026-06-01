/* =====================================================================
 * LCAC Email Co-Pilot — OUTBOUND Apps Script (sends the replies Michelle approved)
 *
 * This replaces the fragile "send via Gmail API + OAuth inside an edge function"
 * idea. Apps Script already has native Gmail access, so sending here is trivial
 * and secure. One copy per inbox (same account as the inbound script for that
 * inbox). Add a time-based trigger (every 5 min) on sendApprovedReplies.
 *
 * Script Properties needed:
 *   SUPABASE_URL          https://byxuapnhhuxekamgnwaf.supabase.co
 *   SUPABASE_SERVICE_KEY  the lcac-crm service_role key (server-side only, safe here)
 * Set INBOX_NAME to match this account.
 * ===================================================================== */

function sendApprovedReplies() {
  var props = PropertiesService.getScriptProperties();
  var SUPABASE_URL = props.getProperty("SUPABASE_URL");
  var SERVICE_KEY = props.getProperty("SUPABASE_SERVICE_KEY");
  var INBOX_NAME = "info"; // 'info' | 'outreach' | 'executivedirector'

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
      if (thread) {
        thread.reply(body);
      } else {
        GmailApp.sendEmail(r.from_email, "Re: " + (r.subject || ""), body);
      }
      patch(base, r.id, auth, {
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_message_id: r.gmail_thread_id || ""
      });
    } catch (e) {
      // Put it back so a human notices; record why.
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
