/* =====================================================================
 * LCAC Email Co-Pilot — VOICE HARVESTER (run ONCE, in Michelle's account)
 *
 * Purpose: learn how Michelle actually writes, so the drafter sounds like HER.
 * This collects a sample of her SENT emails into a private Google Doc in her
 * own Drive. Ben/Claude then read that Doc and distill a short "voice profile"
 * (a style guide) — after which the Doc can be deleted. The raw mail never has
 * to live in any database.
 *
 * How to use:
 *   1. Sign into Google as Michelle (executivedirector@lcautism.org).
 *   2. script.google.com -> New project -> paste this in.
 *   3. Run buildVoiceSample -> authorize when prompted.
 *   4. Check the execution log for the new Doc's link (also in her Drive,
 *      named "LCAC voice sample (for Claude) - <date>").
 *   5. Send that Doc's text to Ben/Claude to build the voice profile.
 * ===================================================================== */

function buildVoiceSample() {
  var MAX_THREADS = 200;            // how many recent sent threads to scan
  var me = (Session.getActiveUser().getEmail() || "").toLowerCase();

  var doc = DocumentApp.create(
    "LCAC voice sample (for Claude) - " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")
  );
  var body = doc.getBody();
  body.appendParagraph("Sample of Michelle's sent emails — for building her voice profile.");
  body.appendParagraph("Generated " + new Date());
  body.appendParagraph("------------------------------------------------------------");

  var threads = GmailApp.search("in:sent", 0, MAX_THREADS);
  var count = 0;

  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      // Keep only messages SHE actually sent.
      if (me && m.getFrom().toLowerCase().indexOf(me) === -1) return;

      var text = m.getPlainBody() || "";
      // Drop quoted reply history (lines that start with ">").
      text = text.split("\n").filter(function (l) { return l.indexOf(">") !== 0; }).join("\n").trim();
      if (text.length < 25) return; // skip one-liners / empties

      count++;
      body.appendParagraph("### EMAIL " + count + " — subject: " + (m.getSubject() || "(no subject)"));
      body.appendParagraph(text.slice(0, 2500));
      body.appendParagraph("------------------------------------------------------------");
    });
  });

  doc.saveAndClose();
  Logger.log("Done. Wrote " + count + " sent emails to: " + doc.getUrl());
}
