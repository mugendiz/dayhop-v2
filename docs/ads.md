# DayHop Paid Acquisition — Infrastructure & Runbook

Built 2026-08-05. The measurement side of running ads is fully wired; it sits
inert until the Meta account exists. Nothing loads, sends, or tracks until the
env vars are set — and UTM attribution works TODAY with zero configuration.

## What exists (code)

| Piece | Where | What it does |
|---|---|---|
| Attribution capture | `public/pixel.js` | On every page: `utm_*` / `fbclid` / `gclid` from the landing URL → localStorage, first-touch, 90-day window. No keys needed. |
| Meta Pixel loader | `public/pixel.js` + `/api/config` | Injects Meta's `fbevents.js` + PageView **only** when `META_PIXEL_ID` is set server-side. Included on the app, blog, playbook, and shared-guide pages. |
| GA4 loader | `public/pixel.js` + `/api/config` | Injects `gtag.js` + page_view **only** when `GA4_MEASUREMENT_ID` is set server-side. Property "DayHop" (Zoka Developer Store account, mugendiz@gmail.com), web stream dayhop.quest, ID `G-DJSKM1YMNE`. Feeds BabyLoveGrowth's Site Traffic panel. |
| Conversions API | `services/metaPixel.js` | Server-side events (survive ad blockers): needs `META_PIXEL_ID` + `META_CAPI_TOKEN`. Emails are SHA-256-hashed before sending. Fail-soft like every integration. |
| Funnel events | routes/services | `Lead` (newsletter subscribe) → `NewsletterConfirmed` (double opt-in) → `CompleteRegistration` (account signup) → `InitiateCheckout` (checkout created) → `StartTrial` (Stripe webhook, carries $5 CAD value). Browser sends only PageView, so nothing double-counts. |
| Stripe attribution | `services/billing.js` | The visitor's campaign (`utm_source/campaign/…`) is stamped into Checkout **and** subscription metadata — every paying customer answers "which ad brought you here" in the Stripe dashboard, forever. |
| Admin rollup | admin dashboard → "Acquisition by campaign" | Subscribers / signups / checkouts per utm source+campaign, from the events table. |
| Health | `/health` (operator view) | `integrations.meta_ads: { configured, mode }` — `test` vs `live` vs `pixel-only`. |

## Using it before any ad account exists (now)

Tag every link you share manually:

```
https://dayhop-v2.onrender.com/?utm_source=reddit&utm_medium=organic&utm_campaign=askto-weekend-thread
https://dayhop-v2.onrender.com/playbook?utm_source=facebook&utm_medium=group&utm_campaign=gta-parents-group
```

Anyone arriving through a tagged link who later subscribes, signs up, or starts
checkout shows up in the admin Acquisition card (and in Stripe metadata if they
pay). This answers "which free channel converts" before spending a dollar.

## When the Meta account exists (your steps)

1. business.facebook.com → create Business portfolio → **Events Manager** →
   Connect data → Web → create the pixel/dataset.
2. Copy the numeric **dataset/pixel ID** → set `META_PIXEL_ID` in Render env
   (and local `.env`). Redeploy. PageView starts flowing from all pages.
3. Events Manager → Settings → **Conversions API** → Generate access token →
   set `META_CAPI_TOKEN`. Server conversions start flowing.
4. **Verify in test mode first**: Events Manager → Test events tab → copy the
   code → set `META_TEST_EVENT_CODE`, redeploy, subscribe with a test email,
   watch Lead appear in the tab. Then REMOVE the test code and redeploy.
5. Verify the domain (Business settings → Brand safety → Domains) — required
   for link ads.

No code changes needed at any step — it's all env vars.

## Event → campaign-objective map

