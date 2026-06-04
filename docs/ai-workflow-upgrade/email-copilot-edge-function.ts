// =====================================================================
// LCAC Email Co-Pilot — "draft-email-reply" Supabase Edge Function (v8)
//
// Deploy with verify_jwt = false (protected by WEBHOOK_SECRET).
//
// Layers, in order:
//   v6  - junk/bulk filter (skip no-reply / unsubscribe / marketing) BEFORE spending tokens
//   v5  - thread + prior-email context
//   v7  - knowledge base + voice from app_settings (prompt-cached); learn-from-edits
//         (recent sent replies as live style examples); auto-capture sender as a CRM
//         contact; importance/sensitivity flag (still drafts, just highlighted)
//   v8  - auto-capture writes first_name/last_name (full_name is a generated column)
// All extra inputs are optional, so it stays backward-compatible.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const MONTHLY_USD_CAP = Number(Deno.env.get("MONTHLY_USD_CAP") ?? "20");
const MODEL = Deno.env.get("EMAIL_MODEL") ?? "claude-haiku-4-5";
const COST_IN_PER_MTOK = Number(Deno.env.get("COST_IN_PER_MTOK") ?? "1.0");
const COST_OUT_PER_MTOK = Number(Deno.env.get("COST_OUT_PER_MTOK") ?? "5.0");
const CACHE_WRITE_MULT = 1.25, CACHE_READ_MULT = 0.1;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const DEFAULT_VOICE = `You are drafting an email reply on behalf of Michelle, Executive Director of the Lewis County Autism Coalition (LCAC), a community nonprofit serving autistic individuals and their families in Lewis County, WA.

Write in her voice: warm, direct, plain English. Never clinical, never corporate. Use words like family, community, support, connect, belong, neighbors. Avoid jargon (stakeholders, leverage, synergy, best-in-class).

Rules:
- Write ONLY the reply body. No subject line, no headers.
- Keep it concise and friendly.
- Do NOT invent facts, dates, dollar amounts, addresses, or commitments you cannot verify. Use [square brackets] for anything to fill in.
- Sign off warmly as Michelle, Lewis County Autism Coalition.
- This is a DRAFT for Michelle to review before sending.`;

function monthKey(): string { return new Date().toISOString().slice(0, 7); }

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

function computeFlag(subject: string, body: string): { flag: string | null; reason: string | null } {
  const t = ((subject || "") + " " + (body || "")).toLowerCase();
  if (/(suicid|self.?harm|kill (myself|him|her|them)|crisis|emergency|abuse|unsafe|in danger|threat|lawyer|attorney|lawsuit|suing|legal action|discriminat|formal complaint|\bcomplaint\b|furious|outraged|unacceptable|very upset|so upset|distress)/.test(t))
    return { flag: "sensitive", reason: "Sensitive topic — may need your personal, careful touch." };
  if (/(urgent|asap|as soon as possible|time.?sensitive|deadline|by (today|tomorrow|monday|tuesday|wednesday|thursday|friday|the end of)|need.{0,15}(today|now|right away)|\bpress\b|media inquiry|reporter|journalist|\bgrant\b|major (gift|donor)|sponsorship)/.test(t))
    return { flag: "important", reason: "Looks time-sensitive or high-value." };
  return { flag: null, reason: null };
}

