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

## 2026-11-03 The paid SEO channel cannot be measured; the unpaid AI channel converts best

**Finding.** DayHop pays for an SEO blog autopilot whose traffic it has no
way to see: blog page views are not recorded, and no browse, signup or
checkout event carries a referrer. Meanwhile the only channels with any
attributable result are a finished ad campaign and unpaid ChatGPT referrals.

**Number and source.** `public.articles`, read 2026-11-03: 57 articles,
published 29 in Aug, 25 in Sep, 3 in Oct. `public.events`, all time: 1,881
`browse_feed`/`signup`/checkout events, every one with no first-touch source
in `meta`. `analytics.metrics().acquisition.sources`, all time: zeely /
playbook-aug 14 subscribers (of 22 total in `newsletter_subscribers`);
chatgpt.com 6 prompts, 2 signups, 2 checkouts started; nothing attributed
to the blog or to organic search. BLG cost: US$99 on 2026-09-27 and
2026-10-27 in `ledger_entries`.

**Costing.** US$99 a month (if the BLG charge is real, see the entry below)
for a channel whose return is unknowable as built. Recording blog views and
the referrer would make it decidable within about two weeks of traffic.

**Reviewed.**

---

## 2026-11-03 "External" traffic is still largely the founder; venues got 4 clicks in 30 days

**Finding.** One home IP that the internal filter does not recognise produces
a large share of what the operator report counts as external use, most of
the outbound clicks among it. Real outside traffic is far smaller than the
dashboard suggests, and no venue has received meaningful referrals. Joyride
150, the one warm advertising lead, has received none at all.

**Number and source.** `public.events`, last 30 days (2026-10-04 to
2026-11-03), read 2026-11-03, with `analytics.metrics()` internal owner keys
and `ip-*` keys removed: 432 events, 61 owner keys, 12 venue clicks
(`booking_click` + `maps_click`). Of those, IP 99.229.69.197 accounts for 108
events, 10 owner keys and 8 of the 12 clicks. Lifetime, that IP has 903 of
2,086 external events and 48 owner keys (`metrics().traffic.ips`). Without
it: 55 owner keys, 107 feed browses, 4 venue clicks, 3 shortlist adds, 3
guide checkouts started, 0 paid. Events mentioning Joyride, all time: 0.

**Costing.** Any venue pitch built on the operator report's numbers would
overstate reach to the buyer, a reputational risk, and the $99/mo Spotlight
price has no traffic behind it yet. The internal filter should learn this IP
(or the founder should browse signed in as admin) before traffic numbers are
used in any sales conversation or goal.

**Reviewed.**

---

## 2026-11-03 BabyLoveGrowth may still be billing $99 a month after its pause

**Finding.** The ledger books a BabyLoveGrowth charge on Oct 27, a month
after the pause was supposed to stop billing. Either the pause did not take
and the card is still charged, or the ledger's recurring rows are
auto-generated and overstate spend. Both are worth knowing; only the BLG
billing page says which.

**Number and source.** `public.ledger_entries`, read 2026-11-03: expense
US$99.00 "BabyLoveGrowth SEO blog autopilot (blg); charges the 27th" on
2026-09-27 and again on 2026-10-27. `docs/tools.md` (cost lines updated
2026-10-02) says the pause took effect at the Sep 27 billing date and billing
stops for 5 months. The same ledger books xAI SuperGrok at US$30.00 on Oct 1
and Nov 1, while `docs/tools.md` says the $30 tier was replaced by Lite on
Oct 2 at a price not yet recorded, so that line is at least partly wrong too.

**Costing.** If the BLG charge is real: US$99 a month, US$1,188 a year,
against lifetime income of US$0 (operator report ledger, read 2026-11-03).
That is larger than any revenue DayHop is likely to book this quarter. If it
is a ledger artifact: every spend figure in the operator report and the
leadership brief overstates cost by up to US$99 a month, which distorts any
"cover running costs" target in `GOALS.md` goal 1.

**Reviewed.** 2026-11-03, same day: a ledger artifact, not a leak. The
founder pasted BLG's dashboard: "Status: Paused. Resumes on Feb 17, 2027."
Row 262 (US$99, 2026-10-27, `external_id` rec:babylovegrowth:2026-10,
`created_by` scheduler) was posted by the still-active `recurring_expenses`
template `babylovegrowth`, which knows nothing of the pause. Fix, pending the
founder (an agent was refused write access to the ledger, correctly): set
that template inactive and delete row 262 in the admin accounting tab.
Spend overstated by US$99 for October until then. The SuperGrok template
still books US$30 a month while the plan is Lite, price unrecorded.

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
