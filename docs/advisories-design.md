# DayHop Advisories & Closures — System Design

> **Status (2026-07-17): Phase 1 implemented** — `services/advisories.js`,
> Places `businessStatus` filtering, advisory-aware candidate search +
> ranking, Grok prompt rules, browse "Sheltered picks" section, frontend
> banner/chips/plan trust line. Verified live against a real hazardous-smoke
> event over the GTA (PM2.5 ≈ 350). Phases 2-3 (One Call 3.0 government
> alerts, Grok trust check) not yet started.

Goal: make DayHop a trustworthy answer to "should I even go today?" — anywhere in the
world, not just the GTA. A friend in Norway or Dar es Salaam should immediately see
smoke, extreme weather, wildfire risk, or closures that would change their plans.

Design principle: **advisories are a thin normalization layer over sources DayHop
already talks to** (OpenWeather, Google Places, Grok), attached in the same place
weather already is (`services/candidates.js`), rendered in the same places weather
already renders (strip above results, card chips, plan notes).

---

## 1. Architecture

```
                       ┌────────────────────────────────────────────┐
                       │        services/advisories.js (NEW)        │
                       │                                            │
  geo {lat,lng}  ───►  │  1. OpenWeather One Call 3.0 `alerts`      │──► area advisories
                       │     (gov weather warnings, global)         │    (weather / fire ban)
                       │  2. OpenWeather Air Pollution API          │──► air-quality advisories
                       │     (AQI + PM2.5, global, free)            │
                       │  3. Derived heuristics from current        │──► baseline everywhere
                       │     conditions (heat/cold/wind/storm)      │    (labelled "estimate")
                       │                                            │
                       │  cache: rounded-coord key, 15-min TTL      │
                       └────────────────────────────────────────────┘

  Google Places `businessStatus` (already-made call, +1 field mask entry)
        ───► per-place advisories (CLOSED_TEMPORARILY / CLOSED_PERMANENTLY)

  Grok live-search "trust check" (Phase 3, optional, heavily cached)
        ───► named closures / wildfire news for a destination
```

Integration point: `gatherCandidates()` already fetches weather when it has `geo`.
Advisories are fetched **in parallel** with weather from the same coordinates, then:

- area advisories ride the response next to `weather` (`{ candidates, weather, advisories, ... }`)
- place advisories (business status) are attached to candidates during normalization
- `relevance.js` demotes advisory-hit candidates; permanently closed are dropped outright
- Grok's system prompts get an `advisoriesHint` beside the existing `weatherHint`
- `routes/generate.js` passes `advisories` through to the frontend on `/`, `/plan` context, and `/replan`

Everything **fails open for generation, but honest for trust**: an advisory-fetch
failure never blocks a plan, but the response carries
`advisories_status: 'ok' | 'unavailable'` so the UI can say "couldn't check
advisories right now" instead of implying all-clear. That distinction is the
whole trust story.

---

## 2. Data sources

### Use what we already have (Phase 1 — no new signups)

| Source | What it gives | Cost / setup |
|---|---|---|
| **OpenWeather Air Pollution API** (`/data/2.5/air_pollution`) | Global AQI (1–5) + PM2.5 → smoke & pollution advisories | Free on the existing `OPENWEATHER_API_KEY`, generous limits |
| **Google Places `businessStatus`** | `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY` per place, worldwide | One extra entry in the existing FieldMask (`places.businessStatus`); no SKU change — the mask already includes rating/priceLevel |
| **Derived from current conditions** (extend `services/weather.js` flags) | Baseline heat/cold/storm/wind advisories everywhere on Earth, even where no government feed exists | Zero — data already fetched |

### One small upgrade (Phase 2 — same vendor, new subscription tier)

| Source | What it gives | Cost / setup |
|---|---|---|
| **OpenWeather One Call 3.0 `alerts`** | Official government weather alerts globally — MET Norway, Environment Canada, NWS, and dozens of national agencies. Includes heat, cold, storm, flood, wind, and often fire-weather warnings, with sender name and expiry | Same API key, but requires the "One Call by Call" subscription (1,000 calls/day free, card on file, hard-cappable at the free limit). With 15-min coord-rounded caching this is far below the free ceiling |

This is the single highest-leverage addition: it's the difference between "DayHop
estimates it's dangerously hot" and "**Heat warning issued by Environment Canada,
in effect until Thursday 8 PM**."

### Grok as safety net, not hot path (Phase 3)

Grok (with xAI live search) can answer "are there active wildfires, smoke events,
or major closures affecting {destination} right now?" — useful precisely where
structured feeds are weakest (e.g. Tanzania). But it's slow, costs money, and can
hallucinate. So:

- **Never in the candidate hot path.** Run it as an async destination-level "trust
  check" cached 6 hours per city, triggered on plan build (not idea browse).
