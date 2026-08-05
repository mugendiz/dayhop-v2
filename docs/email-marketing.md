# DayHop Email Marketing — Playbook & Operations

Built 2026-08-05. One weekly ritual (the Thursday "weekend brief"), CASL-grade
consent, transactional foundations. No cold outreach, no paid list growth, no
automation empires — by explicit decision.

## What exists (code)

| Piece | Where | What it does |
|---|---|---|
| Transport | `services/email.js` | Resend HTTP API via axios (no SDK). Fail-soft without `RESEND_API_KEY`. Attaches RFC 8058 one-click unsubscribe headers to marketing sends. |
| Subscribers | `services/newsletter.js` | Consent store (memory + `newsletter_subscribers` table via service key, merge-only sync like the ban list). Double opt-in: subscribe → confirmation email → confirm link → welcome email. Unsubscribes flip status, never delete (suppression record). |
| Digest | `services/digest.js` | Builds "This weekend" from the real product pipeline (`gatherCandidates` scoped to Sat-Sun): dated events first, then wow picks. Weather call + advisories (trust contract: silence when data unavailable, never implied all-clear). HTML+text multipart, <80KB. |
| Public routes | `routes/newsletter.js` | `POST /api/newsletter/subscribe`, `GET /confirm`, `GET /unsubscribe` (branded pages), `POST /unsubscribe` (RFC 8058 one-click). Enumeration-safe uniform responses. |
| Admin | `routes/admin.js` + admin.html card | Stats, this-week preview, test send, manual full send. |
| Capture | index.html footer + auth signup checkbox + blog panel | All express-consent (nothing pre-checked), source + IP + timestamp recorded per CASL. |
| Scheduler | `server.js` | Thursdays 9:00-9:59 Toronto (DST-proof clock check, same pattern as discovery autopilot). `DIGEST_HOUR` overrides, `DIGEST_AUTO=off` disables. |
| Analytics | `services/analytics.js` | `newsletter_subscribe` / `newsletter_confirmed` / `newsletter_unsubscribed` / `digest_sent` events. |

## Go-live checklist (user actions)

1. **Re-run `db/schema.sql`** in the Supabase SQL editor (adds `newsletter_subscribers`).
2. **Resend account** (resend.com, free tier 3k/mo · 100/day):
   - Add domain `dayhop.quest` → add the SPF + DKIM DNS records Resend shows.
   - Add DMARC DNS record: `_dmarc.dayhop.quest TXT "v=DMARC1; p=none; rua=mailto:admin@dayhop.quest"`.
   - Put `RESEND_API_KEY` (+ optionally `EMAIL_FROM`, `EMAIL_REPLY_TO`) in Render env and local `.env`.
3. **Supabase auth SMTP** (independent of marketing, required for real traffic):
   Supabase's built-in sender is dev-only (~2 emails/hour). Auth → SMTP settings →
   point at Resend SMTP (`smtp.resend.com:465`, user `resend`, password = API key).
4. **Stripe dashboard emails** (Settings → Emails): enable receipts + trial-ending
   reminders. Zero code, card-network compliance for the 7-day trial.
5. **Google Postmaster Tools**: register dayhop.quest — watch spam rate (keep <0.1%).
6. **Test**: admin dashboard → "Preview this week's issue" → "Send test" to yourself →
   check Gmail (Primary vs Promotions, images on/off, dark mode, phone).

## The research (3 agents, 6 regions, 2026-08-05)

### What the evidence converged on

- **A fixed weekly ritual beats everything.** 6AM City (48% opens, $25+ LTV/sub),
  Axios Local (41% opens), Daily Maverick First Thing (won WAN-IFRA's newsletter
  award; newsletters are the top of their membership funnel), Rakuten's mail
  magazines, theSkimm — all win on *same slot, same structure, every week*.
- **Thursday morning is the slot** for weekend-planning content: event emails
  perform best 3-5 days ahead; Mommy Poppins (the exact niche) sends weekend
  picks mid-week; Tue-Thu 8-11 AM are benchmark peaks. → Scheduler defaults to
  Thu 9 AM Toronto.
