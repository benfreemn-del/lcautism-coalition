// =====================================================================
// LCAC Email Co-Pilot — "draft-email-reply" Supabase Edge Function (v5)
//
// Deploy with verify_jwt = false: this endpoint is protected by WEBHOOK_SECRET,
// not a Supabase JWT, because Google Apps Script calls it.
//
// v5 adds:
//   - thread context (earlier messages in the same conversation)
//   - prior context (recent past emails with the same person)
//   - a learned "voice profile" from app_settings.voice_profile (falls back to
//     the default voice when not set)
// All new inputs are optional, so it stays backward-compatible.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const MONTHLY_USD_CAP = Number(Deno.env.get("MONTHLY_USD_CAP") ?? "20");
const MODEL = Deno.env.get("EMAIL_MODEL") ?? "claude-haiku-4-5";
const COST_IN_PER_MTOK = Number(Deno.env.get("COST_IN_PER_MTOK") ?? "1.0");
const COST_OUT_PER_MTOK = Number(Deno.env.get("COST_OUT_PER_MTOK") ?? "5.0");

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_VOICE = `You are drafting an email reply on behalf of Michelle, Executive Director of the Lewis County Autism Coalition (LCAC), a community nonprofit serving autistic individuals and their families in Lewis County, WA.

Write in her voice: warm, direct, plain English. Never clinical, never corporate. Use words like family, community, support, connect, belong, neighbors. Avoid jargon (stakeholders, leverage, synergy, best-in-class).

Rules:
- Write ONLY the reply body. No subject line, no email headers, no "Subject:".
- Keep it concise and friendly.
- Do NOT invent facts, dates, dollar amounts, addresses, or commitments you cannot verify. If a specific detail is needed, put it in [square brackets] for Michelle to fill in.
- Sign off warmly as Michelle, Lewis County Autism Coalition.
- This is a DRAFT for Michelle to review and approve before it is ever sent.`;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// v6: True for bulk / marketing / automated mail that should never get a drafted reply.
function looksBulk(fromEmail: string, fromName: string, subject: string, body: string): boolean {
  const sender = (fromEmail + " " + fromName).toLowerCase();
  const blob = (subject + " " + body).toLowerCase();
  if (/(^|[._\-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces|notifications?|newsletter|mailer|noreply)([._@\-]|$)/.test(sender)) return true;
  if (blob.includes("unsubscribe")) return true;
  if (blob.includes("view this email in your browser") || blob.includes("view in browser")) return true;
  if (blob.includes("manage your preferences") || blob.includes("manage preferences")) return true;
  if (blob.includes("you are receiving this") || blob.includes("you received this email")) return true;
  if (blob.includes("update your email preferences")) return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

  let p: Record<string, any>;
  try { p = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  const inbox = (p.inbox || "info").toString();
  const from_email = (p.from_email || "").toString();
  const from_name = (p.from_name || "").toString();
  const subject = (p.subject || "").toString();
  const body_text = (p.body_text || "").toString().slice(0, 3000);
  const gmail_thread_id = (p.gmail_thread_id || "").toString();
  const gmail_message_id = (p.gmail_message_id || "").toString();
  const thread = Array.isArray(p.thread) ? p.thread.slice(-6) : [];
  const prior = Array.isArray(p.prior) ? p.prior.slice(0, 3) : [];

  // Skip bulk / marketing / no-reply mail BEFORE spending any tokens.
  if (looksBulk(from_email, from_name, subject, body_text)) {
    return new Response(JSON.stringify({ ok: true, skipped: "bulk" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const month = monthKey();
  const { data: costRow } = await sb.from("system_costs").select("total_usd").eq("month", month).maybeSingle();
  const spent = costRow?.total_usd ? Number(costRow.total_usd) : 0;

  if (spent >= MONTHLY_USD_CAP) {
    await sb.from("queued_replies").insert({
      inbox, from_email, from_name, subject, body_text, gmail_thread_id, gmail_message_id,
      status: "pending",
      error: `Monthly AI cap ($${MONTHLY_USD_CAP}) reached — no draft generated.`,
      draft_body: "[Monthly draft limit reached — please write this reply by hand.]",
    });
    return new Response(JSON.stringify({ ok: true, capped: true }), { status: 200 });
  }

  let contact_id: string | null = null;
  if (from_email) {
    const { data: contact } = await sb.from("contacts").select("id").eq("email", from_email).maybeSingle();
    contact_id = contact?.id ?? null;
  }

  // Voice profile learned from Michelle's real emails; falls back to the default voice.
  const { data: vp } = await sb.from("app_settings").select("value").eq("key", "voice_profile").maybeSingle();
  const voice = (vp?.value && vp.value.trim()) ? vp.value : DEFAULT_VOICE;

  // Context block: the rest of this thread + recent past emails with this person.
  let ctx = "";
  if (thread.length) {
    ctx += "\n\n--- EARLIER MESSAGES IN THIS THREAD (oldest first) ---\n" +
      thread.map((m: any) => `From: ${m.from || "?"}\n${(m.body || "").toString().slice(0, 1500)}`).join("\n\n");
  }
  if (prior.length) {
    ctx += "\n\n--- PAST EMAILS WITH THIS PERSON (older context, may not be relevant) ---\n" +
      prior.map((m: any) => `(${m.date || ""}) ${m.subject || ""}\n${(m.body || "").toString().slice(0, 800)}`).join("\n\n");
  }

  const userMsg =
    `An email arrived in the ${inbox}@ inbox.\nFrom: ${from_name} <${from_email}>\nSubject: ${subject}\n\n${body_text}` +
    ctx +
    `\n\nWrite a reply Michelle can review. Use the context above so the reply is accurate and personal, but do NOT invent any fact, date, amount, or promise that isn't supported by it — use [brackets] for anything you can't verify.`;

  let draft = "", tokens_in = 0, tokens_out = 0, cost = 0, errMsg: string | null = null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: voice, messages: [{ role: "user", content: userMsg }] }),
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

  await sb.from("queued_replies").insert({
    inbox, from_email, from_name, subject, body_text, gmail_thread_id, gmail_message_id, contact_id,
    draft_body: draft, status: "pending", tokens_in, tokens_out, cost_usd: Number(cost.toFixed(5)), error: errMsg,
  });
  if (cost > 0) await sb.rpc("increment_email_cost", { p_month: month, p_cost: Number(cost.toFixed(5)) });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
});