// Best-guess CRM category for an auto-captured sender (Michelle can correct in the CRM).
function classifyContactType(fromEmail: string, subject: string, body: string): string {
  const t = ((subject || "") + " " + (body || "")).toLowerCase();
  const domain = (fromEmail.split("@")[1] || "").toLowerCase();
  const freeMail = /(gmail|yahoo|outlook|hotmail|icloud|aol|comcast|live|msn|ymail)\./.test(domain);
  if (/(my (son|daughter|child|kid|grandson|granddaughter|teen)|our (son|daughter|child)|diagnos|autistic|on the spectrum|\biep\b|my family|parent of|caregiver|my husband|my wife)/.test(t)) return "family";
  if (/(donat|contribut|sponsor|\bgift\b|fundrais|give back|pledge|in-kind)/.test(t)) return "donor";
  if (/(volunteer|help out|get involved|lend a hand|offer my time|sign up to help)/.test(t)) return "volunteer";
  if (/(partner|partnership|collaborat|our (organization|agency|clinic|practice|school|district|nonprofit)|refer (a|our|clients|families)|on behalf of (our|the))/.test(t) && !freeMail) return "partner";
  return "community";
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

  if (looksBulk(from_email, from_name, subject, body_text)) {
    return new Response(JSON.stringify({ ok: true, skipped: "bulk" }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const month = monthKey();
  const { data: costRow } = await sb.from("system_costs").select("total_usd").eq("month", month).maybeSingle();
  const spent = costRow?.total_usd ? Number(costRow.total_usd) : 0;
  if (spent >= MONTHLY_USD_CAP) {
    await sb.from("queued_replies").insert({
      inbox, from_email, from_name, subject, body_text, gmail_thread_id, gmail_message_id,
      status: "pending", error: `Monthly AI cap ($${MONTHLY_USD_CAP}) reached — no draft generated.`,
      draft_body: "[Monthly draft limit reached — please write this reply by hand.]",
    });
    return new Response(JSON.stringify({ ok: true, capped: true }), { status: 200 });
  }

  // Auto-capture the sender as a CRM contact if we don't have them yet. (full_name is generated from first/last.)
  let contact_id: string | null = null;
  if (from_email) {
    const { data: contact } = await sb.from("contacts").select("id").eq("email", from_email).maybeSingle();
    if (contact) contact_id = contact.id;
    else {
      const parts = (from_name || "").trim().split(/\s+/).filter(Boolean);
      const first = parts.shift() || null;
      const last = parts.length ? parts.join(" ") : null;
      const { data: created } = await sb.from("contacts").insert({
        first_name: first, last_name: last, email: from_email,
        contact_type: classifyContactType(from_email, subject, body_text),
        notes: `Auto-added from an inbound email to the ${inbox}@ inbox.`,
      }).select("id").maybeSingle();
      contact_id = created?.id ?? null;
    }
  }

  const { data: vp } = await sb.from("app_settings").select("value").eq("key", "voice_profile").maybeSingle();
  const { data: kbRow } = await sb.from("app_settings").select("value").eq("key", "knowledge_base").maybeSingle();
  const voice = (vp?.value && vp.value.trim()) ? vp.value : DEFAULT_VOICE;
  const kb = (kbRow?.value || "").trim();

  // Learn-from-edits: recent replies she actually sent become live style examples.
  const { data: examples } = await sb.from("queued_replies")
    .select("edited_body, draft_body").eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(3);

  let ctx = "";
  if (thread.length) ctx += "\n\n--- EARLIER MESSAGES IN THIS THREAD (oldest first) ---\n" + thread.map((m: any) => `From: ${m.from || "?"}\n${(m.body || "").toString().slice(0, 1500)}`).join("\n\n");
  if (prior.length) ctx += "\n\n--- PAST EMAILS WITH THIS PERSON ---\n" + prior.map((m: any) => `(${m.date || ""}) ${m.subject || ""}\n${(m.body || "").toString().slice(0, 800)}`).join("\n\n");
  let exBlock = "";
  if (examples && examples.length) exBlock = "\n\n--- RECENT REPLIES MICHELLE ACTUALLY SENT (match this style/voice) ---\n" + examples.map((e: any, i: number) => `Example ${i + 1}:\n${(e.edited_body || e.draft_body || "").toString().slice(0, 700)}`).join("\n\n");

  const { flag, reason } = computeFlag(subject, body_text);

  // System prefix (voice + knowledge base) is stable -> prompt-cached.
  const systemBlocks: any[] = [{ type: "text", text: voice }];
  if (kb) systemBlocks.push({ type: "text", text: "LCAC FACTS (use to fill in real details; never invent what's marked unknown):\n\n" + kb, cache_control: { type: "ephemeral" } });
  else systemBlocks[0].cache_control = { type: "ephemeral" };

  const userMsg =
    `An email arrived in the ${inbox}@ inbox.\nFrom: ${from_name} <${from_email}>\nSubject: ${subject}\n\n${body_text}` +
    ctx + exBlock +
    `\n\nWrite a reply Michelle can review. Use the LCAC facts and context above to be accurate and personal, but do NOT invent any fact, date, amount, or promise that isn't supported — use [brackets] for anything you can't verify.`;

  let draft = "", tin = 0, tout = 0, cost = 0, errMsg: string | null = null;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: systemBlocks, messages: [{ role: "user", content: userMsg }] }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Anthropic ${resp.status}`);
    draft = data?.content?.[0]?.text ?? "";
    const u = data?.usage || {};
    const inp = u.input_tokens || 0, cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
    tin = inp + cw + cr; tout = u.output_tokens || 0;
    cost = ((inp + cw * CACHE_WRITE_MULT + cr * CACHE_READ_MULT) / 1e6) * COST_IN_PER_MTOK + (tout / 1e6) * COST_OUT_PER_MTOK;
  } catch (e) {
    errMsg = String(e).slice(0, 300);
    draft = "[The AI draft could not be generated. Please write this reply manually.]";
  }

  await sb.from("queued_replies").insert({
    inbox, from_email, from_name, subject, body_text, gmail_thread_id, gmail_message_id, contact_id,
    draft_body: draft, status: "pending", tokens_in: tin, tokens_out: tout,
    cost_usd: Number(cost.toFixed(5)), error: errMsg, flag, flag_reason: reason,
  });
  if (cost > 0) await sb.rpc("increment_email_cost", { p_month: month, p_cost: Number(cost.toFixed(5)) });

  return new Response(JSON.stringify({ ok: true, flag }), { status: 200, headers: { "content-type": "application/json" } });
});
