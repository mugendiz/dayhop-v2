# Geographic expansion research — pre-Flare launch study

Commissioned 2026-09-19, ahead of launching creator campaigns on Flare
(joinflare.app). Flare's creator pool isn't GTA-fenced — US creators or
Canadian creators outside the GTA are both realistic outcomes of an
"Auto Collab" match. This document answers, from actual code inspection
(not assumption): **what does a non-GTA visitor see today, and is there
anything for them to buy?** First-principles, maximum-truth standard —
findings below are traced to specific files, not inferred from docs.

---

## Part 1: What actually happens today (code-verified)

### First impression, before any interaction

- `public/index.html` title tag: **"DayHop — Plan your perfect GTA day."**
  Meta description: *"DayHop turns a sentence into a realistic family day
  plan around Richmond Hill and the GTA..."* This is what shows in a
  browser tab, a Google search snippet, and a social share card. A US
  visitor sees "not for me" before the page even finishes loading.
- Geolocation is **opt-in only, on explicit gesture** (`public/app.js`
  line ~827, "never on page load"). A visitor who doesn't tap to share
  location gets no automatic redirect to their own city.
- `DEFAULT_CITY` env var (`render.yaml`) is hardcoded to **"Richmond
  Hill"**, `DEFAULT_REGION` to **"Ontario"**. Every route that needs a
  city and doesn't have one falls back to this
  (`services/candidates.js:47`, `services/grok.js:55-56`,
  `routes/browse.js:52`, `routes/generate.js:98`, `routes/surprise.js:65`).
  **A passive US visitor's first generated plan example is Richmond
  Hill, Ontario, Canada — with no indication this is swappable.**

### If they do try to use it for their own city

- There **is** a manual location input (`public/index.html`
  `#location-input`, "📍 Where?"). Typing a real city does work —
  `routes/geo.js` autocomplete falls through to Google's global Places
  Autocomplete for 4+ character inputs once the Ontario-only local list
  (`data/ontarioPlaces.js`) runs out of matches.
- `services/candidates.js:617-657` (`searchPlacesWithThemes`): the venue
  index (`services/venueIndex.js`) only covers **18 pre-bought Ontario
  belt cells** (`data/venueCells.js`). Outside that belt, every query
  falls through to a **live, uncached Google Places API call**
  (`services/candidates.js:639`, "or any query outside the belt"). This
  technically works for any world city — Google Places isn't
  geo-restricted — but every one of those calls draws from the same
  shared `MAPS_DAILY_BUDGET_USD` budget guard that exists specifically
  because of the Aug–Sep Maps billing incident (`docs/maps-cost.md`).
  **A burst of US-city traffic competes for the same $1-3/day budget
  meant for GTA users, with zero pre-caching to soften the cost.**
- The **curated day-trip catalog** (`data/curatedCatalog.js`,
  ~112 hand-vetted entries like Snyder's Family Farm — DayHop's actual
  differentiated content, verified against real sources, not just an
  API dump) is **100% Ontario**. A US visitor gets none of it.
- Seed/curated events (`data/curatedEvents.js` — World Cup watch
  parties, etc.) and civic calendar feeds (`CIVIC_CALENDAR_FEEDS` in
  `.env.example`, "keyless, on by default **for GTA requests**") are
  Ontario-municipality-specific. Ticketmaster/Eventbrite APIs are
  broader and would still surface some real US events, but the
  "local-knowledge" layer disappears entirely.

### Can they pull out their wallet?

**No — structurally, not today.** Checked every monetized surface:

- **City Guides** (the $5 PDF product): `routes/cityGuides.js` and
  `public/guides.html` hardcode exactly **six fixed slugs** — Toronto,
  Richmond Hill, Markham, Newmarket, Hamilton, Lake Simcoe
  (`data/cityGuides/*.js`). There is no mechanism to generate or sell a
  guide for any other city. A US visitor cannot buy a guide for their
  own area — full stop, the product doesn't exist for them.
- **Spotlight** (CA$99/mo sponsorship): targets local GTA businesses
  wanting placement in front of GTA parents. Meaningless to a business
  outside that geography.
- **Free planner**: functional (real venues via live Google Places +
  Grok ranking + real weather), but with none of DayHop's curated moat.
  It is, at that point, a thinner version of asking an LLM directly —
  competent, not differentiated, and nothing in the experience asks for
  payment because nothing paid exists to offer them.

**Bottom line: a non-GTA visitor today gets a working but undifferentiated
free tool and cannot purchase anything relevant to them, regardless of
how good their experience is.** This is the single fact that should
govern the Flare launch scope.

---

## Part 2: First-principles framing

What is DayHop's actual value proposition? Not "an AI that plans days" —
that's a commodity any LLM does passably. The moat is **verified local
knowledge**: Snyder's Family Farm was added only after checking it
against Google Places, distance, and category fit — the same discipline
this session followed to confirm Down Home Restaurant and evaluate the
Flare find. That verification work is real labor, and it is
**geography-bound by construction**. It does not "expand" by flipping a
switch; it expands by doing the same city-by-city work again.

