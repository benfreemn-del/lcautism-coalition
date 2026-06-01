-- ============================================================================
-- LCAC Email Co-Pilot — schema migration (Module C, Option 1)
-- ============================================================================
-- STATUS: DESIGN / NOT YET APPLIED. Review before applying to project
--         `lcac-crm` (byxuapnhhuxekamgnwaf). DO NOT run this from the browser
--         or with the anon key. Apply server-side only (Supabase SQL editor,
--         CLI migration, or MCP apply_migration) on Ben's explicit go.
--
-- Numbered 0002 because lcac-crm-schema.md is the conceptual 0001 (the initial
-- CRM schema already applied as `lcac_crm_initial_schema`). This builds on it
-- and references the existing `contacts` table.
--
-- What this adds:
--   * email_messages   — one row per inbound email (provider-agnostic)
--   * email_drafts     — the AI-drafted reply(ies) for a message; staff edit +
--                        approve here. Approving NEVER sends; a separate send
--                        step (also staff-triggered) flips status to 'sent'.
--   * email_usage_log  — per-call LLM spend tracking that backs the hard
--                        monthly cap. The drafting function refuses once the
--                        running month total reaches MONTHLY_USD_CAP.
--
-- Security posture (mirrors lcac-crm-schema.md + backend-review-snapshot.md):
--   * RLS ON for every table.
--   * NO permissive policies. The app/edge functions use the SERVICE-ROLE key,
--     which bypasses RLS. anon/authenticated get NOTHING here — these tables
--     hold inbound email bodies (PII) and must never be anon-readable.
--   * REVOKE ALL from anon + authenticated as defense-in-depth, so even a
--     future accidental policy can't expose them (the exact lesson from the
--     audit: the leak only happened because anon HELD grants AND a permissive
--     policy existed).
--   * This is INTENTIONALLY policy-free. Do NOT add a "TO public USING (true)"
--     convenience policy — that is the bug we are avoiding.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- email_messages — inbound email, provider-agnostic
-- ---------------------------------------------------------------------------
-- The "inbound seam" (Gmail API vs inbound-parse webhook) is deliberately not
-- baked into the schema. Whatever provider lands the mail normalizes it into
-- THIS shape and inserts a row (with the service role). `provider` +
-- `provider_message_id` record where it came from so we can de-dupe and trace.
CREATE TABLE email_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- which provider delivered this (the seam is documented, not hard-coded):
    provider            text NOT NULL DEFAULT 'unknown'
                        CHECK (provider IN ('gmail','inbound_parse','manual','unknown')),
    provider_message_id text,                       -- de-dupe key from the provider

    -- which LCAC mailbox it arrived at (info@ / outreach@ / executivedirector@):
    mailbox             text,

    -- normalized envelope + content:
    from_email          text,
    from_name           text,
    to_email            text,
    subject             text,
    body_text           text,                       -- plain-text body fed to the LLM
    body_html           text,                       -- optional, for display
    received_at         timestamptz NOT NULL DEFAULT now(),

    -- optional link to the CRM contact this came from (staff or a lookup sets it):
    contact_id          uuid REFERENCES contacts (id) ON DELETE SET NULL,

    -- workflow status for the Inbox / Drafts tab:
    --   new        — just arrived, no draft yet
    --   drafting   — handed to the LLM
    --   drafted    — a draft is waiting for review
    --   skipped    — drafting was skipped (e.g. spend cap hit, or not allowlisted)
    --   replied    — an approved draft was sent
    --   archived   — staff dismissed it without replying
    status              text NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','drafting','drafted','skipped','replied','archived')),

    -- if drafting was skipped, why (shows in the UI; e.g. 'monthly_cap_reached'):
    skip_reason         text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- one row per provider message; safe no-op re-deliveries instead of dupes:
    UNIQUE (provider, provider_message_id)
);

CREATE INDEX idx_email_messages_status   ON email_messages (status);
CREATE INDEX idx_email_messages_received ON email_messages (received_at DESC);
CREATE INDEX idx_email_messages_contact  ON email_messages (contact_id);
-- the "what's waiting for me" query that powers the Drafts list:
CREATE INDEX idx_email_messages_open ON email_messages (received_at DESC)
    WHERE status IN ('new','drafting','drafted');

