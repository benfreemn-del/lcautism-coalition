// =====================================================================
// LCAC Email Co-Pilot — "draft-email-reply" Supabase Edge Function
//
// Deploy (note --no-verify-jwt: this endpoint is protected by WEBHOOK_SECRET,
// not a Supabase JWT, because Google Apps Script calls it):
//
//   supabase functions deploy draft-email-reply \
//     --project-ref byxuapnhhuxekamgnwaf --no-verify-jwt
//
// Secrets it needs (set with `supabase secrets set ...`):
//   ANTHROPIC_API_KEY   - your lcac-email-copilot key (with the $20 cap on it)
//   WEBHOOK_SECRET      - long random string; must match the Apps Script
//   MONTHLY_USD_CAP     - optional, default 20
//   EMAIL_MODEL         - optional, default 'claude-haiku-4-5'
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// What it does: receives one incoming email -> checks the monthly cap ->
// drafts a reply in Michelle's voice -> stores it in queued_replies as
// 'pending'. It NEVER sends anything.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const MONTHLY_USD_CAP = Number(Deno.env.get("MONTHLY_USD_CAP") ?? "20");
const MODEL = Deno.env.get("EMAIL_MODEL") ?? "claude-haiku-4-5";

// Approximate Haiku pricing (USD per million tokens). Verify against your plan;
// the hard cap is the real safety net.
const COST_IN_PER_MTOK = Number(Deno.env.get("COST_IN_PER_MTOK") ?? "1.0");
const COST_OUT_PER_MTOK = Number(Deno.env.get("COST_OUT_PER_MTOK") ?? "5.0");

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VOICE = `You are drafting an email reply on behalf of Michelle, Executive Director of the Lewis County Autism Coalition (LCAC), a community nonprofit serving autistic individuals and their families in Lewis County, WA.

Write in her voice: warm, direct, plain English. Never clinical, never corporate. Use words like family, community, support, connect, belong, neighbors. Avoid jargon (stakeholders, leverage, synergy, best-in-class).

Rules:
- Write ONLY the reply body. No subject line, no email headers, no "Subject:".
- Keep it concise and friendly.
- Do NOT invent facts, dates, dollar amounts, addresses, or commitments you cannot verify. If a specific detail is needed, put it in [square brackets] for Michelle to fill in.
- Sign off warmly as Michelle, Lewis County Autism Coalition.
- This is a DRAFT for Michelle to review and approve before it is ever sent.`;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let p: Record<string, string>;
  try {
    p = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const inbox = (p.inbox || "info").toString();
  const from_email = (p.from_email || "").toString();
  const from_name = (p.from_name || "").toString();
  const subject = (p.subject || "").toString();
  const body_text = (p.body_text || "").toString().slice(0, 3000);
  const gmail_thread_id = (p.gmail_thread_id || "").toString();
  const gmail_message_id = (p.gmail_message_id || "").toString();

  const month = monthKey();

  // ---- monthly cap check ----
  const { data: costRow } = await sb
    .from("system_costs").select("total_usd").eq("month", month).maybeSingle();
  const spent = costRow?.total_usd ? Number(costRow.total_usd) : 0;

  if (spent >= MONTHLY_USD_CAP) {
    await sb.from("queued_replies").insert({
      inbox, from_email, from_name, subject, body_text,
      gmail_thread_id, gmail_message_id,
      status: "skipped",
      error: `Monthly AI cap ($${MONTHLY_USD_CAP}) reached — no draft generated.`,
      draft_body: "[Monthly draft limit reached. Please write this reply manually.]",
    });
    return new Response(JSON.stringify({ ok: true, skipped: "cap" }), { status: 200 });
  }

  // ---- try to match a known contact ----
  let contact_id: string | null = null;
  if (from_email) {
    const { data: contact } = await sb
      .from("contacts").select("id").eq("email", from_email).maybeSingle();
    contact_id = contact?.id ?? null;
  }

  // ---- draft the reply ----
  let draft = "";
  let tokens_in = 0, tokens_out = 0, cost = 0, errMsg: string | null = null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: VOICE,
        messages: [{
          role: "user",
          content: `An email arrived in the ${inbox}@ inbox.\nFrom: ${from_name} <${from_email}>\nSubject: ${subject}\n\n${body_text}\n\nWrite a reply Michelle can review.`,
        }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Anthropic ${resp.status}`);
    draft = data?.content?.[0]?.text ?? "";
    tokens_in = data?.usage?.input_tokens ?? 0;
    tokens_out = data?.usage?.output_tokens ?? 0;
    cost = (tokens_in / 1e6) * COST_IN_PER_MTOK + (tokens_out / 1e6) * COST_OUT_PER_MTOK;
  } catch (e) {
    errMsg = String(e).slice(0, 300);
    draft = "[The AI draft could not be generated. Please write this reply manually.]";
  }

  // ---- store the draft (always pending; never lose an email) ----
  await sb.from("queued_replies").insert({
    inbox, from_email, from_name, subject, body_text,
    gmail_thread_id, gmail_message_id, contact_id,
    draft_body: draft,
    status: "pending",
    tokens_in, tokens_out,
    cost_usd: Number(cost.toFixed(5)),
    error: errMsg,
  });

  // ---- record spend ----
  if (cost > 0) {
    await sb.rpc("increment_email_cost", { p_month: month, p_cost: Number(cost.toFixed(5)) });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
