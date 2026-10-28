# DayHop goals

Set by the founder. Status: **DRAFT, not yet confirmed.** See "Filling this in" at the bottom.

## How agents must treat this file

Read it. Never edit it.

Claude, and any other agent working in this repository, may quote these
goals, measure proposed work against them, and say plainly when something is
off track. They may not add a goal, soften a goal, retire a goal, reword a
goal, or change a number here. Only the founder edits this file.

The rule exists because of a specific failure mode. When the goal lives only
in the founder's head, it quietly reshapes itself to match whatever got
built, and the drift is invisible, because nothing was ever written down to
drift away from. A file the agent is forbidden to touch is the fixed point
that makes drift visible.

If work in flight conflicts with a goal below, say so and stop. Do not
resolve the conflict by reinterpreting the goal. The founder resolves it,
either by changing the work or by editing this file.

If a goal here is stale, say that too. Pointing out that a written goal no
longer matches reality is useful. Editing it yourself is not.

## The goals

### 1. Revenue

Get to first recurring revenue, then to a floor that covers running costs.

- Target: `TODO(founder)` paying customers by `TODO(founder)` date
- Current: `TODO(founder)`
- Running cost to cover: `TODO(founder)` per month

Two revenue lines exist in the code today: the Pro subscription via Stripe
(`services/billing.js`, `services/entitlements.js`) and venue ads at $99/mo
(`public/app.js` venue ad card). Say which one is the goal, or say both and
in what order.

### 2. Who it is for

GTA families looking for a day out. Evidenced by `package.json`
("AI-powered local adventure companion for GTA families"), the curated
catalog's geography, and the age filters in the feed.

- Hold this, or widen it? `TODO(founder)`
- Geographic expansion is researched in `docs/expansion-roadmap.md` and
  `docs/geo-expansion-research.md`. Is expansion a goal this quarter, or a
  later option? `TODO(founder)`

### 3. Keep third-party API spend bounded

This one is already real, numeric, and enforced, so it is written in full
rather than left blank.

A Google Maps Platform bill of about US$100 landed in Aug to Sep 2026 for a
few hundred users, because every Maps cache was a per-process `Map` that
died on restart. The response was `services/apiCache.js`, with hard daily
caps: `MAPS_DAILY_BUDGET_USD` at $1/day and `PHOTO_DAILY_BUDGET_USD` at
$1/day, as a separate reserved slice. The full incident record is
`docs/maps-cost.md`.

- Goal: Maps and photo spend stays inside those daily caps, and no change
  ships that reintroduces an uncached per-request Google call.
- Known tension: when a cap is hit, cards degrade to Unsplash stock images.
  That happened on Oct 18, 19 and 20. Cheaper is not free. Raising a cap is
  a founder decision, not an agent decision.

### 4. Photos that are owned, not rented

Prefer permanently free, self-hosted images over metered Google photos,
where a licence-clean one exists.

- Goal: `TODO(founder)` share of the curated catalog served from
  self-hosted Wikimedia heroes
- As of 2026-10-28: 54 of 128 curated entries, 42%. See
  `docs/findings-log.md` for the full source trace.

Constraint that is not negotiable: Google's terms allow caching the photo
URI, not storing the image bytes. `services/placePhotos.js` therefore bans
Google photos outright on the personal-guide PDF path, because that is a
file DayHop sells. Do not relax this.

## Filling this in

Every `TODO(founder)` above is a number or a decision only you have. Replace
them in your own words. Delete any goal that is not actually a goal, and add
any that is missing. Short and specific beats complete.

Once you have, change the Status line at the top from DRAFT to the date you
confirmed it. That date is what tells a future reader, and a future agent,
whether these goals are current or stale.
