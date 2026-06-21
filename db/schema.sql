-- DayHop V2 — Postgres schema (Supabase)
-- Run this in the Supabase SQL editor (Project → SQL → New query) once your
-- project exists. The Node server talks to these tables through the
-- service-role key, so Row Level Security is enabled but the server bypasses
-- it; the policies below are written for Phase 3, when the browser will read
-- with a user's auth token directly.
--
-- owner_id is TEXT for now: it holds the localStorage guest id (e.g.
-- "guest-ab12cd34"). In Phase 3 we add auth and migrate these to users.id.

-- ---------- users ----------
-- Phase 2 keeps this minimal. Supabase Auth manages auth.users; this is our
-- app-facing profile/row mirror, linked 1:1 to auth.users.id in Phase 3.
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  created_at  timestamptz not null default now()
);

-- ---------- adventures (saved/built day plans) ----------
create table if not exists public.adventures (
  id          text primary key,
  owner_id    text not null,
  plan        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists adventures_owner_idx on public.adventures (owner_id, created_at desc);

-- ---------- shortlist_items ----------
create table if not exists public.shortlist_items (
  id          text primary key,
  owner_id    text not null,
  idea_id     text not null,
  idea        jsonb not null,
  created_at  timestamptz not null default now(),
  unique (owner_id, idea_id)
);
create index if not exists shortlist_owner_idx on public.shortlist_items (owner_id, created_at desc);

-- ---------- community_submissions (moderation queue) ----------
create table if not exists public.community_submissions (
  id            text primary key,
  title         text not null,
  location      text not null,
  event_date    text not null,
  description   text not null default '',
  submitted_by  text not null default 'anonymous',
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at  timestamptz not null default now()
);
create index if not exists submissions_status_idx on public.community_submissions (status, submitted_at desc);

-- ---------- Row Level Security ----------
-- Enabled now; the service-role key used by the server bypasses RLS. The
-- per-user policies become meaningful in Phase 3 once owner_id = auth.uid().
alter table public.users               enable row level security;
alter table public.adventures          enable row level security;
alter table public.shortlist_items     enable row level security;
alter table public.community_submissions enable row level security;

-- Phase 3 placeholder policies (commented until owner_id is a real uuid):
-- create policy "own adventures"   on public.adventures      for all using (owner_id = auth.uid()::text);
-- create policy "own shortlist"    on public.shortlist_items for all using (owner_id = auth.uid()::text);
-- Anyone may submit an event; only curators (service role) read the queue.
-- create policy "public submit"    on public.community_submissions for insert with check (true);
