-- =====================================================================
-- LCAC Email Co-Pilot — database schema
-- Run this in: Supabase Dashboard -> lcac-crm project -> SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
--
-- Creates:
--   queued_replies  -- incoming emails + their AI-drafted reply, awaiting approval
--   system_costs    -- monthly running tally of AI spend (the $20 cap watchdog)
--   increment_email_cost()  -- atomic monthly cost increment (called by the edge function)
--
-- Security model (matches the rest of lcac-crm):
--   * anon (the public website key)  -> NO access at all
--   * authenticated (logged-in staff) -> read + update queued_replies, read costs
--   * service_role (the edge function / Apps Script) -> full access (bypasses RLS)
-- =====================================================================

-- ---------- queued_replies ----------
create table if not exists public.queued_replies (
  id               uuid primary key default gen_random_uuid(),
  inbox            text not null,                 -- 'info' | 'outreach' | 'executivedirector'
  from_email       text,
  from_name        text,
  subject          text,
  body_text        text,                          -- the incoming email (trimmed)
  draft_body       text,                          -- the AI-written reply
  edited_body      text,                          -- staff edits (if any) before approving
  status           text not null default 'pending'
                     check (status in ('pending','approved','sent','discarded','skipped')),
  contact_id       uuid references public.contacts(id) on delete set null,
  gmail_thread_id  text,                          -- so the reply lands in the right thread
  gmail_message_id text,
  tokens_in        integer,
  tokens_out       integer,
  cost_usd         numeric(10,5),
  error            text,
  created_at       timestamptz not null default now(),
  approved_at      timestamptz,
  sent_at          timestamptz,
  sent_message_id  text
);

create index if not exists queued_replies_status_idx  on public.queued_replies (status);
create index if not exists queued_replies_created_idx  on public.queued_replies (created_at desc);

-- ---------- system_costs (one row per month) ----------
create table if not exists public.system_costs (
  month        text primary key,                  -- 'YYYY-MM'
  total_usd    numeric(12,5) not null default 0,
  draft_count  integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- ---------- atomic monthly increment ----------
create or replace function public.increment_email_cost(p_month text, p_cost numeric)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.system_costs (month, total_usd, draft_count, updated_at)
  values (p_month, coalesce(p_cost,0), 1, now())
  on conflict (month) do update
    set total_usd   = public.system_costs.total_usd + excluded.total_usd,
        draft_count = public.system_costs.draft_count + 1,
        updated_at  = now();
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.queued_replies enable row level security;
alter table public.system_costs   enable row level security;

-- Clean re-run
drop policy if exists queued_replies_staff_select on public.queued_replies;
drop policy if exists queued_replies_staff_update on public.queued_replies;
drop policy if exists system_costs_staff_select   on public.system_costs;

-- Logged-in staff only (NOT anon/public).
create policy queued_replies_staff_select on public.queued_replies
  for select to authenticated using (true);
create policy queued_replies_staff_update on public.queued_replies
  for update to authenticated using (true) with check (true);
create policy system_costs_staff_select on public.system_costs
  for select to authenticated using (true);

-- Table privileges: explicitly keep anon out, let staff in.
revoke all on public.queued_replies from anon;
revoke all on public.system_costs   from anon;
grant select, update on public.queued_replies to authenticated;
grant select          on public.system_costs   to authenticated;

revoke all on function public.increment_email_cost(text, numeric) from public, anon, authenticated;
grant execute on function public.increment_email_cost(text, numeric) to service_role;

-- =====================================================================
-- Verify (run these after; they should confirm anon is locked out)
-- =====================================================================
-- select tablename, rowsecurity from pg_tables
--   where tablename in ('queued_replies','system_costs');     -- both true
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'queued_replies' order by grantee;     -- no 'anon' rows

-- ---------------------------------------------------------------------
-- v5: voice profile / app settings (added 2026-06)
-- Stores the distilled "voice profile" learned from Michelle's real
-- emails. Staff-readable only; never anon. The edge function (service
-- role) reads it and falls back to the built-in default voice if unset.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_staff_select on public.app_settings;
create policy app_settings_staff_select on public.app_settings
  for select to authenticated using (true);

revoke all on public.app_settings from anon;
grant select on public.app_settings to authenticated;

-- ---------------------------------------------------------------------
-- v7: flag important/sensitive drafts (still drafted, just highlighted)
-- ---------------------------------------------------------------------
alter table public.queued_replies add column if not exists flag text;        -- 'important' | 'sensitive' | null
alter table public.queued_replies add column if not exists flag_reason text;

-- The drafter also reads app_settings key 'knowledge_base' (LCAC facts) and
-- auto-captures unknown senders into public.contacts (categorized via the
-- email's content), and learns from recently-sent replies. No schema change
-- needed for those beyond the app_settings table above.
