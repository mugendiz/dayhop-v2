# DayHop tool & service inventory

> Purpose: one list of everything the business runs on, what it costs, and
> whether it could be consolidated, downgraded, or replaced. Paid tools also
> live in the accounting ledger (admin panel → Money → Accounting) as
> recurring expenses — this doc adds the free ones and the consolidation
> notes the ledger can't hold. Review monthly alongside the P&L.
> Last full review: 2026-08-20. Cost lines updated 2026-09-27 (cancellations).

## Paid (in the ledger as recurring)

| Tool | $/mo (USD) | What it does for DayHop | Consolidation notes |
|---|---|---|---|
| Anthropic Claude Pro | ~20.00 | All engineering, ops automation, research, content planning (Claude Code) | Downgraded from Max 5x (US$100) 2026-09-18 — confirm exact billed amount on next statement. Lower ceiling on usage/context than Max; watch for rate-limit friction during heavy sessions. Still the consolidation *target* — see thesis below |
| BabyLoveGrowth (BLG) | 99.00 until Sep 27, then 0.00 (paused) | Daily SEO article autopilot on /blog, Reddit/Quora opportunity feed, AI-visibility monitoring, backlink network | **Pause requested 2026-09-18, takes effect at the Sep 27 billing date — fully active and usable until then, not cancelled.** Founder took BLG's pause option instead of cancelling: full functionality (autopilot, Reddit/Quora feed, AI-visibility monitoring) continues through Sep 27 since it's already paid for; billing then stops for 5 months (resumes ~2027-02-27) with no refund question (nothing was charged to refund). Add a reminder ~2 weeks before resume to decide cancel-vs-continue. Once paused, article writing, keyword picks, and Reddit/Quora drafts can move into a Claude weekly content pipeline; /blog keeps serving existing seed/published articles either way |
| Zeely Growth | 79.95 until cancelled, then 0.00 | Ad creative generation (image/video), brand DNA, Meta campaign launcher, social scheduling | **Cancellation decided 2026-09-27 (founder), ahead of the Oct 10 renewal.** The verdict gate was "cancel unless the zeely-ab-aug26 arm wins or a Meta campaign launches"; neither happened. Creatives move to the Claude + grok-imagine pipeline. The 30-post calendar in docs/ads.md (Sep 20 to Oct 19) loses its scheduler, so those posts either go out by hand or lapse. Nothing in the app calls Zeely; `utm_source=zeely` attribution rows stay valid for historical reads. Confirm the cancellation landed before Oct 10 |
| xAI SuperGrok | 30.00 until cancelled, then 0.00 | Founder's Grok subscription (research, imagine access in app) | **Cancellation decided 2026-09-27 (founder), ahead of the Oct 1 renewal.** Safe for production: the product authenticates to api.x.ai with GROK_API_KEY, billed per token on the separate xAI API line below, so the planner, Talk of the town and the discovery autopilot are untouched. What is lost is the founder's own Grok and Imagine access, which the ad-creative pipeline used. Confirm the cancellation landed before Oct 1 |
| xAI API (Grok) | ~2.50 avg (usage) | The product's AI planner + curation + social batch drafts | Core product dependency — not consolidatable; watch per-call cost in ledger one-offs |

Renewal days: Claude 1st · SuperGrok 1st · Zeely 10th · BLG 27th (all auto-post via recurring templates).

**Cancellations decided 2026-09-27, not yet confirmed as processed.** SuperGrok
and Zeely are both cancelled by founder decision. Neither can be cancelled from
the codebase: they are external accounts with their own billing portals, so the
rows above stay as "decided" until a statement or a cancellation email confirms
it. If either renews anyway, that is a missed cancellation, not a doc error.

## Free tier (no ledger entry — watch for tier limits)

| Tool | Role | Limit to watch |
|---|---|---|
| Render | Hosting (dayhop-v2.onrender.com) | Free tier sleeps; upgrade when traffic or webhook reliability demands |
| Supabase | Postgres, auth, RLS | Free tier row/storage caps; ledger + events grow |
| Stripe | Payments, subscriptions | Pay-per-fee (captured as fee_cents in ledger) |
| Resend | Digest, outreach, alerts, CASL opt-in | Free tier 3k emails/mo |
| Google Maps/Places API | Venue verify, geocoding | $200/mo free credit |
| OpenWeather | Live weather in plans | Free tier caps |
| ECCC GeoMet | Gov weather alerts | Keyless, free |
| Ticketmaster + Eventbrite APIs | Event candidates | Free tiers |
| Viator (PID P00297390) + GetYourGuide | Affiliate bookables | Commission income (shows in ledger when paid) |
| Meta Pixel + CAPI | Ads attribution (inert until ids set) | Free |
| Google Search Console + GA4 (G-DJSKM1YMNE) | SEO + analytics | Free |
| TikTok @dayhop3 + IG @dayhopofficial (Business) | Organic social | Free |
| BLG blog hosting | /blog content | Included in BLG |
| ffmpeg + Remotion (video-factory) | Local video production | Free/open source |
| dayhop.quest domain | Identity | Annual renewal — registrar + cost still unrecorded (TODO) |

## Consolidation thesis (founder, 2026-08-20)

"I'm convinced Claude can do all that Zeely & BLG do — consolidation is the
future." Direction agreed: run both tools hard for now (full-speed traffic
generation), measure them like any format experiment, and let the ledger +
acquisition card decide. Concretely: every paid tool must either show its
UTM arm winning slots or produce revenue-adjacent output by its verdict
gate, or its job moves into a Claude pipeline (articles → weekly Claude
batch; ad creatives → grok-imagine + canvas/Remotion; Reddit/Quora drafts →
Claude with per-post review). The ledger's expense-by-category view is the
scoreboard: current stack through Sep 27 is ~$231/mo USD (Claude Pro ~$20 +
BLG $99 (still active/usable, already paid for) + Zeely $79.95 + SuperGrok
$30 + Grok API usage ~$2.50), dropping to ~$132/mo after Sep 27 once BLG's
pause takes effect — against $0 MRR either way — down from ~$311/mo before
the Claude Pro downgrade (2026-09-18). Every line still has to earn its
slot.

**2026-09-27 update.** With BLG paused and SuperGrok + Zeely cancelled, the
run rate falls to roughly **$22.50/mo** (Claude Pro ~$20 + Grok API ~$2.50),
down from ~$311 six weeks ago. That is a 93% cut. The consolidation thesis is
no longer a direction, it is the stack: everything except hosting, the Claude
seat and metered Grok API calls is gone, and the article, ad-creative and
social pipelines all now depend on a Claude batch that has to actually run.
Against $0 MRR this buys runway, not progress.