| Meta event | Fires when | Optimize ads for it when |
|---|---|---|
| `Lead` | newsletter subscribe (server-side) | Growing the list (playbook lead-magnet ads) |
| `CompleteRegistration` | account created | Growing free users |
| `InitiateCheckout` | Stripe checkout opened | Warm-up signal, not an objective |
| `StartTrial` | Stripe webhook confirms checkout (value: $5 CAD) | The real objective once volume exists (needs ~50/week for Meta's learning phase — start with Lead until then) |
| `NewsletterConfirmed` | double opt-in completed (custom event) | Never — it's a list-quality diagnostic per campaign |

## The $10–20/day test plan (from the scale-to-$100/day discussion)

- **Audience**: GTA metro, parents, 25–45. One campaign, 2–3 creatives
  (Playbook cover photo beats stock; "what are we doing this weekend?" is the
  hook the research validated).
- **Objective ladder**: start optimizing for `Lead` (newsletter) — cheapest
  conversion, feeds the Thursday digest which does the long-term converting.
  Move to `StartTrial` only if volume supports it.
- **Kill/scale criteria** (check the admin Acquisition card + Ads Manager
  weekly): cost per Lead > $3 after ~$100 spent → new creative or audience.
  Cost per paying customer (StartTrial that survives the trial) > ~$15 →
  ads don't pencil at $5/mo; revisit pricing/annual plan before spending more.
- **Attribution check**: every ad's destination URL must carry
  `utm_source=facebook&utm_medium=cpc&utm_campaign=<name>` — Ads Manager has a
  URL-parameters field; Meta fills `{{campaign.name}}` dynamically if you use
  `utm_campaign={{campaign.name}}`.

## Privacy note

The pixel only loads once `META_PIXEL_ID` is set — at that point the privacy
policy should mention Meta advertising cookies. Emails sent to the Conversions
API are SHA-256 hashed client-of-Meta-side (in `services/metaPixel.js`);
raw addresses never leave the server unencrypted-for-Meta.

## Zeely launch brief (2026-08-15 — user chose Zeely over Meta Ads Manager)

Destination (keeps the whole UTM→Stripe attribution chain working):
`https://dayhop.quest/playbook?utm_source=zeely&utm_medium=cpc&utm_campaign=playbook-aug`

- **Offer in the ad**: the free GTA Family Weekend Playbook (lead magnet) —
  NOT the $5 subscription. Cold traffic converts on free value; the digest
  list is also the sponsorship inventory, so every subscriber has B2B value
  even before consumer revenue works.
- **Copy A (problem)**: "It's Thursday night and you still don't know what
  to do with the kids this weekend. This free GTA playbook fixes that —
  6 sections, age & budget filters, rain-proof backups."
- **Copy B (proof)**: "Real GTA spots, live weather, honest closure alerts.
  The weekend planner Toronto families actually use. Grab the free playbook."
- **Creative**: the storybook-flat illustration set (social/ palette:
  cream/coral/marigold/moss). The trail photo asset works for A.
- **Audience**: GTA parents 27–45, 40 km radius on Toronto, interests
  family/parenting/weekend activities. Start CAD $5–10/day.
- **Success math**: playbook page converts via double opt-in; a digest
  subscriber is the unit that makes Spotlight ($299/mo) sellable. Watch
  acquisition card (utm_source=zeely rows) + newsletter funnel on the admin
  dashboard; kill or iterate weekly, one variable at a time.

## Zeely image-post calendar — 2026-09 batch (30 posts, Sep 20–Oct 19)

30 image posts for Zeely's scheduler, spread ~6/week. Written for a
strategist's overhaul standard (no generic filler — every post names a
real place, a real product moment, or a real date) and produced with zero
new photography: 24 of the 30 use spot photos already in `assets/photos/`
(from the paid City Guides), so the only net-new asset need is for the
6 "special" posts marked *(Zeely-generate)* below. Every post is a
same-day cross-post candidate for Instagram (@dayhopofficial) feed; ones
marked TT are also native fits for TikTok's photo-post mode. Where a
published `/blog` article already covers the topic, it's linked — BLG is
still fully active through the Sep 27 billing date, so this uses it while
it's paid for; no reactivation needed.

Destination for all: `dayhop.quest?utm_source=zeely&utm_medium=social&utm_campaign=fall26-spots`.