This means: the free planner can be global today (it technically is,
via live Places), but the *reason to trust DayHop over ChatGPT* cannot
be global until the curated layer is built for that geography. Treating
those as the same problem is the mistake to avoid.

---

## Part 3: Answering the specific product questions asked

### "If browsed outside GTA, should the default example city be blank instead of Richmond Hill?"

**Yes, and it's a small, low-risk fix.** Concretely: when no location is
set and IP-geolocation (or a first-load signal) indicates a non-Ontario
visitor, don't populate `DEFAULT_CITY` into the UI silently — show an
explicit "Where are you exploring?" prompt with no pre-filled example,
or a generic non-place placeholder ("your city"), rather than quietly
defaulting to a Canadian town they've never heard of. This costs a
conditional in the frontend init and a lightweight IP-country check
server-side (or client `Intl.DateTimeFormat().resolvedOptions().timeZone`
as a zero-cost proxy) — not a rebuild.

### "Curated locations can be generic if user geo-tags as non-GTA, and the website gets molded around them"

Directionally right, with a caveat: "molded around them" should mean
**brand/copy adapts** (drop "GTA" from headlines, use "your city"
generically, don't show Richmond Hill imagery) immediately — that's
cheap. It should **not** imply the curated-quality content adapts
immediately — that requires the same verification labor as every GTA
catalog entry, and pretending otherwise (e.g., letting raw Google
Places results wear DayHop's "verified pick" framing) would be the
first crack in the trust the curation exists to build.

### "Region-specific for Canadian users, US-focus for US influencers, without stretching the utility"

Recommended split, in order of effort vs. payoff:

1. **Canada-wide (not just GTA) is the cheaper, closer expansion.**
   Same currency, same civic-holiday infrastructure already exists
   (`services/spotlight.js` Ontario holiday calendar — extending to
   other provinces is data entry, not architecture), same legal/tax
   context for Spotlight-style sponsorships. This is the honest "next
   belt" to build before any US work.
2. **US should not get a "focus" build yet — it should get a floor.**
   Concretely: make sure the free planner doesn't embarrass the brand
   for a US visitor (fix the default-city and copy issues above), and
   explicitly **do not** show CA-only pricing/guide upsells to a
   detected US visitor (a $5 CAD guide for a city that doesn't exist is
   worse than no upsell at all — it signals the product wasn't built
   for them, undermining trust rather than building it). Building
   actual curated US content before there's proof the GTA market itself
   converts would violate the same $0-MRR discipline already governing
   BLG/Zeely/SuperGrok decisions this quarter.

### "What does a US user see right now, and is there value that causes them to pull out their wallet?"

Answered in Part 1: they see a competent but generic planner wearing
Canadian branding, and there is nothing to buy. Value exists (real
venues, real weather, a genuinely nice interaction model) but it is not
**differentiated** value, and there is no purchase path regardless.

---

## Part 4: Recommendation for the Flare launch specifically

Given Part 1's findings, two honest options — pick deliberately, not by
default:

**Option A — Scope the Flare campaign to GTA/Ontario creators only.**
Matches what the product actually converts today. Lowest risk, and
consistent with the $0-MRR discipline already in place (docs/tools.md
consolidation thesis: every tool has to earn its slot before scaling
scope). Recommended default.

**Option B — Allow US/other-Canada creators in as a deliberate
top-of-funnel/brand-awareness play**, explicitly *not* expecting
conversion from that traffic, and capping Flare spend accordingly so a
viral US-creator moment doesn't (a) blow the shared Maps budget on
uncached queries, or (b) get measured against a conversion rate it was
never positioned to hit. If chosen, ship the default-city/copy fixes
from Part 3 **first** — sending non-GTA creator-driven traffic into the
current "Richmond Hill" default would be actively embarrassing, not
neutral.

**Not recommended:** launching wide on Flare without either scoping
creators or fixing the default-city experience — that spends money to
show strangers a product that visibly wasn't built for them.

---

## Part 5: Make it spectacular anyway

The brand promise — "swipe, shortlist, get outside" — is portable
everywhere today, even where the curated data isn't. The emotional
hook (the Thursday-night scramble, the rainy-Saturday panic, the kid
bored by 9am) is universal, not GTA-specific. That means the *outdoor,
aspirational feel* of the product doesn't have to wait for city-by-city
curation to travel with a creator's audience — only the specific,
verified venue recommendations do. Worth carrying that distinction into
any copy/creative built for a wider audience: sell the feeling
everywhere, sell the specific verified picks where they actually exist.

---

## Open items / next steps

- [ ] Decide Option A vs. B for the Flare launch scope.
- [ ] If B (or eventually either way): ship the default-city fallback
      fix (blank/generic instead of Richmond Hill for non-Ontario
      visitors) and strip CA-only upsells from non-Canadian sessions.
- [ ] If Canada-wide expansion is prioritized: scope the first
      non-Ontario Canadian city guide as a real content project (same
      verification discipline as Snyder's Family Farm), not a copy-paste.
- [ ] No US curated-content build until GTA itself clears Gate 1/Gate 2
      (external revenue) per the existing operator-report rules.
