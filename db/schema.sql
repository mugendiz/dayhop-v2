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

-- ============================================================================
-- PHASE 4 — business-model wiring (events analytics + subscriptions).
-- Idempotent like the rest of the file: re-run the whole script, or paste
-- from here down.
-- ============================================================================

-- ---------- events (analytics: prompts, shortlist adds, booking clicks) ----------
-- owner_key is a user id OR a localStorage guest id ("guest-…") — analytics
-- must count anonymous usage too.
create table if not exists public.events (
  id          text primary key,
  type        text not null,
  owner_key   text not null default 'anon',
  idea_id     text,
  source      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_type_time_idx  on public.events (type, created_at desc);
create index if not exists events_owner_time_idx on public.events (owner_key, created_at desc);

alter table public.events enable row level security;
drop policy if exists "events insert only" on public.events;
-- Write-only analytics sink: anyone may INSERT, nobody may read/update/delete
-- with the anon key (reads happen server-side with SUPABASE_SERVICE_KEY only —
-- the publishable key ships to browsers and must never expose usage data).
create policy "events insert only" on public.events
  for insert to anon, authenticated with check (true);

-- ---------- subscriptions (Stripe Pro tier) ----------
create table if not exists public.subscriptions (
  owner_id               text primary key,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',
  cancel_at_period_end   boolean not null default false,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
-- Migration for pre-existing databases (idempotent):
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
create index if not exists subscriptions_stripe_sub_idx on public.subscriptions (stripe_subscription_id);

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions self read" on public.subscriptions;
-- A user may read their own subscription row. There is NO anon/authenticated
-- write policy: rows are written exclusively by the Stripe webhook running
-- server-side with SUPABASE_SERVICE_KEY (never trust a client about billing).
create policy "subscriptions self read" on public.subscriptions
  for select to authenticated using (owner_id = auth.uid()::text);

-- ---------- guides (saved plans: editable, multi-day, shareable by link) ----------
-- A guide is a self-contained, enriched copy of an itinerary. share_id is an
-- unguessable slug used in public /g/<share_id> links; is_public lets a future
-- "unshare" toggle work without deleting.
--
-- Freemium note (no migration needed): edits, multi-day structure, and the
-- edit timestamp all live INSIDE the `guide` jsonb —
--   guide.days[]      → multi-day itineraries ({label, start_time, notes, stops})
--   guide.stops[].note → per-stop user annotations from the editor
--   guide.updated_at  → set by the server on every save/edit
-- The free tier's saved-plan cap and the Pro-only PUT (edit) are enforced in
-- routes/guides.js via services/entitlements.js, not in the schema.
create table if not exists public.guides (
  id          text primary key,
  owner_id    text not null,
  share_id    text not null unique,
  title       text not null default 'Your day',
  city        text,
  guide       jsonb not null,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists guides_owner_idx on public.guides (owner_id, created_at desc);

alter table public.guides enable row level security;
drop policy if exists "own guides"          on public.guides;
drop policy if exists "guides shared read"  on public.guides;

-- Owners manage their own guides (create/list/delete).
create policy "own guides" on public.guides
  for all to authenticated
  using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);

-- Anyone with the link may read a public guide (share pages are served by the
-- server using the anon client keyed on share_id).
create policy "guides shared read" on public.guides
  for select to anon, authenticated using (is_public);

-- ---------- banned_users (admin moderation) ----------
-- Keyed the same way events are: a user id, a guest id, or "ip-<addr>".
-- NO anon/authenticated policies on purpose: rows are read and written
-- exclusively server-side with SUPABASE_SERVICE_KEY (the ban list must be
-- invisible to clients and unwritable by them).
create table if not exists public.banned_users (
  owner_key   text primary key,
  reason      text,
  banned_by   text,
  created_at  timestamptz not null default now()
);
alter table public.banned_users enable row level security;

-- ---------- auto_catalog (discovery autopilot) ----------
-- Verified new-opening entries published automatically by the discovery
-- pipeline (services/autoCatalog.js): each row passed Google Places
-- existence + Grok editorial + (when configured) Claude verification.
-- NO anon/authenticated policies on purpose: read and written exclusively
-- server-side with SUPABASE_SERVICE_KEY. Entries reach clients only through
-- the feed APIs. status: 'active' serves; 'retired' hides without deleting.
create table if not exists public.auto_catalog (
  id            text primary key,
  entry         jsonb not null,
  verification  jsonb,
  status        text not null default 'active' check (status in ('active','retired')),
  created_at    timestamptz not null default now()
);
alter table public.auto_catalog enable row level security;
