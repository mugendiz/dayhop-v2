# Discovery quality plan — search relevance, image rendering, details page

Commissioned 2026-09-20 after a founder report: a location-discovery
search returned unrelated results (splash pads for a food-and-drinks
outdoor query), rooftop coverage read weaker than a general-purpose
Gemini search on the same query, and images/rendering had visible
problems. Below is what's actually verified in the code (not guessed),
plus a prioritized fix plan. The Gemini screenshots were provided after
the initial plan — see Issue 4 for the direct comparison and a concrete,
buildable fix using infrastructure DayHop already has.

---

## Issue 1: relevance — generic modifier words collide with specific intent

**Root cause, verified in `data/themes.js`:** `matchThemes()` (line 129)
scores every theme by trigger-word hits in the prompt and returns the
top `max=2` by hit count, ties broken by original array order. For the
prompt **"food and drinks outdoors"**:

- `patios` theme (line 61) matches "drinks" → 1 hit
- `food` theme (line 69) matches "food" → 1 hit
- `nature` theme (line 86) matches **"outdoors"** → 1 hit

All three tie at 1 hit. `nature`'s triggers list includes bare
`'outdoors'` (line 87) alongside hike/trail/forest/garden/picnic — a
generic modifier sitting in the same list as specific nature nouns. On
a 3-way tie, `patios` and `food` currently win the top-2 slots by
array-order tiebreak (they're declared before `nature`), so the more
likely live cause of splash pads specifically leaking in is either (a)
a different prompt phrasing that shifts the tie the other way, or (b)
Grok's own free-text interpretation of "outdoors" broadening the result
set independent of theme selection — I can't fully isolate which without
live Grok/Places access, which this session doesn't have.

**What's fixable regardless of which mechanism dominates:** a single
generic word like "outdoors" or "outdoor" has no business being a
first-class trigger for one specific theme (`nature`) when it's
semantically compatible with nearly every theme (patios are outdoors,
water parks are outdoors, adventures are outdoors). Sitting in one
theme's trigger list means it can only ever help that one theme win
ties it has no real claim to.

**Fix:**
1. Remove bare `'outdoors'`/`'outdoor'` from `nature`'s triggers — keep
   the specific nouns (hike, trail, forest, garden, picnic, birdwatching).
   A query just saying "outdoors" with nothing else should fall through
   to the general/live-search path, not force-win a specific theme.
2. Add a scoring tier: when a prompt contains a specific-activity trigger
   (food, drinks, patio, rooftop) AND a generic-setting word (outdoors,
   outside), weight the specific trigger higher rather than treating
   every hit as equal. Concretely: tag each trigger `specific: true/false`
   in the theme definitions, and in `matchThemes`, count specific hits at
   2x weight before applying the `max` cutoff.
3. Add a regression test in whatever test file covers `data/themes.js`
   (check for one first) asserting `matchThemes("food and drinks
   outdoors")` returns `patios`/`food`, not `nature`, and doesn't rank
   `water`/`kids-outdoor` (which carries the `'splash'` tag) ahead of them.

## Issue 2: broken image rendering (the reported "picture display" bug)

**Root cause, verified in `public/app.js` and `routes/img.js`:** the
image proxy (`/api/img`) fails closed on purpose for a dead link, a
timeout, a blocked host, a non-image response, or an oversized source —
it returns a JSON error body with a 4xx/5xx status (`routes/img.js`
lines 76-113). That's correct proxy behavior. The problem is the
`<img>` tags pointing at it have no failure handling in several places
that do have `onerror` fallback elsewhere in the same file (the pattern
already exists and works — event modal images, prev/next plan preview,
tiny shortlist thumbnails). Missing it:

- **Main feed cards** — `public/app.js:1983`
- **Detail panel hero image** — `public/app.js:2116`
- **Detail panel photo gallery** — `public/app.js:2397` and the
  lazy-loaded gallery at `public/app.js:2490-2491` (the exact "after
  the button is clicked" detail page you flagged)
- **Plan-stop photo** — `public/app.js:2985`
- **Shared-plan preview thumb** — `public/app.js:5514`

Any one of these showing a broken-image icon reads as "the app is
buggy," even though only the image, not the data, failed.

**Fix:** apply the same `onerror="this.onerror=null;this.src='<category
fallback>'"` pattern already proven at lines 4189/4251/4421/5678 to the
five spots above. `categoryImage(idea.category, width)` is already the
right fallback call — it's already imported/available in this file's
scope, so this is a mechanical fix, not a new system.

## Issue 3: the details page needs a design pass, not just reliability fixes

**What's already there (verified in `routes/details.js` +
`public/app.js:2484-2519`):** hero image, a full info grid (location,
distance, venue, date, ages, duration, cost, rating), booking links,
an add-to-day button, then a lazy-loaded second course: extra photos,
live open/closed state, Grok-sourced typical-busy-time, editorial
summary, history, up to 4 facts, a tip, and opening hours. Structurally
this is comparable in *content* to a Gemini-style result — the gap is
likely presentation and reliability, not missing data fields:

- **Reliability**: the "second course" depends on two independent
  network calls (Google Place Details + Grok facts) succeeding. Either
  can silently return null (both are wrapped in `.catch(() => null)`),
  and when both fail, `detail-more` renders empty after showing a
  skeleton loader — a dead-feeling page with no visible failure, no
  retry. Worth an explicit "couldn't load extra details right now" state
  instead of silent emptiness.
- **Visual hierarchy**: the current layout is a plain definition list
  (`<dl class="detail-grid">`) — functional, not "enticing." A Gemini-
  style result leads with a large hero image and groups info into
  visually distinct cards/chips (open-now badge, rating badge, price
  badge) rather than a label/value list. This needs actual CSS/layout
  work, not just data — out of scope to fully redesign without your
  input on visual direction, but the shape of it: hero image full-width
  at the top, a horizontal row of "at a glance" chips (open now · ★
  rating · $$ · 12 min away) instead of a `<dl>`, then the gallery,
  then facts/tip/hours below.

**Fix, phased:**
1. Reliability first (cheap, no design risk): explicit failure state for
   the second-course load instead of silent emptiness.
2. Visual pass (needs a design decision from you): convert the `<dl>`
   info grid into a chip row, make the hero image larger/full-bleed,
   and give the photo gallery a proper grid instead of an inline strip.

## Issue 4: direct Gemini comparison (screenshots reviewed 2026-09-20)

Two Gemini exchanges were reviewed: (1) "find the prices" for Koré
Rooftop, (2) a follow-up "find other rooftops in the GTA," returning a
list (KŌST, Lavelle, The Rooftop, ...). Each list result showed: a
photo, star rating (4.4, 3.7, 4.3), a price range where available
(CA$30–CA$80), a category tag, **live open/closed status with the
specific closing/opening time** ("Open · Closes 10:00 PM"), a
descriptive paragraph, and bulleted "Highlights" and "Vibe" tags. The
price query separately returned an itemized menu breakdown (appetizers
$14–$22, mains $22–$45+, desserts/drinks $12–$22, private event
packages $150–$350+) sourced from the venue's Facebook page and
website.

**What this actually reveals — verified against DayHop's own code, not
assumed:** Gemini's per-result richness (rating, live hours, price tier)
maps closely to fields DayHop's `routes/details.js` **already
requests** from Google Place Details (`place.rating`, `place.open_now`,
`place.open_hours` are already used in the detail panel, per Issue 3).
The real gaps are two specific, fixable ones:

1. **That richness only shows in the detail panel, one click deep — not
   on the main feed cards**, where Gemini shows it immediately in the
   list. `public/app.js`'s card markup (line ~1983) doesn't render
   `idea.rating`/open-status/price at the card level at all, only in
   the detail panel's `<dl>`. Surfacing rating + open-now + cost_tier
   directly on the card (a small badge row, matching how Gemini's list
   leads with them) would close this without needing new data sources.

2. **The itemized price breakdown Gemini produced isn't something
   Google Places data contains at all** — Places only exposes a coarse
   1–4 `price_level`, never itemized menu ranges. Gemini got that by
   doing a **live web search** (crawling the venue's Facebook post and
   website) and synthesizing it, then citing sources. DayHop's
   equivalent function, `services/grok.js`'s `placeFacts()` (line 608),
   deliberately does **not** search the web — it calls `callGrok()` (a
   plain completion) and is explicitly instructed to rely on general
   knowledge and never invent specifics, which is why it returns generic
   facts/tips rather than sourced pricing. DayHop already has the
   infrastructure to close this gap: `callGrokSearch()` (`services/grok.js`
   line 672, "live web/X search via /v1/responses") is already used in
   production by `services/talkOfTown.js`. Extending `placeFacts()` — or
   adding a sibling call — to use `callGrokSearch()` specifically for
   `food`/`patios`-category places, asking for a real price-range
   summary with the same no-fabrication discipline (only report what a
   citation actually supports), would let DayHop match this specific
   capability using a tool it already has in production, not a new
   integration.

**Fix, phased:**
1. Card-level badges (rating, open-now, cost_tier) — cheap, uses data
   already fetched for the detail panel, no new API cost.
2. Search-grounded price summary for food/patios categories via
   `callGrokSearch()` — real but bounded scope: one new prompt + one
   category-gated call site, reusing existing search infrastructure.

## What I need from you to close the loop

1. **Sign-off to implement Issues 1 and 2 now** — both are scoped, low-
   risk, and don't need a design decision (theme trigger fix + onerror
   fallback pattern already proven elsewhere in the file).
2. **Direction on Issue 3's visual pass** — chip-row layout as described
   above, or a different direction you have in mind.
3. **Sign-off on Issue 4's two fixes** — card-level badges (cheap) and/or
   the search-grounded price summary for food/patios (real but bounded
   new cost: each `callGrokSearch()` call has its own usage cost, unlike
   the plain `callGrok()` calls already budgeted for facts).
