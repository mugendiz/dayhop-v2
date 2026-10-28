# Findings log

Things turned up in passing that change a decision. Not a task list, and not
a record of routine work.

**Why it exists.** So that weeks later you can look back and see whether the
things flagged here actually mattered. That is the only way to learn whether
flagging them is worth anyone's time, and it is the step everyone skips.
Every entry therefore gets a **Reviewed** line, filled in later, honestly,
including when the finding turned out to be noise.

**Format.** Newest first. Every number carries its source and its window, per
rule 2 in `CLAUDE.md`. If you cannot source a number, say you are estimating
and from what.

```
## YYYY-MM-DD Short title
**Finding.** What is true.
**Number and source.** The figure, where it came from, what window, when read.
**Costing.** What it is costing or risking, as concretely as you can.
**Reviewed.** (left blank, filled in later)
```

---

## 2026-10-28 Most catalog photos are still on the metered Google path

**Finding.** The Wikimedia hero pipeline supplements the Google photo path,
it has not replaced it. Under half the curated catalog is served from free,
self-hosted images. The rest resolves through a paid Google SKU on live user
requests, or falls through to Unsplash stock.

**Number and source.** Of 128 `curatedCatalog` entries: 54 served from
verified self-hosted Wikimedia heroes, 59 from baked Google photos that each
cost $0.007 per place per 30 days to resolve through `/api/photo`, and 15
with no image at all, which the frontend replaces with Unsplash category
stock. Traced 2026-10-28 from `services/candidates.js:872-881` (the
three-tier fallback), `data/catalogHeroes.json` (91 keys: 54 verified, 37
rejected tombstones, 0 pending) and `data/catalogPhotos.json`. The two paid
SKUs are `findPhotoUrl` at $0.032/call (`services/googleMaps.js:436-462`,
Text Search Pro) and `getPhotoUri` at $0.007/call
(`services/googleMaps.js:519-539`, Place Photo).

**Costing.** Bounded, not free. The hard caps in `services/apiCache.js`
(`MAPS_DAILY_BUDGET_USD` $1/day, `PHOTO_DAILY_BUDGET_USD` $1/day) stop this
becoming another $100 month, but the cap is what degrades cards to stock
images when it is hit, which happened on Oct 18, 19 and 20 per
`docs/maps-cost.md:99-107`. So the cost of the gap is paid in image quality
on the feed, not only in dollars.

**Reviewed.**

---

## 2026-10-28 The free-photo pipeline is idle, with about 74 entries of headroom

**Finding.** `scripts/hero-images.js` exists precisely to close the gap
above, and nothing is currently queued in it.

**Number and source.** `data/catalogHeroes.json` read 2026-10-28 holds 0
unverified or pending records. 54 are verified, 37 are rejected tombstones
carrying `{rejected:true, wiki_page, rejected_on}` so re-staging skips them.
That leaves roughly 74 of the 128 curated entries never successfully
staged. The pipeline runs from the Actions tab via
`.github/workflows/hero-photos.yml`, because the sandbox cannot reach
Wikimedia.

**Costing.** Each entry moved from the Google path to a self-hosted
Wikimedia hero is permanently free and permanently owned, against $0.007 per
place per 30 days plus exposure to the daily cap. The ceiling on the win is
the 74 entries, minus however many have no licence-clean Commons photo.
Human review is the bottleneck by design: staged heroes are
`verified: false` until a person approves them, because the search is good
at finding the lead photo of the right Wikipedia article and unreliable at
finding a photo of the right place (`scripts/hero-images.js:12-16`).

**Reviewed.**

---

## 2026-10-28 `docs/maps-cost.md` understates the catalog photo cost

**Finding.** The line saying the baked catalog "costs nothing at runtime" is
true of the lookup and false of the resolve, which reads as a stronger
guarantee than the code gives.

**Number and source.** `docs/maps-cost.md:51-53` states that
`data/catalogPhotos.json` "bakes a photo into every curated entry, so the
catalog costs nothing at runtime." The baked value is an `/api/photo?name=`
proxy URL for 111 of 112 entries; serving it calls `getPhotoUri`
(`services/googleMaps.js:519-539`), which charges `place_photo` at $0.007
against the daily budget on a 30-day per-place cache key
(`services/googleMaps.js:476-481`). Read 2026-10-28.

**Costing.** Small in dollars, larger in decisions: a future reader trusting
that sentence would not think to look at the catalog when photo spend blows
its cap, which is exactly what happened in October.

**Reviewed.**

---

## 2026-10-28 Correction: the social shareability work had already shipped

**Finding.** A previous session told the founder that
`claude/social-batch-shareability` was unmerged code sitting unproposed
since Sept 29, and recommended shipping it. That was wrong. The work shipped
the same day.

**Number and source.** Commit `a91463c` on `main` is titled "Social batch:
draft videos that pass the shareability gates" and its body reads "Squash of
claude/social-batch-shareability." The blobs for both
`services/socialBatch.js` and `test/socialBatch.test.js` are byte-identical
between `a91463c` and the branch tip `d39a701`. Main has since built on it
twice, in #41 and #45. Verified 2026-10-28.

**Costing.** Nothing was lost, since the work was live the whole time. The
cost was in the advice: a wrong "this is your only unshipped code" is worse
than silence, because it points attention at a non-problem. Root cause was a
merge check that tested whether a branch's diff still reverse-applied to
`main`, which returns a false negative once `main` edits those same lines.
Commit titles and PR merge records are the reliable signal, not diff
replay.

**Reviewed.**
