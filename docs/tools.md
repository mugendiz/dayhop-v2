# DayHop tool & service inventory

> Purpose: one list of everything the business runs on, what it costs, and
> whether it could be consolidated, downgraded, or replaced. Paid tools also
> live in the accounting ledger (admin panel → Money → Accounting) as
> recurring expenses — this doc adds the free ones and the consolidation
> notes the ledger can't hold. Review monthly alongside the P&L.
> Last full review: 2026-08-20.

## Paid (in the ledger as recurring)

| Tool | $/mo (USD) | What it does for DayHop | Consolidation notes |
|---|---|---|---|
| Anthropic Claude Max 5x | 100.00 | All engineering, ops automation, research, content planning (Claude Code) | The consolidation *target* — see thesis below |
| BabyLoveGrowth (BLG) | 99.00 | Daily SEO article autopilot on /blog, Reddit/Quora opportunity feed, AI-visibility monitoring, backlink network | Highest overlap with Claude: article writing, keyword picks, and Reddit/Quora drafts are all promptable. BLG's moats: hands-free daily cadence, opportunity crawling, backlink network. Verdict gate: if blog clicks stay ~0 by the day-90 review (~Nov 4), replace with a Claude weekly content pipeline |
| Zeely Growth | 79.95 | Ad creative generation (image/video), brand DNA, Meta campaign launcher, social scheduling | Overlaps Claude+grok-imagine for creatives (the Hopper pipeline already does this). Zeely's moats: ad-format templates/gallery, one-click Meta launch. Verdict gate: if the zeely-ab-aug26 arm loses two Friday checks and no Meta campaigns launch, cancel before the Oct 10 renewal |
| xAI SuperGrok | 30.00 | Founder's Grok subscription (research, imagine access in app) | Distinct from the API key; keep while imagine-driven content pipeline is active |
| xAI API (Grok) | ~2.50 avg (usage) | The product's AI planner + curation + social batch drafts | Core product dependency — not consolidatable; watch per-call cost in ledger one-offs |

Renewal days: Claude 1st · SuperGrok 1st · Zeely 10th · BLG 27th (all auto-post via recurring templates).

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
scoreboard: today's stack costs ~$311/mo USD against $0 MRR — every line
has to earn its slot.