-- ---------------------------------------------------------------------------
-- email_drafts — the AI-drafted reply; staff edit + approve here
-- ---------------------------------------------------------------------------
-- `draft_body` is the AI's text. `edited_body` is what staff changed it to
-- (NULL until they touch it). On approve we copy the final text into
-- `approved_body` and stamp who/when. APPROVAL DOES NOT SEND — a separate,
-- staff-triggered send step sets status='sent' + sent_at. There is no path
-- that sends without an explicit approve+send action.
CREATE TABLE email_drafts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id          uuid NOT NULL REFERENCES email_messages (id) ON DELETE CASCADE,

    -- the model's draft + any staff edits:
    draft_subject       text,
    draft_body          text NOT NULL,
    edited_body         text,                       -- staff's edited version (if any)

    -- approval + send tracking (the human gate):
    --   pending   — drafted, awaiting review
    --   approved  — staff approved; READY to send, but NOT sent
    --   sent      — an explicit send step delivered it
    --   discarded — staff threw it away
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','sent','discarded')),
    approved_body       text,                       -- final text captured at approval
    approved_by         text,                       -- staff email/name (free text)
    approved_at         timestamptz,
    sent_at             timestamptz,

    -- provenance / observability:
    model                 text,                     -- e.g. 'claude-...'; which model drafted
    voice_profile_version text,                     -- which style guide produced this

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_drafts_message ON email_drafts (message_id);
CREATE INDEX idx_email_drafts_status  ON email_drafts (status);

-- ---------------------------------------------------------------------------
-- email_usage_log — per-call LLM spend, backs the hard monthly cap
-- ---------------------------------------------------------------------------
-- The drafting function writes one row per LLM call with an estimated USD cost.
-- Before each draft it SUMs cost_usd for the current calendar month and refuses
-- (logging a 'skipped' message) once the total would exceed MONTHLY_USD_CAP.
-- This mirrors the `system_costs` pattern referenced in the plan.
CREATE TABLE email_usage_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      uuid REFERENCES email_messages (id) ON DELETE SET NULL,
    model           text,
    input_tokens    integer,
    output_tokens   integer,
    cost_usd        numeric(10,4) NOT NULL DEFAULT 0,   -- estimated USD for this call
    occurred_at     timestamptz NOT NULL DEFAULT now()
);

-- fast "spend so far this month" rollups:
CREATE INDEX idx_email_usage_occurred ON email_usage_log (occurred_at);

-- ============================================================================
-- Row Level Security — ON for all three, NO policies, REVOKE from anon/auth.
-- These tables are SERVICE-ROLE-ONLY. The service role bypasses RLS, so the
-- edge functions + the CRM's authenticated reads (via a server proxy / RPC)
-- keep working; anon/authenticated REST access is denied at the grant level
-- AND the policy level.
-- ============================================================================
ALTER TABLE email_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_usage_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON email_messages  FROM anon, authenticated;
REVOKE ALL ON email_drafts    FROM anon, authenticated;
REVOKE ALL ON email_usage_log FROM anon, authenticated;

-- NO POLICIES on purpose. RLS-on + no-policy = deny-all to anon/authenticated.
-- Do NOT add "TO public USING (true)". See backend-review-snapshot.md.

-- ---------------------------------------------------------------------------
-- keep updated_at honest (optional, matches a typical Supabase setup).
-- SECURITY DEFINER + empty search_path per the audit's function hardening note.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_email_messages_updated
    BEFORE UPDATE ON email_messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_email_drafts_updated
    BEFORE UPDATE ON email_drafts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Verify after applying (DO NOT run now):
--   SELECT has_table_privilege('anon','email_messages','SELECT'); -- expect false
--   SELECT has_table_privilege('anon','email_drafts','SELECT');   -- expect false
--   SELECT has_table_privilege('anon','email_usage_log','SELECT');-- expect false
--   get_advisors(security) → 0 new permissive public/anon policies.
-- ============================================================================
