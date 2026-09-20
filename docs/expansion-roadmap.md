# Geographic expansion roadmap — city-by-city, not a Canada-wide sprint

Decided 2026-09-19, following the pre-Flare geo-expansion research
(`docs/geo-expansion-research.md`). That doc established that DayHop's
actual moat — verified local knowledge, not the AI planner itself — is
geography-bound by construction and expands only as fast as the
verification labor behind it. This doc turns that constraint into an
explicit sequence, rather than trying to cover Canada at once.

## Philosophy

Depth before breadth. Each city gets the **same rigor already proven on
the GTA roster** — every catalog entry verified against a real source
(distance, rating, address) before it's added, the same discipline used
for Snyder's Family Farm, Down Home Restaurant, and Bonnechere Caves
this month — not a bulk import of scraped listings wearing DayHop's
"verified pick" framing. A city isn't "done" until it has the full set:
a hub city guide, satellite/regional guides (mirroring the existing
Toronto + Richmond Hill/Markham/Newmarket/Hamilton/Lake Simcoe pattern
in `data/cityGuides/`), and its own "worth the drive" day-trip catalog
entries scored by real distance from that city (the existing
`distance_km`/`DAY_TRIP_MAX_KM` mechanism in `services/candidates.js`
and `routes/browse.js` already computes this per-visitor — see Part 1
of the research doc — so a new city's catalog entries work immediately
once they exist, no architecture change needed).

## Sequence

1. **GTA** (current) — stays at full weekly scouring intensity. This is
   the proven, revenue-adjacent market; nothing here slows down.
2. **Vancouver** (2nd largest Canadian metro) — first expansion target.
   Full buildout: hub guide + satellite cities (Burnaby, Richmond BC,
   Surrey, North Vancouver, Victoria as a "worth the drive" candidate,
   etc. — exact satellite list to be scoped when this phase starts) +
   day-trip catalog, same verification bar as GTA.
3. **Montreal** — same full buildout, second expansion target (Laval,
   Longueuil, and Quebec City as a further "worth the drive" candidate
   to be scoped similarly). Note: Quebec content needs French-language
   consideration (guide copy, at minimum bilingual SEO) — flagged here,
   not solved here.
4. **Decision gate** — only after Vancouver and Montreal are live and
   have run long enough to read results does DayHop evaluate whether to
   expand into non-major-city Ontario (the "Ottawa tier" and below).
   Explicitly not a Canada-wide sprint — each step is evaluated before
   the next starts.

## Scouring cadence by tier

- **GTA (primary market):** current weekly scouring cadence, unchanged
  — this is the market actually being tested for revenue right now.
- **Vancouver / Montreal (once live):** a lighter cadence than GTA —
  not a full weekly pass, but a regular (e.g. biweekly/monthly, to be
  set once live) check for trending spots in that city specifically.
  Lighter because these markets won't carry GTA's traffic/attention
  volume initially, so the same weekly intensity isn't yet justified.
- **Opportunistic cross-Ontario layer (starts now, costs nothing extra):**
  while doing the regular GTA scouring pass, don't discard a clearly
  good, verifiable find just because it's not GTA-adjacent — catalog it
  under its *own* nearby major city instead. This is exactly what
  happened this month with Bonnechere Caves: found via a general-Ontario
  reel, verified as too far for a GTA day trip (~300km from Toronto),
  but a genuine ~150km day trip from Ottawa. It cost nothing to catalog
  once verified, and immediately gives an Ottawa-origin visitor a real
  "worth the drive" result instead of an empty shelf — well ahead of
  Ottawa ever getting a dedicated buildout. This layer is not a
  substitute for the systematic sequence above; it's a low-cost way to
  avoid empty shelves for secondary markets in the meantime.

## Resourcing idea worth testing: Flare creators as local scouts

If Flare's creator matching surfaces a Vancouver- or Montreal-based
creator for the UGC campaign, their content is itself a low-cost
discovery channel for that city's catalog — the same way Instagram
reels (Snyder's Family Farm, Down Home Restaurant, the Ontario scenic
reel) have been the discovery mechanism for GTA/Ontario finds this
month. Worth treating a Flare creator's own city as a signal for which
city to prioritize next, rather than deciding the sequence purely by
population rank.

## Sequencing decision (confirmed 2026-09-20)

Vancouver and Montreal buildouts are real, ongoing verification labor —
the same kind of work behind every GTA catalog entry — not a one-time
cost. That's a commitment of ongoing time/attention while DayHop is
still at **$0 MRR** and actively cutting costs elsewhere (Claude Pro
downgrade, BLG pause — see `docs/tools.md`). **Confirmed: planning now,
execution deferred.** Everything in this document — the sequence, the
per-city buildout definition, the cadence tiers, the Flare-creator
resourcing idea — is planning work and proceeds immediately, since it
costs nothing. The actual verification labor (scouting and cataloguing
real Vancouver/Montreal venues, building their city guides) does not
start until GTA clears its own revenue gates (Gate 1/Gate 2 in
`services/operatorReport.js`) — the same "every line has to earn its
slot" discipline already governing every other tool/spend decision this
quarter. The opportunistic cross-Ontario layer above (e.g. Bonnechere
Caves for Ottawa) is exempt from this — it's zero-cost, reactive to
finds that surface during GTA's own scouring pass, not a dedicated
effort.

## Status

**Planning phase — active.** Execution (city guides, catalog entries,
scouring cadence for Vancouver/Montreal) is deferred until GTA clears
its revenue gates, per the confirmed sequencing decision above. This doc
is the living planning record; it should be extended (satellite city
lists, city guide scoping, etc.) rather than replaced as planning
continues.
