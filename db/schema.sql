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
-- engagementByIdea (services/analytics.js) filters on idea_id + created_at
-- inside the candidate-gather critical path — without this partial index it
-- degrades to a scan as events grows.
create index if not exists events_idea_time_idx on public.events (idea_id, created_at desc)
  where idea_id is not null;

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

-- ---------- place_details (detail-panel cache, L2 behind process memory) ----------
-- /api/details pays a Grok call + Places lookups per uncached place. The
-- in-process 24h cache dies on every deploy/spin-down (constant on the free
-- tier), so popular places were re-paid over and over. Rows are written and
-- read exclusively server-side with SUPABASE_SERVICE_KEY — NO anon policies.
-- key mirrors the route's cache key: place_id, or "title|city", lowercased.
create table if not exists public.place_details (
  key         text primary key,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.place_details enable row level security;

-- ---------- articles (SEO blog: BabyLoveGrowth webhook + hand-written seeds) ----------
-- POST /api/content/webhook (secret-gated) upserts rows here; /blog renders
-- them server-side for search engines. Hand-written seed stories live in
-- data/blogArticles.js and are merged at read time (DB wins on slug), so the
-- blog works even before this table exists. Rows are written and read
-- exclusively server-side — NO anon policies.
create table if not exists public.articles (
  slug            text primary key,
  title           text not null,
  description     text,
  html            text not null,
  hero_image_url  text,
  tags            text[] not null default '{}',
  author          text,
  source          text not null default 'webhook',
  status          text not null default 'published' check (status in ('published','draft')),
  published_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.articles enable row level security;

-- ---------- newsletter_subscribers (email marketing: weekly digest) ----------
-- CASL requires provable consent: every row records WHERE consent came from
-- (consent_source), WHEN (created_at / confirmed_at), and the double-opt-in
-- state. status: 'pending' = signed up, hasn't clicked the confirm link yet
-- (never emailed beyond the confirmation); 'subscribed' = confirmed, gets the
-- digest; 'unsubscribed' = kept as a suppression record — CASL/CAN-SPAM treat
-- a re-mailed unsubscriber as a violation, so rows are flipped, NEVER deleted.
-- token is the unguessable secret in confirm/unsubscribe links (per-subscriber,
-- constant across sends so old emails' unsubscribe links keep working).
-- NO anon/authenticated policies on purpose: the subscriber list is PII and is
-- read/written exclusively server-side with SUPABASE_SERVICE_KEY.
create table if not exists public.newsletter_subscribers (
  email           text primary key,
  status          text not null default 'pending' check (status in ('pending','subscribed','unsubscribed')),
  token           text not null unique,
  consent_source  text not null default 'unknown',
  consent_ip      text,
  owner_id        text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at    timestamptz
);
-- Migration for pre-existing databases (idempotent):
alter table public.newsletter_subscribers add column if not exists consent_ip text;
create index if not exists newsletter_status_idx on public.newsletter_subscribers (status, created_at desc);
alter table public.newsletter_subscribers enable row level security;

-- ---------- retention_cohorts() (admin metrics, 2026-08-15) ----------
-- W1-W4 retention computed over ALL event history in Postgres. The Node
-- fallback aggregates the most recent 20k event rows only, which silently
-- re-dates long-standing users into recent cohorts once history outgrows
-- the window; this function is the source of truth the admin dashboard
-- prefers when present (services/analytics.js retentionFromDb()).
-- Cohort = ISO week (Monday-anchored) of the owner's first event, in
-- Toronto time. wN = distinct owners with any event in days [7N, 7N+7)
-- after their first. Maturity nulls (suppressing not-yet-complete windows)
-- are applied by the caller. anon/system/ip-*/sub-* keys are excluded:
-- nobody, the digest sender, DHCP churn, and email-pixel subscribers are
-- not product users.
create or replace function public.retention_cohorts()
returns table (week date, users int, w1 int, w2 int, w3 int, w4 int)
language sql
stable
as $$
  with owners as (
    select owner_key, min(created_at) as first_seen
    from public.events
    where owner_key not in ('anon', 'system')
      and owner_key not like 'ip-%'
      and owner_key not like 'sub-%'
    group by owner_key
  ),
  activity as (
    select e.owner_key,
           floor(extract(epoch from (e.created_at - o.first_seen)) / 604800)::int as wk
    from public.events e
    join owners o using (owner_key)
    group by e.owner_key, wk
  )
  select date_trunc('week', o.first_seen at time zone 'America/Toronto')::date as week,
         count(distinct o.owner_key)::int as users,
         count(distinct a.owner_key) filter (where a.wk = 1)::int as w1,
         count(distinct a.owner_key) filter (where a.wk = 2)::int as w2,
         count(distinct a.owner_key) filter (where a.wk = 3)::int as w3,
         count(distinct a.owner_key) filter (where a.wk = 4)::int as w4
  from owners o
  left join activity a using (owner_key)
  group by 1
  order by 1;
$$;
-- Server-side only: the service key may run it, browsers may not.
revoke execute on function public.retention_cohorts() from public, anon, authenticated;
grant execute on function public.retention_cohorts() to service_role;

-- ---------- sponsors (sponsored venue placements, 2026-08-15) ----------
-- The B2B revenue layer: one row per paying placement. entry is a
-- catalog-shaped card (title/category/tags/location/venue/description/
-- cost_tier/good_for_ages/maps_url/booking_url/lat/lng). Serving rules live
-- in services/sponsors.js (max 1 per feed, relevance-gated, always labeled).
-- Service-key only: no anon/authenticated policies on purpose.
create table if not exists public.sponsors (
  id                      text primary key,
  entry                   jsonb not null,
  tier                    text not null check (tier in ('featured','spotlight','anchor')),
  status                  text not null default 'active' check (status in ('active','paused','ended')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  starts_at               timestamptz not null default now(),
  ends_at                 timestamptz,
  created_at              timestamptz not null default now()
);
alter table public.sponsors enable row level security;

-- ---------- outreach CRM + admin roles (2026-08-18) ----------
-- One row per prospect (venues now, investors later). The cadence engine
-- (services/outreach.js) and the admin panel's CRM tab share these rows, so
-- automation and human actions never disagree about state. Service-key only.
create table if not exists public.outreach (
  id             text primary key,
  kind           text not null default 'venue',
  name           text not null,
  contact_name   text,
  email          text not null,
  tier           text,
  stage          text not null default 'drafted',
  hook           text,
  draft          jsonb,
  thread         jsonb not null default '[]'::jsonb,
  last_touch_at  timestamptz,
  next_touch_due timestamptz,
  suppressed     boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists outreach_due_idx   on public.outreach (next_touch_due) where not suppressed;
create index if not exists outreach_stage_idx on public.outreach (stage);
alter table public.outreach enable row level security;

-- Panel roles beyond the env-var owners: operators see the CRM and reduced
-- metrics only; deputies additionally see accounting and can receive
-- ownership. Managed from the panel's Team section (owner-only routes).
create table if not exists public.admin_users (
  email      text primary key,
  role       text not null default 'operator' check (role in ('owner', 'deputy', 'operator')),
  added_by   text,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- Audit trail + delivery signals: automated sends, Resend webhook events,
-- and every human CRM action, with who/when. Never deleted.
create table if not exists public.outreach_events (
  id          bigint generated always as identity primary key,
  outreach_id text not null,
  type        text not null,
  actor       text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists outreach_events_row_idx on public.outreach_events (outreach_id, created_at desc);
alter table public.outreach_events enable row level security;

-- ---------- accounting ledger + roles v2 (2026-08-20) ----------

-- Exactly one owner row; the owner cannot be removed, only swapped via
-- transfer_ownership below. (On a DB created before 2026-08-20, run the
-- matching migration file to widen the role check constraint.)
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users
  add constraint admin_users_role_check check (role in ('owner', 'deputy', 'operator'));
create unique index if not exists admin_users_single_owner
  on public.admin_users ((role)) where role = 'owner';

-- Atomic ownership swap — the only path that changes who the owner is.
-- The old owner is demoted to deputy in the same transaction.
create or replace function public.transfer_ownership(new_owner_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_users
                 where email = lower(new_owner_email) and role = 'deputy') then
    raise exception 'target must be an existing deputy';
  end if;
  update admin_users set role = 'deputy' where role = 'owner';
  update admin_users set role = 'owner' where email = lower(new_owner_email);
end $$;
revoke execute on function public.transfer_ownership(text) from public, anon, authenticated;
grant execute on function public.transfer_ownership(text) to service_role;

-- Accounting ledger: one row per money movement, signed integer cents.
-- Income lands automatically from Stripe webhooks/backfill (external_id =
-- invoice/refund id makes re-delivery a no-op); expenses are entered in the
-- admin panel or materialized monthly from recurring_expenses.
create table if not exists public.ledger_entries (
  id                 bigint generated always as identity primary key,
  direction          text not null check (direction in ('income', 'expense')),
  amount_cents       integer not null,          -- signed; refunds are negative income
  fee_cents          integer,                   -- Stripe processing fee when known
  currency           text not null default 'cad',
  occurred_at        timestamptz not null,
  category           text not null default 'uncategorized',
  source             text not null check (source in ('stripe_webhook', 'stripe_backfill', 'manual', 'recurring')),
  external_id        text unique,               -- stripe id or rec:<tpl>:<YYYY-MM>; null for manual
  stripe_customer_id text,
  counterparty       text,                      -- vendor or customer email
  description        text,
  created_by         text,
  meta               jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists ledger_occurred_idx on public.ledger_entries (occurred_at);
create index if not exists ledger_dir_cat_idx  on public.ledger_entries (direction, category);
alter table public.ledger_entries enable row level security;
revoke all on public.ledger_entries from anon, authenticated;

-- Recurring expense templates (Render, Resend, domain...). Materialized
-- into ledger_entries once per month by the server's 2AM Toronto tick.
create table if not exists public.recurring_expenses (
  id           text primary key,                -- slug, e.g. 'render-hosting'
  vendor       text not null,
  category     text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'cad',
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  note         text,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from anon, authenticated;

-- Stripe webhook replay dedupe (2026-08-30). Signature verification proves
-- origin, not novelty — processed event ids are recorded so a replayed or
-- re-delivered event can't re-fulfill a guide purchase or re-activate a
-- cancelled subscription across restarts.
create table if not exists public.stripe_webhook_events (
  event_id     text primary key,              -- Stripe evt_... id
  event_type   text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- ---------- api_cache / api_usage (services/apiCache.js) ----------
-- Shared L2 cache for metered third-party calls (Google Maps). Survives
-- deploys and is shared by every instance, so a Text Search is bought once
-- across ALL users instead of once per process. Server-side only (service
-- key) - no anon policies. Rows expire logically; prune with:
--   delete from public.api_cache where expires_at < now() - interval '30 days';
create table if not exists public.api_cache (
  key         text primary key,
  payload     jsonb not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index if not exists api_cache_expires_idx on public.api_cache (expires_at);
alter table public.api_cache enable row level security;
revoke all on public.api_cache from anon, authenticated;

-- Daily spend meter per SKU so a restart cannot reset MAPS_DAILY_BUDGET_USD.
create table if not exists public.api_usage (
  day         text not null,          -- YYYY-MM-DD, Toronto
  provider    text not null,          -- google_maps
  sku         text not null,          -- text_search_ent_atm, place_photo, ...
  calls       integer not null default 0,
  usd         numeric(10,4) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (day, provider, sku)
);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;
