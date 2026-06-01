// ============================================================================
// Inbound email — provider-agnostic seam.
// ----------------------------------------------------------------------------
// The mailbox decision (Gmail API vs inbound-parse webhook) is DELIBERATELY not
// committed here. Both options normalize an incoming email into one shape —
// `NormalizedInbound` — and the rest of the system only ever sees that shape.
//
// To go live, a developer implements ONE `InboundParser` for the chosen
// provider and wires it in `draft-reply/index.ts`. Nothing else changes.
//
// Option A — Inbound-parse webhook (simplest; mirrors the existing WSP setup):
//   Forward LCAC mail to a parse webhook (Postmark inbound, SendGrid inbound,
//   Mailgun routes, etc.). The provider POSTs a JSON payload to the edge
//   function; `parsePostmarkInbound` (below) is a worked example.
//
// Option B — Gmail API (OAuth):
//   If info@/outreach@/executivedirector@ are Google Workspace mailboxes and
//   true two-way sync is wanted. A Pub/Sub push or a polling job fetches new
//   messages via the Gmail API and maps them with a `parseGmailMessage`
//   implementation (stub included). More setup (OAuth consent + token storage),
//   more power.
//
// Pick one at setup time. See docs/ai-workflow-upgrade/email-copilot-setup.md.
// ============================================================================

// The single shape the rest of the co-pilot understands.
export interface NormalizedInbound {
  provider: "gmail" | "inbound_parse" | "manual" | "unknown";
  providerMessageId: string | null;
  mailbox: string | null; // which LCAC inbox it hit (info@ / outreach@ / ...)
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string; // ISO timestamp
}

// Every provider implements this interface. `verify` does provider-specific
// authentication of the incoming request (shared-secret, basic auth, signature,
// OAuth bearer, ...) BEFORE we trust the payload. `parse` maps the raw payload
// onto NormalizedInbound. Returning null from parse = "ignore this delivery".
export interface InboundParser {
  name: string;
  verify(req: Request): Promise<boolean>;
  parse(req: Request): Promise<NormalizedInbound | null>;
}

// ----------------------------------------------------------------------------
// Example A: Postmark-style inbound-parse webhook.
// Auth: HTTP Basic credentials you configure on the Postmark inbound webhook,
// compared against env vars INBOUND_PARSE_USER / INBOUND_PARSE_PASS.
// (This mirrors how the existing `inbound-email` function authenticates.)
// ----------------------------------------------------------------------------
export const postmarkInboundParser: InboundParser = {
  name: "inbound_parse",

  async verify(req: Request): Promise<boolean> {
    const user = Deno.env.get("INBOUND_PARSE_USER");
    const pass = Deno.env.get("INBOUND_PARSE_PASS");
    if (!user || !pass) return false; // not configured = reject (fail closed)

    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Basic ")) return false;
    let decoded = "";
    try {
      decoded = atob(auth.slice(6));
    } catch {
      return false;
    }
    const sep = decoded.indexOf(":");
    if (sep < 0) return false;
    return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
  },

  async parse(req: Request): Promise<NormalizedInbound | null> {
    const p = await req.json();
    // Postmark inbound field names; adjust per provider if you pick another.
    return {
      provider: "inbound_parse",
      providerMessageId: p.MessageID ?? null,
      mailbox: p.OriginalRecipient ?? p.To ?? null,
      fromEmail: p.FromFull?.Email ?? p.From ?? null,
      fromName: p.FromFull?.Name ?? null,
      toEmail: p.To ?? null,
      subject: p.Subject ?? null,
      bodyText: p.TextBody ?? null,
      bodyHtml: p.HtmlBody ?? null,
      receivedAt: p.Date ? new Date(p.Date).toISOString() : new Date().toISOString(),
    };
  },
};

// ----------------------------------------------------------------------------
// Example B: Gmail API parser (STUB — implement at setup time if you pick Gmail).
// Auth: a Google Pub/Sub push is verified via an OIDC bearer token, OR a
// polling job calls this with an already-authenticated request. Token storage
// + OAuth consent are handled outside this function.
// ----------------------------------------------------------------------------
export const gmailInboundParser: InboundParser = {
  name: "gmail",

  async verify(req: Request): Promise<boolean> {
    const secret = Deno.env.get("GMAIL_PUSH_SECRET");
    if (!secret) return false; // fail closed until configured
    // TODO(setup): verify the Pub/Sub OIDC token or your push shared-secret.
    return req.headers.get("x-gmail-push-secret") === secret;
  },

  async parse(_req: Request): Promise<NormalizedInbound | null> {
    // TODO(setup): pull the message via the Gmail API and map headers + body
    // onto NormalizedInbound. Left unimplemented on purpose — wiring this is a
    // setup-day decision, not something to hard-commit in the scaffold.
    throw new Error("gmailInboundParser.parse not implemented — see email-copilot-setup.md");
  },
};

// Choose the active parser from an env var so the seam stays soft.
// INBOUND_PROVIDER = 'inbound_parse' (default) | 'gmail'
export function activeInboundParser(): InboundParser {
  const choice = (Deno.env.get("INBOUND_PROVIDER") || "inbound_parse").toLowerCase();
  switch (choice) {
    case "gmail":
      return gmailInboundParser;
    case "inbound_parse":
    default:
      return postmarkInboundParser;
  }
}
