// ============================================================================
// draft-reply — inbound email -> AI draft (in Michelle's voice) -> stored.
// ============================================================================
// FLOW:
//   1. The active inbound provider authenticates + normalizes the request
//      (provider-agnostic seam — see _shared/inbound.ts).
//   2. We upsert the inbound email into `email_messages` (de-duped by provider
//      + provider_message_id).
//   3. We check the HARD MONTHLY SPEND CAP. If we're at/over it, we DO NOT call
//      the LLM — we mark the message 'skipped' with a reason and return. No spend.
//   4. Otherwise we ask the LLM for a reply in her voice, log the spend, and
//      store the draft in `email_drafts` with status 'pending'.
//
// THIS FUNCTION NEVER SENDS EMAIL. It only drafts and stores. Sending is a
// separate, staff-triggered function (`send-approved`) and only after approval.
//
// Secrets (all via env, never hardcoded):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected by Supabase)
//   LLM_API_KEY, LLM_MODEL, MONTHLY_USD_CAP  (you set these)
//   INBOUND_PROVIDER + provider auth secrets (you set these)
//
// Deploy with verify_jwt = false (see config.toml); this function does its OWN
// auth via the provider's verify() — exactly like the audited inbound-email fn.
// ============================================================================

import { serviceClient } from "../_shared/db.ts";
import { activeInboundParser, type NormalizedInbound } from "../_shared/inbound.ts";
import { checkSpendCap, generateDraft } from "../_shared/llm.ts";
import { buildDraftPrompt, VOICE_PROFILE_VERSION } from "../_shared/voice.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const parser = activeInboundParser();

  // --- 1. Provider-specific auth. Fail closed. ---
  let authed = false;
  try {
    authed = await parser.verify(req);
  } catch (_e) {
    authed = false;
  }
  if (!authed) return json({ error: "unauthorized" }, 401);

  // --- Parse + normalize the inbound email. ---
  let inbound: NormalizedInbound | null;
  try {
    inbound = await parser.parse(req);
  } catch (e) {
    return json({ error: "could not parse inbound email", detail: String(e) }, 400);
  }
  if (!inbound) return json({ ok: true, ignored: true });

  const sb = serviceClient();

  // --- 2. Upsert the message (de-dupe on provider + provider_message_id). ---
  const { data: msg, error: upsertErr } = await sb
    .from("email_messages")
    .upsert(
      {
        provider: inbound.provider,
        provider_message_id: inbound.providerMessageId,
        mailbox: inbound.mailbox,
        from_email: inbound.fromEmail,
        from_name: inbound.fromName,
        to_email: inbound.toEmail,
        subject: inbound.subject,
        body_text: inbound.bodyText,
        body_html: inbound.bodyHtml,
        received_at: inbound.receivedAt,
        status: "drafting",
      },
      { onConflict: "provider,provider_message_id", ignoreDuplicates: false },
    )
    .select()
    .single();

  if (upsertErr || !msg) {
    return json({ error: "could not store message", detail: upsertErr?.message }, 500);
  }

  // If this message already has a draft (re-delivery), don't spend again.
  const { count: existingDrafts } = await sb
    .from("email_drafts")
    .select("id", { count: "exact", head: true })
    .eq("message_id", msg.id);
  if ((existingDrafts ?? 0) > 0) {
    return json({ ok: true, message_id: msg.id, note: "draft already exists" });
  }

  // --- 3. HARD SPEND CAP CHECK. No call if we're at/over the cap. ---
  let cap;
  try {
    cap = await checkSpendCap(sb);
  } catch (e) {
    return json({ error: "cap check failed", detail: String(e) }, 500);
  }
  if (!cap.allowed) {
    // Log the skip on the message so it's visible in the Drafts tab. No spend.
    await sb
      .from("email_messages")
      .update({ status: "skipped", skip_reason: "monthly_cap_reached" })
      .eq("id", msg.id);
    console.log(
      `[draft-reply] SKIPPED message ${msg.id}: monthly cap reached ` +
        `($${cap.spent.toFixed(2)} / $${cap.cap.toFixed(2)}). No LLM call made.`,
    );
    return json({
      ok: true,
      skipped: true,
      reason: "monthly_cap_reached",
      spent_usd: cap.spent,
      cap_usd: cap.cap,
      message_id: msg.id,
    });
  }

  // --- 4. Draft in her voice. ---
  // TODO(setup): optionally pull CRM context for inbound.fromEmail (who is this
  // contact, prior interactions) and pass it as contactContext for richer drafts.
  const prompt = buildDraftPrompt({
    fromName: inbound.fromName,
    fromEmail: inbound.fromEmail,
    subject: inbound.subject,
    bodyText: inbound.bodyText,
  });

  let draft;
  try {
    draft = await generateDraft(prompt);
  } catch (e) {
    // Drafting failed — leave the message for staff to handle manually. No
    // partial spend is logged because the call did not succeed.
    await sb
      .from("email_messages")
      .update({ status: "skipped", skip_reason: "llm_error" })
      .eq("id", msg.id);
    console.error(`[draft-reply] LLM error on message ${msg.id}: ${String(e)}`);
    return json({ error: "drafting failed", detail: String(e), message_id: msg.id }, 502);
  }

  // Log the spend (backs the cap going forward).
  await sb.from("email_usage_log").insert({
    message_id: msg.id,
    model: draft.model,
    input_tokens: draft.inputTokens,
    output_tokens: draft.outputTokens,
    cost_usd: draft.costUsd,
  });

  // Store the draft — PENDING review. Nothing is sent.
  const replySubject = inbound.subject
    ? (/^re:/i.test(inbound.subject) ? inbound.subject : `Re: ${inbound.subject}`)
    : "Re: your message";

  const { data: savedDraft, error: draftErr } = await sb
    .from("email_drafts")
    .insert({
      message_id: msg.id,
      draft_subject: replySubject,
      draft_body: draft.text,
      status: "pending",
      model: draft.model,
      voice_profile_version: VOICE_PROFILE_VERSION,
    })
    .select()
    .single();

  if (draftErr) {
    return json({ error: "could not store draft", detail: draftErr.message }, 500);
  }

  await sb.from("email_messages").update({ status: "drafted" }).eq("id", msg.id);

  return json({
    ok: true,
    message_id: msg.id,
    draft_id: savedDraft.id,
    cost_usd: draft.costUsd,
    spent_this_month_usd: cap.spent + draft.costUsd,
    cap_usd: cap.cap,
  });
});