- Output must conform to the advisory schema, `source: 'grok'`, and only
  `caution`/`warning` severity — Grok is never allowed to mark something `danger`
  or closed on its own; that requires a structured source.

### Deliberately deferred

- **NASA FIRMS** (satellite fire hotspots, free, global) — great later if wildfire
  proximity becomes a headline feature; overlaps with One Call fire-weather alerts for v1.
- **WAQI** (better AQ station density in some regions) — OpenWeather AQ is good
  enough to start; swap in only if users report AQ blind spots.
- Per-country parks APIs (NPS, Parks Canada, etc.) — high effort, low coverage
  breadth. Google `businessStatus` + Grok trust check cover the same ground globally.

---

## 3. Data model

One shape for all advisories, whether area-wide or place-specific:

```js
{
  id: 'owm-alert-heat-1721001600',       // stable within a fetch, for dedupe/dismiss
  type: 'weather' | 'air_quality' | 'closure' | 'fire' | 'other',
  severity: 'info' | 'caution' | 'warning' | 'danger',
  scope: 'area' | 'place',
  place_id: null,                        // set when scope === 'place'
  title: 'Extreme heat warning',         // short, card/banner-ready (≤60 chars)
  message: 'Heat warning in effect until Thu 8 PM. Daytime highs near 36°C.',
  source: 'openweather_alerts' | 'openweather_air' | 'google_places' | 'derived' | 'grok',
  source_name: 'Environment Canada',     // human-readable authority (null for derived)
  starts_at: '2026-07-17T12:00:00Z',
  expires_at: '2026-07-17T24:00:00Z',    // null = unknown; re-evaluated on every fetch
  fetched_at: '2026-07-17T15:04:00Z',
  effects: {                             // machine-readable — what the system DOES with it
    avoid_outdoor: true,                 // demote outdoor candidates, tell Grok
    avoid_strenuous: true,               // demote hiking/biking/climbing categories
    blocked: false                       // hard-exclude (closures, danger-level)
  }
}
```

**Severity semantics** (keep to four; every level maps to a distinct product behavior):

| Severity | Meaning | System behavior |
|---|---|---|
| `info` | Worth knowing | Shown in expandable detail only; no ranking effect |
| `caution` | Adjust your plans | Amber chip on affected cards; mild ranking demotion; Grok told to prefer alternatives |
| `warning` | Not recommended today | Amber/orange banner above results; strong demotion; Grok must justify any pick that conflicts |
| `danger` | Do not go / closed | Red banner; affected candidates **excluded** from the pool; Grok never sees them |

Storage: in-memory TTL cache (`Map`, same pattern as `reverseCache` in
`services/googleMaps.js`). Advisories are ephemeral by nature — no Supabase table
needed for v1. If we later want an admin override ("mark X closed manually"),
that becomes a small `advisory_overrides` table merged into the same list.

---

## 4. UI / UX

Principle: **one banner, small chips, always sourced.** Never a wall of warnings.

1. **Area banner** — a sibling of the existing weather strip (`renderWeatherStrip`
   in `public/app.js`), directly above results:
   - Shows only the *highest-severity* area advisory: `⚠️ Heat warning in effect
     (Environment Canada) — your ideas are adjusted for it`. Additional advisories
     collapse behind "+1 more".
   - `warning` = amber tint; `danger` = red, non-dismissable.
   - Always carries source + freshness: "Environment Canada · checked 12 min ago".
   - When the check *failed*: quiet grey line "Couldn't verify local advisories
     right now" — never silently absent.

