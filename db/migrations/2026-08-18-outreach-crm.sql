-- DayHop migration 2026-08-18: outreach CRM + admin roles.
-- Paste this whole file into the Supabase SQL editor and Run. Idempotent.
-- (All three tables are also appended to db/schema.sql — this file is the
-- delta since the last schema run, so one paste brings a live DB current.)

-- ---------- outreach (CRM rows: venues now, investors later) ----------
-- One row per prospect. The cadence engine (services/outreach.js) reads
-- next_touch_due to decide what to send; the admin panel's CRM tab reads
-- and writes the same rows, so a human action (mark replied, pause) and
-- the automation never disagree about state.
create table if not exists public.outreach (
  id             text primary key,               -- 'out-' + slug
  kind           text not null default 'venue',  -- venue | investor
  name           text not null,
  contact_name   text,
  email          text not null,
  tier           text,                           -- featured | spotlight | anchor
  stage          text not null default 'drafted',
    -- drafted → queued → sent → bumped → closed_out (cadence exhausted)
    -- terminal overrides at any point: replied | won | lost | optout
  hook           text,                           -- personalization angle, plain text
  draft          jsonb,                          -- opener {subject, text} awaiting approval
  thread         jsonb not null default '[]'::jsonb, -- [{type, resend_id, subject, at}]
  last_touch_at  timestamptz,
  next_touch_due timestamptz,
  suppressed     boolean not null default false, -- hard stop; wins over everything
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists outreach_due_idx   on public.outreach (next_touch_due) where not suppressed;
create index if not exists outreach_stage_idx on public.outreach (stage);
alter table public.outreach enable row level security;

-- ---------- admin_users (panel roles beyond the env-var owners) ----------
-- Owners come from ADMIN_EMAILS (env) as before; this table adds operators:
-- limited-view logins that see the CRM and reduced metrics only. Rows are
-- managed from the panel's Team section (owner-only routes).
create table if not exists public.admin_users (
  email      text primary key,
  role       text not null default 'operator' check (role in ('owner', 'operator')),
  added_by   text,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- ---------- outreach_events (audit trail + delivery signals) ----------
-- Every automated send, Resend webhook signal, and human CRM action lands
-- here with who/when. Owners see it in the panel; nothing is ever deleted.
create table if not exists public.outreach_events (
  id          bigint generated always as identity primary key,
  outreach_id text not null,
  type        text not null,  -- sent|delivered|opened|bounced|replied|stage_change|note|approved
  actor       text,           -- 'system' | admin email
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists outreach_events_row_idx on public.outreach_events (outreach_id, created_at desc);
alter table public.outreach_events enable row level security;
