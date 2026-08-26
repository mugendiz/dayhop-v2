# City Guide Edition Blueprint

How to bring any city guide up to the full Markham-level edition. The
renderer (`services/cityGuides.js`) is shared and every feature is gated on
data blocks in `data/cityGuides/<slug>.js` — an edition upgrade is almost
entirely an authoring pass. Never ship an unverified claim or an unviewed
photo: scores derive from field-checked prose; anything unknown stays blank.

## The data pass (per city, in `data/cityGuides/<slug>.js`)

1. **Coverage audit** — are all must-see nature spots in? Any heritage spots
   worth a section? Add missing entries first (they ripple into counts).
2. **`amen`** per park spot — 0/1/2 for: `lot wash play shade picnic wheels
   water fish transit`. Derive from the field-checked `access` prose; omit
   what you can't back (blank = "not field-verified", the legend says so).
3. **`tr`** per trail — `km kind surface climb(0-2) shade(0-2) crowd(0-2)
   wheels(0-2) boots(1-5) pick`. Feeds the sorted Trail Table.
4. **`shortlists`** — 6 authored conclusions ("full-amenity family day",
   "best without a car", …) the tables point to.
5. **`almanac`** — 12 months of natural events; exactly one `key: true`
   headline month (the page's one coral).
6. **`facts`** — 7–10 establishment-grade field notes; optional `photo` key
   renders a small plate. No folklore.
7. **`icons`** — entry name → stamp type (`dam pond lake creek forest meadow
   valley marsh lookout fish mill farm heritage patio`). Add new icon types
   to `STAMP_ICONS` only when a city truly needs one.
8. **`photos`** — entry name → `{ key, size: 'small'|'large' }` plates.
9. **`companions`** — section label → 3 species (`wild-*` keys are a shared
   library across guides; add new species once, reuse everywhere).
10. **`heritage`** — 3–4 human-history entries, each paired with a park in
    the book. Counted in the ledger/total like any section.
11. **`bonus`** — the rotating patios page: entries + `disclosure`
    (sponsorship call stays honest: unmarked = unpaid). Only venues you can
    stand behind; when unsure, author area-level entries, not named claims.
12. **`ledger`** — four rank titles, city-flavoured (last one is the champion:
    "Warden of the Rouge" / "Warden of the Moraine" …).

## The photo pass

- `node scripts/fetch-guide-photos.js <key> "<term>"` per candidate; keys:
  `<slug>-spot-*` for places, `wild-*` for shared species.
- **LOOK at every image** (the script's own rule). Reject: wrong place,
  wrong species, bleak weather, signs-and-parking shots. Re-fetch with new
  terms or `nth`; delete rejects from disk AND `credits.json`.
- Species plates beat stand-in scenery: never imply a photo of another park
  is this park.

## The renderer pass (only two per-city touches)

- **Poster cover** — author a `draw<City>Poster` scene in the Surveyed Light
  system (five colours, framed window, banded light, one coral disc, ruled
  water, one living witness) and register it in `POSTER_COVERS`. Everything
  else (title, counts, coords, edition month) reads from data.
- Nothing else: tables, almanac, sun clock (computed from `coords`), QRs,
  checklists, ledger, firsts log, whitespace furniture all light up from the
  data blocks.

## Ship checklist

- `getPdf(slug)` builds clean; flip through EVERY page rendered to PNG.
- Rebuild all other guides (no regressions), regenerate
  `scripts/render-guide-previews.js` if the cover changed.
- Restart the local/live server (12 h PDF cache holds the old build).
- Announce: free-updated-editions makes every upgrade a marketing beat.