2. **Card chips** — reuse the Best Match badge pattern:
   - Place-scoped: `🚫 Temporarily closed` (these mostly won't appear because
     they're excluded, but replan-kept stops can carry them).
   - Area-relevant: only when the advisory materially applies to that card —
     e.g. `😷 Smoky air — indoor pick` on the indoor alternatives Grok chose, or
     `⚠️ Outdoor — heat warning` on an outdoor card the user explicitly shortlisted.
   - Chips only at `caution`+. `info` never chips a card.

3. **Plan / guide view**:
   - Advisory summary line in the plan's trust layer ("Checked today's advisories:
     1 heat warning — plan favors shade and water") — and when clean, a subtle
     "No active advisories for this area ✓", which is itself a trust feature.
   - Per-stop chip if a stop conflicts with an active advisory.
   - If advisories *change* after a plan was built (detected on next fetch),
     surface the existing re-plan CTA: "Conditions changed since this plan was
     made — re-plan around it?" — this feeds the Pro replan funnel naturally.

4. **Best Match hero**: a Best Match must never carry a `warning`+ conflict; the
   ranking demotion guarantees this, so no special UI needed beyond the chip rules.

---

## 5. Implementation plan

### Phase 1 — ship this week (existing keys only)

**Backend**
- `services/advisories.js` (new): `getAdvisories({ lat, lng })` assembling
  air-pollution advisories + derived weather advisories; coord-rounded 15-min
  TTL cache; `toPromptHint(advisories)`; `severityRank()` helper; filters
  expired (`expires_at < now`) at read time.
- `services/weather.js`: export the raw conditions it already has (no change to
  the existing hint) — `advisories.js` consumes them for derived advisories
  (`feels_like ≥ 35` → warning, `≥ 40` → danger; wind ≥ 60 km/h → warning;
  thunderstorm → caution/warning).
- `services/googleMaps.js`: add `places.businessStatus` to the FieldMask;
  `normalizePlace` emits `business_status`.
- `services/candidates.js`: fetch advisories in parallel with weather; drop
  `CLOSED_PERMANENTLY` candidates; attach a place-scoped `closure` advisory to
  `CLOSED_TEMPORARILY` ones; return `advisories` + `advisories_status`.
- `services/relevance.js`: demotion term — `blocked` excluded, `warning` −heavy,
  `caution` −mild for candidates whose category conflicts (outdoor/strenuous maps
  off the existing category/tag vocabulary).
- `routes/generate.js`: `toGrokCandidate` gains `advisory: c.advisory?.title`;
  response gains `advisories` + `advisories_status` on generate and replan.
- `services/grok.js`: `buildGroundedSystemPrompt` / `buildReplanSystemPrompt`
  take `advisoriesHint`; new rules (see §Grok below).

**Frontend (`public/app.js`)**
- `renderAdvisoryBanner(advisories, status)` beside `renderWeatherStrip`.
- Chip rendering on cards + plan stops for `caution`+.
- Trust-layer line in guide view; store `state.lastAdvisories` alongside
  `state.lastWeather`; replan nudge when a fresh response's advisories differ.

**Grok prompt additions (both grounded + replan system prompts)**
```
ACTIVE ADVISORIES: {advisoriesHint}
Rules:
- Never select a candidate marked with a closure or danger advisory.
- Under an air quality or smoke advisory, strongly prefer indoor options and
  say why in one short clause ("indoor pick while the air clears").
- Under heat/cold/storm warnings, follow the same indoor/shade/water logic as
  weather, and mention the advisory once in the plan notes — briefly, not alarmist.
- If the user's request directly conflicts with an active advisory (e.g. "long
  hike" during a heat warning), still serve them: pick the safest version and
  note the trade-off in one sentence.
```

### Phase 2 — official government alerts (~1 day + subscription)
- Subscribe to One Call 3.0 (cap at the 1,000/day free tier).
- `advisories.js` calls `/data/3.0/onecall?exclude=minutely,hourly,daily` and maps
  the `alerts[]` array (event → type/severity via keyword table; `sender_name` →
  `source_name`; `end` → `expires_at`). Derived advisories are suppressed when an
  official alert of the same type exists (official beats estimate).
- Advisory-change detection between fetches → replan nudge fires on real alerts.

### Phase 3 — destination trust check (optional)
- On plan build, async Grok live-search check per destination, 6-h cache,
  schema-constrained output, `caution`/`warning` ceiling, always labelled
  "Reported in recent news — verify locally."

---

## 6. Edge cases & policies

- **Data unavailable** → generation proceeds; UI shows "couldn't verify
  advisories," never fake all-clear. `advisories_status` is the contract.
- **Conflicting sources** → highest severity wins per `(type)`; official
  (`openweather_alerts`, `google_places`) beats `derived` beats `grok`.
  Dedupe by `(type, overlapping window)`, keep the later expiry.
- **Fast-moving smoke/fire** → 15-min TTL on AQ; every generate/replan refetches;
  plan view re-checks on focus (the PWA already has a keep-alive pattern) and
  shows the replan nudge on change. We do not push notifications in v1.
- **Expired alerts** → filtered at read time, not just fetch time, so a cached
  entry can't outlive its own expiry.
- **Sparse-data regions (e.g. Tanzania)** → derived advisories guarantee a
  baseline (heat, storms, wind) anywhere OpenWeather has a forecast, which is
  everywhere. Derived ones are visibly labelled "DayHop estimate from current
  conditions" — honest about the difference from an official warning.
- **Over-warning** → thresholds start conservative (OWM AQI 4 = warning, 5 =
  danger; feels-like 35/40; wind 60/90 km/h) and only `warning`+ gets a banner.
  An app that cries wolf loses the same trust this feature exists to build.
- **Timezones** → expiry displayed in the *place's* local time (we have
  coordinates; format with the timezone from One Call, fallback to relative
  time: "for the next ~6 hours").
- **Grok hallucination** → structural: Grok can only *rank against* advisories
  it's given, and its own trust-check output is severity-capped and labelled.
  It can never invent a closure that blocks a place.
