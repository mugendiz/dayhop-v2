# Google Maps spend — runbook

**Incident:** ~US$100 Google Maps Platform charge (Aug–Sep 2026) for a few
hundred users. Root cause: every Maps cache was a per-process `Map`. Render
restarts the process on every deploy (44 pushes in one week) and every
free-tier spin-down, so the "6h/24h" caches were cold dozens of times a week
and the same searches were bought over and over:

| Leak | Calls | SKU | Why it multiplied |
|---|---|---|---|
| Default-pool warmer | 6 text searches × 2 modes × 3 dayparts/day | Text Search Ent+Atm $40/1k | daypart prompt changes 3×/day, cache 6h, restarts |
| Curated-catalog photos | up to 16 per feed | Text Search Pro $32/1k | 112 catalog venues had no image; re-bought after every restart |
| Per-user location feeds | 7 text searches per unique ~1 km cell × daypart × mode | Ent+Atm | every user's driveway was a new cache key |
| Surprise-me | 6–7 per random prompt variant | Ent+Atm | random variant → cache miss |
| Card images | 1 per photo per process | Place Photo $7/1k | cache lost on restart |

## What now stands between the app and the bill

`services/apiCache.js` fronts **every** call in `services/googleMaps.js`:

1. **L1** in-memory (per process).
2. **In-flight de-dupe** — N concurrent users on the same key share one
   upstream request.
3. **L2** `public.api_cache` in Supabase — survives restarts, shared by all
   instances. Requires `SUPABASE_SERVICE_KEY`; missing table = L1 only.
4. **Stale-on-error** — if Google fails or the budget is spent, an expired
   entry (≤ 30 days) is served instead of nothing.
5. **Daily USD budget** `MAPS_DAILY_BUDGET_USD` (default 3). Counters live in
   `public.api_usage` so a restart can't reset them. Past the cap: Maps calls
   throw `BUDGET_EXCEEDED`, feeds fall back to catalog + other sources,
   cards fall back to stock photos. `/health` (admin) shows `maps_usage`.

Cache keys are coarse on purpose (search ~5 km cell, reverse geocode ~1 km,
autocomplete ~50 km) and TTLs are long (search 3 d, photo search 14 d,
photo URI 7 d, geocode 30 d).

`data/catalogPhotos.json` (from `scripts/photo-catalog.js`) bakes a photo
into every curated entry, so the catalog costs nothing at runtime. Re-run
the script after adding catalog entries — it only looks up new ids.

## Operator checklist

- [ ] Run the `api_cache` / `api_usage` blocks from `db/schema.sql` in the
      Supabase SQL editor (one-time).
- [ ] Set `MAPS_DAILY_BUDGET_USD` on Render (3 is the default if unset).
- [ ] Google Cloud → APIs & Services → Places API (New) → Quotas → set
      **Requests per day** to ~300, and Geocoding API to ~500. This is the
      hard stop that holds even if the app misbehaves.
- [ ] Google Cloud → Billing → Budgets & alerts → $20/month alert.
- [ ] Watch `/health` → `maps_usage.spent_usd` for a week; expect < $0.50/day.

## Next levers if the bill needs to drop further

1. Drop `places.outdoorSeating` from the Text Search field mask
   (Enterprise+Atmosphere $40/1k → Enterprise $35/1k); the patio gate then
   falls back to type-based evidence.
2. Drop the duplicate 20 km prompt search in hyper-local gathers
   (`searchPlacesWithThemes`) — one fewer call per cold gather.
3. Prune `api_cache` monthly:
   `delete from public.api_cache where expires_at < now() - interval '30 days';`
