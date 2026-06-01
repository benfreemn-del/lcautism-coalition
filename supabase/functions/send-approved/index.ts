// ============================================================================
// send-approved — sends a reply ONLY for an APPROVED draft. Nothing else.
// ============================================================================
// This is the ONLY send path in the whole system, and it is gated three ways:
//   1. The caller must be an authenticated staff member (verify_jwt = true).
//   2. The draft must already be status='approved' (a human approved it in the
//      CRM Inbox/Drafts tab). A 'pending' draft is refused.
//   3. There is no "send without approval" branch anywhere — by design.
//
// Approving in the UI does NOT call this. This runs only when staff explicitly
// click "Send approved reply". So: AI drafts, human approves, human sends.
//
// Secrets (all via env, never hardcoded):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
//   EMAIL_PROVIDER_KEY + EMAIL_FROM          (you set these at setup)
//
// The actual outbound provider (Postmark / SendGrid / Gmail API / Resend) is a
// seam too — `sendEmail` below is a single, swappable function. Until a key is
// configured it returns an explicit "not configured" error rather than
// pretending to send. NO FAKE SUCCESS.
// ============================================================================

import { serviceClient } from "../_shared/db.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// --- Outbound seam. Swap the body for your chosen provider at setup time. ---
async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; providerId?: string; error?: string }> {
  const key = Deno.env.get("EMAIL_PROVIDER_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) {
    // Honest failure — we are a scaffold until the send key + from address are set.
    return { ok: false, error: "EMAIL_PROVIDER_KEY / EMAIL_FROM not configured" };
  }

  // TODO(setup): call your real provider here, e.g. Postmark:
  //   const resp = await fetch("https://api.postmarkapp.com/email", {
  //     method: "POST",
  //     headers: { "X-Postmark-Server-Token": key, "content-type": "application/json", accept: "application/json" },
  //     body: JSON.stringify({ From: from, To: opts.to, Subject: opts.subject, TextBody: opts.body }),
  //   });
  //   if (!resp.ok) return { ok: false, error: await resp.text() };
  //   return { ok: true, providerId: (await resp.json()).MessageID };

  return { ok: false, error: "send provider not implemented yet — see email-copilot-setup.md" };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- 1. Staff auth. The CRM passes the signed-in user's JWT. ---
  // With verify_jwt = true (config.toml), Supabase rejects unauthenticated
  // calls before we even run. We additionally read the user to be explicit.
  const sb = serviceClient();
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const staffEmail = userData.user.email ?? "unknown";

  let payload: { draft_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!payload.draft_id) return json({ error: "draft_id required" }, 400);

  // --- 2. The draft MUST be approved. ---
  const { data: draft, error: draftErr } = await sb
    .from("email_drafts")
    .select("*, email_messages(*)")
    .eq("id", payload.draft_id)
    .single();
  if (draftErr || !draft) return json({ error: "draft not found" }, 404);

  if (draft.status !== "approved") {
    return json(
      { error: "draft is not approved", status: draft.status, hint: "Approve it first." },
      409,
    );
  }
  if (draft.sent_at) {
    return json({ ok: true, already_sent: true, draft_id: draft.id });
  }

  const msg = draft.email_messages;
  const to = msg?.from_email;
  if (!to) return json({ error: "no recipient address on the original message" }, 422);

  // The approved text is the source of truth (captured at approval time).
  const finalBody = draft.approved_body ?? draft.edited_body ?? draft.draft_body;

  // --- 3. Send. ---
  const result = await sendEmail({ to, subject: draft.draft_subject || "Re: your message", body: finalBody });
  if (!result.ok) {
    return json({ error: "send failed", detail: result.error, draft_id: draft.id }, 502);
  }

  // Mark sent + log an interaction on the contact (history capture).
  const now = new Date().toISOString();
  await sb.from("email_drafts").update({ status: "sent", sent_at: now }).eq("id", draft.id);
  await sb.from("email_messages").update({ status: "replied" }).eq("id", msg.id);
  if (msg.contact_id) {
    await sb.from("interactions").insert({
      contact_id: msg.contact_id,
      type: "email",
      summary: `Replied: ${draft.draft_subject || "(no subject)"}`,
      occurred_at: now,
      created_by: staffEmail,
    });
  }

  return json({ ok: true, draft_id: draft.id, sent_at: now, provider_id: result.providerId });
});