| # | Date | Post | Asset | Caption | Blog link | Social |
|---|---|---|---|---|---|---|
| 1 | Sep 20 | Snyder's hidden-gem reveal *(Zeely-generate: farm/pumpkin scene)* | — | "This farm is NOT in Kitchener. We checked before adding it to our day-trip catalogue — corn maze, pumpkins, campfire pods, ~1h15 from Toronto." | — | IG, TT |
| 2 | Sep 20 | Lake Wilcox Park | rh-spot-wilcox.jpg | "Richmond Hill's lake you keep driving past. Full loop, real shade, zero crowds on a weekday." | — | IG |
| 3 | Sep 21 | David Dunlap Observatory Park | rh-spot-ddo.jpg | "A working observatory inside Richmond Hill. Fall nights are when the sky actually cooperates." | /blog/stargazing-near-toronto | IG, TT |
| 4 | Sep 21 | Milne Dam's great blue heron | markham-spot-heron.jpg | "Same heron, same spot, all season — herons hold territory. If you've seen 'the bird' at Milne before, it's probably this one." | — | IG |
| 5 | Sep 22 | Toronto Islands | toronto-spot-islands.jpg | "A ferry ride and you're somewhere that doesn't feel like Toronto anymore." | /blog/toronto-hidden-gems-insiders | IG |
| 6 | Sep 22 | Leslie Street Spit lighthouse | toronto-spot-spit.jpg | "Toronto's weirdest walk: 5km out into the lake on a man-made peninsula, to a lighthouse nobody expects." | /blog/toronto-hidden-gems-insiders | IG, TT |
| 7 | Sep 23 | Fairy Lake, Newmarket | newmarket-spot-fairylake2.jpg | "Newmarket's postcard, and most GTA parents have never heard of it." | — | IG |
| 8 | Sep 23 | Sharon Temple | newmarket-spot-sharon.jpg | "A 200-year-old temple, 45 minutes from downtown Toronto, that most of the GTA has never heard of." | — | IG |
| 9 | Sep 24 | Webster Falls, Dundas | hamilton-spot-webster.jpg | "Hamilton's waterfalls are not a secret anymore — get there before 10am on a weekend or don't bother." | /blog/ontario-road-trip-new-openings | IG, TT |
| 10 | Sep 24 | Dundas Peak | hamilton-spot-dundaspeak.jpg | "The view every Hamilton Instagram photo is secretly taken from." | — | IG |
| 11 | Sep 25 | Sibbald Point, Lake Simcoe | lake-simcoe-spot-sibbald.jpg | "A real sand beach, 1 hour from Toronto, that isn't Wasaga." | /blog/free-toronto-days | IG |
| 12 | Sep 25 | Rouge National Urban Park — Vista trails | markham-spot-vista.jpg | "Canada's biggest urban national park, and it's inside Markham." | — | IG, TT |
| 14 | Sep 28 | Rouge Carolinian forest (trillium fact) | markham-spot-trillium.jpg | "Less than 1% of Canada is this forest type. It's in Markham, and a trillium there takes 7 years just to bloom." | — | IG |
| 15 | Sep 29 | Main Street Unionville | markham-spot-unionville.jpg | "A main street that looks like a movie set, and it's a GO Train away from downtown." | /blog/toronto-farmers-markets-guide | IG |
| 17 | Oct 1 | Dundurn Castle | hamilton-spot-dundurn.jpg | "A real 19th-century castle you can tour, and it's inside Hamilton city limits." | — | IG |
| 18 | Oct 2 | Princess Point, Cootes Paradise | hamilton-spot-cootes.jpg | "Paddle a marsh inside a city — Cootes Paradise doesn't get enough credit." | — | IG |
| 20 | Oct 4 | Scarborough Bluffs | toronto-spot-bluffs.jpg | "The cliffs everyone's seen in photos, and most GTA parents have never actually stood on." | /blog/first-timers-toronto-must-sees | IG |
| 21 | Oct 5 | Distillery District | toronto-spot-distillery.jpg | "Cobblestones, no cars, and it's actually stroller-friendly — rare combo downtown." | /blog/new-in-toronto-2026 | IG |
| 22 | Oct 6 | Kempenfelt Bay, Barrie | lake-simcoe-spot-barrie.jpg | "An hour north and the whole vibe changes — Barrie's waterfront on a fall afternoon." | — | IG |
| 23 | Oct 7 | Jefferson Forest | rh-spot-jefferson.jpg | "The forest inside Richmond Hill most residents have never walked." | — | IG |
| 24 | Oct 8 | Main Street Newmarket | newmarket-spot-mainst.jpg | "Small-town main street, big-city drive time — 40 minutes from downtown Toronto." | — | IG |
| 25 | Oct 9 | **Thanksgiving countdown** *(Zeely-generate: fall/harvest graphic)* | — | "Thanksgiving long weekend is 3 days out and you have no plan. We do — dayhop.quest builds it in 12 seconds." | — | IG, TT |
| 26 | Oct 10 | Rogers Reservoir | newmarket-spot-rogers.jpg | "A reservoir turned wetland trail — East Gwillimbury's best-kept walking secret." | — | IG |
| 27 | Oct 11 | Burr House & artisans' guild | rh-spot-burr.jpg | "A heritage house full of working local artists, in the middle of Richmond Hill." | — | IG |
| 28 | Oct 14 | Mara Provincial Park | lake-simcoe-spot-mara.jpg | "A provincial park most of the GTA drives past on the way to cottage country without stopping." | — | IG |
| 29 | Oct 17 | Stephen Leacock Museum, Orillia | lake-simcoe-spot-leacock.jpg | "A humourist's actual lakeside house, preserved, and open for tours." | — | IG |
| 30 | Oct 19 | **Rainy-day pain point** *(Zeely-generate: relatable meme graphic)* | — | "It's 9am Saturday, it's raining, and your kid is already bored. We built the app for this exact moment. dayhop.quest" | — | IG, TT |

Zeely execution note: this session has no browser/API access to Zeely,
Instagram, or TikTok — the table above is the content/schedule deliverable
for hand-entry (founder or Claude-in-Chrome, already logged in).

**2026-09-29: the Snyder's giveaway (former rows 13, 16, 19) is struck, and
the dates on the remaining rows are dead.** The chain announced a giveaway on
Sep 27, a reminder on Sep 30, and a winner on Oct 3. It was gated on Snyder's
replying with a pass and valid dates, and that email was drafted Sep 19 and
never sent, so no prize was ever agreed. Nothing was posted. Running the
back half of the chain would have congratulated the winner of a contest that
was never announced, for a prize a real business never offered. Struck rather
than rescheduled: Zeely is cancelled as of Sep 27 (docs/tools.md), so the
scheduler these 27 remaining posts were written for is going away.

**Treat the Date column as ordering, not scheduling.** The remaining posts are
evergreen and can go out by hand in any order. Do not bulk-load them against
the printed dates; most are already in the past.
