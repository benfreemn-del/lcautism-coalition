-- ============================================================================
-- LCAC CareLink — 00_extensions.sql
-- ----------------------------------------------------------------------------
-- DESIGN ONLY. Do NOT apply this anywhere yet. There is no live database and
-- no real patient data exists. This is the Postgres translation of the Base44
-- export's 87 entity definitions, built to run on owned, HIPAA-eligible
-- infrastructure (AWS RDS Postgres per BUILD-PLAN.md).
--
-- Conventions used across every file:
--   * uuid primary keys:  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   * timestamptz for all times
--   * created_at / updated_at / deleted_at (soft delete) on every table
--   * jsonb where Base44 used freeform/nested objects ("additionalProperties")
--   * text + CHECK for status/category enums (easy to edit, no ALTER TYPE pain)
--   * numeric for money/scores
--   * snake_case everywhere (Base44 mixed camelCase + snake_case; normalized)
--
-- Security posture (matches docs/ai-workflow-upgrade backend audit + CRM doc):
--   * RLS ON for every table (see 99_rls_policies.sql).
--   * DEFAULT DENY. No `USING (true)` policy is ever written for PHI — that was
--     the real data-leak bug in the prior project.
--   * This is a CLINICAL system: staff log in as authenticated users and must
--     be scoped to the clients they are ASSIGNED to (client_assignments), OR
--     hold an org-wide role (director/admin). RLS enforces that.
-- ============================================================================

-- gen_random_uuid() — UUID v4 primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram index support for fast name search on clients/staff.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- All CareLink tables live in a dedicated `carelink` schema, NOT `public`.
-- Keeps PHI clearly separated from anything else and gives a single REVOKE
-- surface. (On Supabase you would instead expose `public` carefully; on RDS
-- with a custom API layer a dedicated schema is cleaner.)
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS carelink;

-- ----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on UPDATE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION carelink.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION carelink.set_updated_at() IS
    'Trigger function: sets updated_at = now() on every UPDATE. Attach a BEFORE UPDATE trigger per table.';
