-- DayHop V2 — 2026-10-19 — checkout_attempts (abandoned-checkout recovery)
--
-- Every checkout session we mint gets a row HERE, with the buyer's email
-- captured on dayhop.quest BEFORE Stripe (email-first checkout). Guests used
-- to go straight to Stripe and bounce before typing an email there: 20 of 23
-- historical sessions have no customer email, which made recovery impossible.
--
-- The recovery sweep (services/checkoutRecovery.js, every 15 min) finds rows
-- older than 60 minutes with no completed_at and no recovered_at, and sends
-- ONE recovery email. completed_at is stamped by fulfillCheckoutSessionOnce
-- (webhook AND thanks-page paths), so a buyer who paid never gets nudged.
--
-- RLS: NO anon/authenticated policies on purpose. This table holds PII
-- (buyer emails) and is read/written exclusively server-side with
-- SUPABASE_SERVICE_KEY — same posture as newsletter_subscribers.

create table if not exists public.checkout_attempts (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  product_type      text not null check (product_type in ('guide', 'pro')),
  product_label     text not null default '',
  guide_slug        text,
  stripe_session_id text not null unique,
  created_at        timestamptz not null default now(),
  recovered_at      timestamptz,
  completed_at      timestamptz
);

create index if not exists checkout_attempts_sweep_idx
  on public.checkout_attempts (completed_at, recovered_at, created_at);

create index if not exists checkout_attempts_session_idx
  on public.checkout_attempts (stripe_session_id);

alter table public.checkout_attempts enable row level security;
