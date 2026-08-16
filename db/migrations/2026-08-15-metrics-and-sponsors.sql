-- DayHop migration 2026-08-15: retention RPC + sponsors table.
-- Paste this whole file into the Supabase SQL editor and Run. Idempotent.
-- (Both blocks are also in db/schema.sql — this file is the delta since
-- the last schema run, so one paste brings a live DB current.)
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
