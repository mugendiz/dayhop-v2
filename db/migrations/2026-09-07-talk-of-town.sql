-- db/migrations/2026-09-07-talk-of-town.sql
-- "Talk of the town" shelf (services/talkOfTown.js): the weekly, verified
-- pick of outdoor happenings per region hub (data/tottHubs.js). Server-side
-- only via SUPABASE_SERVICE_KEY — no anon policies. Paste into the Supabase
-- SQL editor once; db/schema.sql carries the same block for fresh installs.

create table if not exists public.talk_of_town (
  id          text primary key,             -- tott-<hub>-<slug>-<week>
  hub         text not null,                -- data/tottHubs.js id
  entry       jsonb not null,               -- candidate-shaped pick (title, venue, dates, url, lat/lng, why…)
  week_start  date not null,                -- Toronto Monday of the refresh week
  status      text not null default 'active' check (status in ('active','retired')),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists talk_of_town_hub_status_idx on public.talk_of_town (hub, status, week_start desc);
alter table public.talk_of_town enable row level security;
revoke all on public.talk_of_town from anon, authenticated;
