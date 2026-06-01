// ============================================================================
// drafts-api — staff-only read/edit/approve for the Inbox/Drafts CRM tab.
// ============================================================================
// WHY THIS EXISTS:
// The email_* tables are service-role-only (RLS-on, no policy, grants revoked
// from authenticated) because they hold inbound email bodies (PII). So the
// browser CANNOT read them directly with the anon/authenticated key — and that
// is the point (consistent with backend-review-snapshot.md). Instead the CRM
// calls THIS function, which:
//   1. verifies the signed-in staff JWT (verify_jwt = true), then
//   2. uses the service role to read/update the email tables.
//
// Actions (POST { action, ... }):
//   list                          -> messages awaiting review + their drafts
//   save_edit  { draft_id, body } -> store staff's edited text (status stays pending)
//   approve    { draft_id, body } -> mark APPROVED (ready, NOT sent). Captures final text.
//   discard    { draft_id }       -> discard the draft + archive the message
//
// NOTHING here sends email. Sending is the separate send-approved function and
// only runs on an explicit staff click after approval.
// ============================================================================

import { serviceClient } from "../_shared/db.ts";
import { monthlyCapUsd, spendThisMonthUsd } from "../_shared/llm.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const sb = serviceClient();

  // --- Staff auth (verify_jwt=true also enforces this at the edge). ---
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const staffEmail = userData.user.email ?? "unknown";

  let body: { action?: string; draft_id?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  switch (body.action) {
    case "list": {
      // Messages with a waiting draft + cap status for the header.
      const { data: messages, error } = await sb
        .from("email_messages")
        .select(
          "id, from_name, from_email, mailbox, subject, body_text, received_at, status, skip_reason, " +
            "email_drafts(id, draft_subject, draft_body, edited_body, status, created_at)",
        )
        .in("status", ["drafted", "skipped", "new", "drafting"])
        .order("received_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);

      const spent = await spendThisMonthUsd(sb).catch(() => 0);
      return json({
        ok: true,
        messages,
        cap: { spent_usd: spent, cap_usd: monthlyCapUsd() },
      });
    }

    case "save_edit": {
      if (!body.draft_id) return json({ error: "draft_id required" }, 400);
      const { error } = await sb
        .from("email_drafts")
        .update({ edited_body: body.body ?? "" })
        .eq("id", body.draft_id)
        .eq("status", "pending");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case "approve": {
      if (!body.draft_id) return json({ error: "draft_id required" }, 400);
      // Capture the final text staff approved (their edit, or the AI draft).
      const finalText = (body.body ?? "").trim();
      if (!finalText) return json({ error: "empty reply" }, 422);
      const { error } = await sb
        .from("email_drafts")
        .update({
          status: "approved",
          edited_body: finalText,
          approved_body: finalText,
          approved_by: staffEmail,
          approved_at: new Date().toISOString(),
        })
        .eq("id", body.draft_id)
        .eq("status", "pending"); // can only approve a pending draft
      if (error) return json({ error: error.message }, 500);
      // NOTE: approving does NOT send. send-approved is a separate explicit step.
      return json({ ok: true });
    }

    case "discard": {
      if (!body.draft_id) return json({ error: "draft_id required" }, 400);
      const { data: d, error: dErr } = await sb
        .from("email_drafts")
        .update({ status: "discarded" })
        .eq("id", body.draft_id)
        .select("message_id")
        .single();
      if (dErr) return json({ error: dErr.message }, 500);
      if (d?.message_id) {
        await sb.from("email_messages").update({ status: "archived" }).eq("id", d.message_id);
      }
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
});
