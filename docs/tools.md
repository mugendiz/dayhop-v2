# DayHop tool & service inventory

> Purpose: one list of everything the business runs on, what it costs, and
> whether it could be consolidated, downgraded, or replaced. Paid tools also
> live in the accounting ledger (admin panel → Money → Accounting) as
> recurring expenses — this doc adds the free ones and the consolidation
> notes the ledger can't hold. Review monthly alongside the P&L.
> Last full review: 2026-08-20. Cost lines updated 2026-10-02 (SuperGrok is on Lite, not cancelled; amount outstanding).

## Paid (in the ledger as recurring)

| Tool | $/mo (USD) | What it does for DayHop | Consolidation notes |
|---|---|---|---|
| Anthropic Claude Pro | ~20.00 | All engineering, ops automation, research, content planning (Claude Code) | Downgraded from Max 5x (US$100) 2026-09-18 — confirm exact billed amount on next statement. Lower ceiling on usage/context than Max; watch for rate-limit friction during heavy sessions. Still the consolidation *target* — see thesis below |
| BabyLoveGrowth (BLG) | 99.00 until Sep 27, then 0.00 (paused) | Daily SEO article autopilot on /blog, Reddit/Quora opportunity feed, AI-visibility monitoring, backlink network | **Pause requested 2026-09-18, takes effect at the Sep 27 billing date — fully active and usable until then, not cancelled.** Founder took BLG's pause option instead of cancelling: full functionality (autopilot, Reddit/Quora feed, AI-visibility monitoring) continues through Sep 27 since it's already paid for; billing then stops for 5 months (resumes ~2027-02-27) with no refund question (nothing was charged to refund). Add a reminder ~2 weeks before resume to decide cancel-vs-continue. Once paused, article writing, keyword picks, and Reddit/Quora drafts can move into a Claude weekly content pipeline; /blog keeps serving existing seed/published articles either way |
| Zeely Growth | 79.95 until Sep 30, then 0.00 (cancelled) | Ad creative generation (image/video), brand DNA, Meta campaign launcher, social scheduling | **Cancellation decided 2026-09-27 (founder), ahead of the Oct 10 renewal.** The verdict gate was "cancel unless the zeely-ab-aug26 arm wins or a Meta campaign launches"; neither happened. Creatives move to the Claude + grok-imagine pipeline. The 30-post calendar in docs/ads.md (Sep 20 to Oct 19) loses its scheduler, so those posts either go out by hand or lapse. Nothing in the app calls Zeely; `utm_source=zeely` attribution rows stay valid for historical reads. Confirm the cancellation landed before Oct 10. **2026-09-29: founder checked, NOT yet cancelled.** Still used through Oct 9 to schedule the Oct 1 to 9 videos (social/week-2026-09-29.md), so cancel after those are queued and before Oct 10. **2026-09-30: cancelled by founder; Zeely added 30 days of access from the cancellation date, so it stays usable until about Oct 30 with no Oct 10 renewal.** The ad test (Oct 3 to 9) and the Oct 1 to 9 scheduling now fit inside the paid window with room to spare |
| xAI SuperGrok **Lite** | **TBC, amount not yet recorded** | Founder's Grok subscription (research, imagine access in app) | **Downgraded, not cancelled. Lite is ACTIVE as of 2026-10-02 (founder).** The $30 full tier was cancelled on its Oct 1 renewal date, then replaced with Lite rather than dropped, so this is a reduced cost line and not a removed one. **The Lite price needs to go in here and in the ledger before the next P&L; the row is wrong until it does.** Production was never at stake either way: the product authenticates to api.x.ai with GROK_API_KEY, billed per token on the separate xAI API line below. The practical effect of Lite being active is that the xAI ACCOUNT is open, so grok-imagine may still be available to the ad-creative pipeline depending on what Lite includes, which is worth checking before writing creatives off to Claude |
| xAI API (Grok) | ~2.50 avg (usage) | The product's AI planner + curation + social batch drafts | Core product dependency — not consolidatable; watch per-call cost in ledger one-offs |

Renewal days: Claude 1st · SuperGrok 1st · Zeely 10th · BLG 27th (all auto-post via recurring templates).

**Zeely is cancelled, confirmed 2026-09-30, access running until ~Oct 30 and
the Thanksgiving test spends that paid window. SuperGrok was NOT cancelled
outright: the $30 tier ended on its Oct 1 renewal and SuperGrok Lite is
active as of 2026-10-02.** This doc said "CANCELLED, nothing left to chase"
for a day, which was wrong, and the run-rate figure below was wrong with it.
Neither account can be changed from the codebase, so every line here is only
as current as the last time the founder said so. Treat a cost row with no
amount, like Lite's, as an open question rather than a zero.

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

**2026-10-02: the cuts are mostly done, and one of them is a downgrade.**
BLG paused, Zeely cancelled Sep 30, SuperGrok moved from the $30 tier to
Lite on Oct 1 rather than removed. Run rate is **~$22.50/mo plus whatever
Lite costs** (Claude Pro ~$20 + Grok API ~$2.50 + SuperGrok Lite TBC), down
from ~$311 seven weeks ago. The "~$22.50, a 93% cut" figure recorded here on
Oct 1 assumed a cancellation that did not happen; it understates the real
number and should not be quoted until Lite's price is filled in.

Two corrections to what was written on Oct 1. Ad creatives were written off
to the Claude pipeline on the assumption grok-imagine was gone with the seat,
which may not hold if Lite includes it. And the xAI API line is not the only
xAI spend after all, so the ledger has two xAI lines to watch, not one.

**2026-09-27 update.** With BLG paused and SuperGrok + Zeely cancelled, the
run rate falls to roughly **$22.50/mo** (Claude Pro ~$20 + Grok API ~$2.50),
down from ~$311 six weeks ago. That is a 93% cut. The consolidation thesis is
no longer a direction, it is the stack: everything except hosting, the Claude
seat and metered Grok API calls is gone, and the article, ad-creative and
social pipelines all now depend on a Claude batch that has to actually run.
Against $0 MRR this buys runway, not progress.
