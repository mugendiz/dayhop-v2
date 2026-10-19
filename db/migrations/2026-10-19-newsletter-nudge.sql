-- DayHop V2 — 2026-10-19 — newsletter confirm nudge
--
-- 9 of the first 20 newsletter signups never clicked the double-opt-in
-- confirmation: nearly half the list died at the confirm email. This column
-- lets services/newsletter.js runConfirmNudge() resend the confirmation
-- exactly once, 24h after signup, to rows still stuck at 'pending'.
-- Unsubscribed rows are never touched (the nudge only selects status='pending').

alter table public.newsletter_subscribers
  add column if not exists confirm_nudged_at timestamptz;
