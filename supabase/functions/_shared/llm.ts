// ============================================================================
// LLM call + HARD MONTHLY SPEND CAP.
// ----------------------------------------------------------------------------
// This is the one place in the whole system that spends money per use, so the
// cap lives right next to the call. Before drafting, we SUM this month's logged
// cost; if we're at or over MONTHLY_USD_CAP we REFUSE and the caller logs a
// 'skipped' message — no LLM call, no spend.
//
// ALL secrets come from environment variables. Nothing is hardcoded.
//   LLM_API_KEY     — the paid LLM key (required to draft)
//   LLM_MODEL       — model id (default below)
//   MONTHLY_USD_CAP — the hard ceiling in USD (default 15)
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- The cap. Easy to find, easy to change. -------------------------------
// Default is $15/month. Override per-deploy with the MONTHLY_USD_CAP env var.
export const DEFAULT_MONTHLY_USD_CAP = 15;

export function monthlyCapUsd(): number {
  const raw = Deno.env.get("MONTHLY_USD_CAP");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_USD_CAP;
}

// Rough cost estimate per call. Adjust the rates to match your provider's
// pricing. These are deliberately conservative so the cap trips early rather
// than late. (Rates are USD per 1M tokens.)
const INPUT_USD_PER_MTOK = Number(Deno.env.get("LLM_INPUT_USD_PER_MTOK") || "3");
const OUTPUT_USD_PER_MTOK = Number(Deno.env.get("LLM_OUTPUT_USD_PER_MTOK") || "15");

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const cost =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(cost * 10000) / 10000; // 4 dp
}

// Sum this calendar month's spend from email_usage_log (service role only).
export async function spendThisMonthUsd(sb: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from("email_usage_log")
    .select("cost_usd")
    .gte("occurred_at", start.toISOString());
  if (error) throw error;
  return (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}

export interface CapCheck {
  allowed: boolean;
  spent: number;
  cap: number;
  remaining: number;
}

// THE GATE. Call this before every draft. If allowed is false, DO NOT draft.
export async function checkSpendCap(sb: SupabaseClient): Promise<CapCheck> {
  const cap = monthlyCapUsd();
  const spent = await spendThisMonthUsd(sb);
  const remaining = Math.max(0, cap - spent);
  return { allowed: spent < cap, spent, cap, remaining };
}

export interface DraftResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Make the actual LLM call. Provider-agnostic-ish: this targets the Anthropic
// Messages API shape, but the key is read from env and the model is
// configurable, so swapping providers is a localized change.
export async function generateDraft(prompt: string): Promise<DraftResult> {
  const apiKey = Deno.env.get("LLM_API_KEY");
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set — cannot draft. Configure it as a secret.");
  }
  const model = Deno.env.get("LLM_MODEL") || "claude-3-5-haiku-latest";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`LLM call failed (${resp.status}): ${detail.slice(0, 500)}`);
  }

  const data = await resp.json();
  const text = (data?.content?.[0]?.text ?? "").trim();
  const inputTokens = data?.usage?.input_tokens ?? 0;
  const outputTokens = data?.usage?.output_tokens ?? 0;
  return {
    text,
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(inputTokens, outputTokens),
  };
}
