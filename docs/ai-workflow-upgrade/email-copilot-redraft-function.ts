// =====================================================================
// LCAC Email Co-Pilot — "redraft-with-context" Supabase Edge Function
//
// Powers the "🔍 Pull full history & redraft" button in the CRM Email
// Replies tab. Called by the logged-in CRM (verify_jwt = true), it gathers
// everything we know about the sender — every past email on file from them
// plus their CRM interactions — and regenerates the draft with that fuller
// picture, in Michelle's voice. Updates the draft in place.
//
// Deployed via the Supabase MCP with verify_jwt = true (staff only).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MONTHLY_USD_CAP = Number(Deno.env.get("MONTHLY_USD_CAP") ?? "20");
const MODEL = Deno.env.get("EMAIL_MODEL") ?? "claude-haiku-4-5";
const COST_IN_PER_MTOK = Number(Deno.env.get("COST_IN_PER_MTOK") ?? "1.0");
const COST_OUT_PER_MTOK = Number(Deno.env.get("COST_OUT_PER_MTOK") ?? "5.0");

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_VOICE = `You are drafting an email reply on behalf of Michelle, Executive Director of the Lewis County Autism Coalition (LCAC), a community nonprofit serving autistic individuals and their families in Lewis County, WA.

Write in her voice: warm, direct, plain English. Never clinical, never corporate. Use words like family, community, support, connect, belong, neighbors. Avoid jargon.

Rules:
- Write ONLY the reply body. No subject line, no headers.
- Keep it concise and friendly.
- Do NOT invent facts, dates, dollar amounts, addresses, or commitments you cannot verify; use [square brackets] for anything to fill in.
- Sign off warmly as Michelle, Lewis County Autism Coalition.
- This is a DRAFT for Michelle to review before sending.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function monthKey(): string { return new Date().toISOString().slice(0, 7); }
function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  let p: Record<string, any>;
  try { p = await req.json(); } catch { return j({ error: "Bad JSON" }, 400); }
  const id = (p.id || "").toString();
  if (!id) return j({ error: "Missing id" }, 400);

  const { data: row } = await sb.from("queued_replies").select("*").eq("id", id).maybeSingle();
  if (!row) return j({ error: "Draft not found" }, 404);

  // Gather everything we already know about this sender (their email history on file).
  let history: any[] = [];
  if (row.from_email) {
    const { data } = await sb.from("queued_replies")
      .select("subject, body_text, edited_body, draft_body, created_at")
      .eq("from_email", row.from_email).neq("id", id)
      .order("created_at", { ascending: false }).limit(8);
    history = data || [];
  }

  // Pull any CRM contact interactions for this person.
  let contactNote = "";
  if (row.contact_id) {
    const { data: ints } = await sb.from("interactions")
      .select("summary, occurred_at").eq("contact_id", row.contact_id)
      .order("occurred_at", { ascending: false }).limit(6);
    if (ints && ints.length) {
      contactNote = "\n\n--- WHAT WE KNOW ABOUT THIS CONTACT (from the CRM) ---\n" +
        ints.map((i: any) => `(${(i.occurred_at || "").slice(0, 10)}) ${i.summary || ""}`).join("\n");
    }
  }

  const month = monthKey();
  const { data: costRow } = await sb.from("system_costs").select("total_usd").eq("month", month).maybeSingle();
  const spent = costRow?.total_usd ? Number(costRow.total_usd) : 0;
  if (spent >= MONTHLY_USD_CAP) return j({ error: `Monthly AI limit ($${MONTHLY_USD_CAP}) reached.` }, 200);

  const { data: vp } = await sb.from("app_settings").select("value").eq("key", "voice_profile").maybeSingle();
  const voice = (vp?.value && vp.value.trim()) ? vp.value : DEFAULT_VOICE;

  let histBlock = "";
  if (history.length) {
    histBlock = "\n\n--- EVERY PAST EMAIL WE HAVE FROM/THIS THREAD WITH THIS PERSON (newest first) ---\n" +
      history.map((h: any) => `(${(h.created_at || "").slice(0, 10)}) ${h.subject || ""}\n${(h.body_text || "").toString().slice(0, 900)}`).join("\n\n");
  }

  const userMsg =
    `An email arrived in the ${row.inbox || "info"}@ inbox.\nFrom: ${row.from_name || ""} <${row.from_email || ""}>\nSubject: ${row.subject || ""}\n\n${(row.body_text || "").slice(0, 3000)}` +
    histBlock + contactNote +
    `\n\nUsing ALL of the context above (the person's full history with us), write the most accurate, personal reply Michelle can review. Do not invent anything not supported by the context — use [brackets] for anything to fill in.`;

  let draft = "", tin = 0, tout = 0, cost = 0;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: voice, messages: [{ role: "user", content: userMsg }] }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `Anthropic ${resp.status}`);
    draft = data?.content?.[0]?.text ?? "";
    tin = data?.usage?.input_tokens ?? 0;
    tout = data?.usage?.output_tokens ?? 0;
    cost = (tin / 1e6) * COST_IN_PER_MTOK + (tout / 1e6) * COST_OUT_PER_MTOK;
  } catch (e) {
    return j({ error: "Could not redraft: " + String(e).slice(0, 200) }, 200);
  }

  await sb.from("queued_replies").update({
    draft_body: draft, edited_body: null,
    tokens_in: tin, tokens_out: tout, cost_usd: Number(cost.toFixed(5)), error: null,
  }).eq("id", id);
  if (cost > 0) await sb.rpc("increment_email_cost", { p_month: month, p_cost: Number(cost.toFixed(5)) });

  return j({ ok: true, draft, history_count: history.length });
});
