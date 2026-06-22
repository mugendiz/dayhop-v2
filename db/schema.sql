-- DayHop V2 — Postgres schema (Supabase)
--
-- ============================================================================
-- ⚠️ PHASE 3b SECURITY UPDATE — RE-RUN THIS IN THE SUPABASE SQL EDITOR
-- The RLS policies for `community_submissions` and `users` were tightened
-- (they were previously `for all to anon using(true)`, i.e. world read/write).
-- Re-running the whole file is idempotent (policies are dropped then created),
-- but if you want just the security delta, paste this block into the SQL editor:
--
--   drop policy if exists "public submit"          on public.community_submissions;
--   drop policy if exists "users self rw"          on public.users;
--   drop policy if exists "community submit"       on public.community_submissions;
--   drop policy if exists "community moderate read"   on public.community_submissions;
--   drop policy if exists "community moderate update" on public.community_submissions;
--
--   -- Anyone (incl. anon) may submit, but NOT read/update/delete the queue.
--   create policy "community submit" on public.community_submissions
--     for insert to anon, authenticated with check (true);
--   -- Reading + moderating the queue is restricted to signed-in users (the
--   -- server forwards each curator's JWT). Tighten to an admin claim before launch.
--   create policy "community moderate read" on public.community_submissions
--     for select to authenticated using (true);
--   create policy "community moderate update" on public.community_submissions
--     for update to authenticated using (true) with check (true);
--
--   -- A user may only read/write their own profile row.
--   create policy "users self rw" on public.users
--     for all to authenticated
--     using (id = auth.uid()) with check (id = auth.uid());
-- ============================================================================
--
-- Run this in the Supabase SQL editor (Project → SQL → New query) once your
-- project exists. In Phase 2 the Node server connects with the publishable
-- (anon) key, so Row Level Security is enabled and the permissive prototype
-- policies at the bottom grant the anon role read/write pre-auth. These get
-- replaced with per-user policies in Phase 3.
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
-- Phase 3: the server connects with the publishable (anon) key and forwards
-- each signed-in user's JWT, so RLS applies per user. adventures + shortlist
-- are owner-scoped (a user sees/writes only rows where owner_id = auth.uid()).
-- community: anon may INSERT (submit) only; reading/moderating is authenticated.
-- users mirror: each user reads/writes only their own row (no anon access).
-- Drop-then-create keeps the whole script idempotent and safe to re-run.
alter table public.users               enable row level security;
alter table public.adventures          enable row level security;
alter table public.shortlist_items     enable row level security;
alter table public.community_submissions enable row level security;

-- Clean up any earlier policy names (Phase 2 prototype + Phase 3) so re-running works.
drop policy if exists "proto users rw"       on public.users;
drop policy if exists "proto adventures rw"  on public.adventures;
drop policy if exists "proto shortlist rw"   on public.shortlist_items;
drop policy if exists "proto submissions rw" on public.community_submissions;
drop policy if exists "users self rw"        on public.users;
drop policy if exists "own adventures"       on public.adventures;
drop policy if exists "own shortlist"        on public.shortlist_items;
drop policy if exists "public submit"        on public.community_submissions;
drop policy if exists "community submit"          on public.community_submissions;
drop policy if exists "community moderate read"   on public.community_submissions;
drop policy if exists "community moderate update" on public.community_submissions;

-- Per-user: only the owning user can read/write their adventures + shortlist.
create policy "own adventures" on public.adventures
  for all to authenticated
  using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);

create policy "own shortlist" on public.shortlist_items
  for all to authenticated
  using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);

-- Community: anyone (incl. anonymous) may submit an event into the queue,
-- but NObody may read/update/delete it as the anon role (the anon publishable
-- key is shipped to browsers, so an open policy = world-readable queue + PII).
create policy "community submit" on public.community_submissions
  for insert to anon, authenticated with check (true);
-- Reading + moderating the queue is restricted to signed-in users; the server
-- forwards each curator's JWT (req.dbCtx). Tighten to an admin claim before launch.
create policy "community moderate read" on public.community_submissions
  for select to authenticated using (true);
create policy "community moderate update" on public.community_submissions
  for update to authenticated using (true) with check (true);

-- users mirror: a user may only read/write their OWN row (no anon access).
create policy "users self rw" on public.users
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