- **Subject lines**: concrete, ≤40 chars, no emoji, no first-name insertion
  (Attentive's large-scale 2025 data: both now underperform). Place names do the
  "for people like me" work — the GTA's version of Zomato's Hinglish.
- **Light hybrid HTML** beats both magazine templates and pure plain text (filters
  now sometimes penalize zero-formatting). Single column, <80KB, readable with
  images off (Japan's carrier-blocking lesson), dark-mode tolerant (~40% of opens).
- **The welcome email is the highest-leverage send you'll ever make** (83% avg
  opens): confirm expectations (what/when), ask for a Primary-tab drag, prompt a
  reply ("kids' ages + your corner of the GTA") — replies train Gmail that DayHop
  is wanted mail AND hand over free personalization data.
- **Email's unique role** (the messaging-first-market lesson from WhatsApp/Kakao/
  LINE economies): email wins as the *ritual* (appointment content) and the
  *record* (receipts, confirmations — M-PESA's trust lesson: the receipt IS the
  product's trustworthiness). Zomato-style frequency does NOT transfer; a weekly
  planner has one natural moment.
- **Personalize the picks, not the prose**: Eventful got a 400% reactivation lift
  from recommending the right local events (not from "Hi {name}"); DICE's
  recommendation-driven messaging drives 40%+ of platform sales. DayHop's edge is
  that the digest is generated from the live planning pipeline — it IS the product.
- **Minimal nudges, not automation empires**: TymeBank lifted activation 11% with
  three well-timed nudges. Full stack for DayHop later (all currently out of
  scope by decision): day-5 trial reminder, one warm win-back after ~3 quiet
  weeks ("Long time no plan — this weekend's an easy one").
- **Defer the referral ask** (theSkimm waits 5 weeks post-signup; Morning Brew's
  referrals drove ~30% of 1.5M subs, and social/SMS share links beat email
  forwarding). Revisit when the list is warm — one footer line, WhatsApp-friendly
  share link.

### Deliverability rules now in force (Gmail/Yahoo 2024+, Outlook May 2025)

SPF + DKIM + DMARC (aligned), one-click unsubscribe headers (RFC 8058) honored
within 2 days, spam rate <0.1% target / 0.3% ceiling. Enforcement is
rejection-level in 2026 and thresholds are measured per-domain with no warning
at the 5k/day line — so DayHop implements the full bulk-sender stack from
day one (done in code; DNS is step 2 above).

### CASL (the law that actually applies)

- Express consent = affirmative act, never pre-checked. ✅ (footer/blog forms:
  typing + submitting; signup: unchecked checkbox)
- Consent request states purpose + business name + mailing address + contact. ✅
  (fineprint on every form)
- Every CEM: sender identity, contact info, working unsubscribe (functional 60
  days, honored ≤10 business days — ours is instant). ✅ (compliance footer +
  one-click)
- Burden of proof is on the sender → keep records. ✅ (`consent_source`,
  `consent_ip`, timestamps; unsubscribes retained as suppression rows)
- Penalties: up to CA$10M/violation for organizations. Double opt-in isn't
  legally required but is the gold standard and what we run.
- One standard covers diaspora subscribers under India DPDP / South Africa POPIA /
  Singapore PDPA — no extra machinery needed as long as we never email
  non-subscribers.

## Cadence & measurement

- **Weekly**: digest goes out automatically Thursday morning. Glance at the admin
  card after: sent count, subject.
- **Measure clicks, not opens** (Apple MPP inflates opens). Success metric:
  digest → site visit → plan generated. Watch `newsletter_*` events + funnel on
  the dashboard. Directional targets for the niche: 35-45% opens, CTR ≥3%.
- **Test one variable a week** (Daily Maverick doctrine — the list is too small
  for A/B splits): subject sentiment, send hour, pick count, sender name
  ("DayHop" vs "Mugendi at DayHop" — the named-human pattern outperformed for
  Zomato/Nubank-style brands).
- **List hygiene**: pending rows that never confirm just sit harmlessly; Resend
  handles bounces. If spam rate creeps toward 0.3% in Postmaster Tools, pause
  and investigate before the next send.

## Explicitly out of scope (decided 2026-08-05)

Cold outreach, purchased/scraped lists (CASL-illegal anyway), paid list growth,
multi-email drip sequences, referral machinery. Revisit trial-day-5 and win-back
nudges once the live checkout is verified and the list has real subscribers.
