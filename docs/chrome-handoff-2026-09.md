# Chrome execution handoff — 2026-09-19

One-shot list of everything ready to execute via Resend, Zeely, and BLG
(all three logged in via Claude-in-Chrome as of today). Nothing below has
been sent, scheduled, or posted yet — this session (Claude Code) has no
browser/API access to any of the three, so all of it is drafted content
waiting on hand-execution.

---

## 1. Resend — two emails to send

### 1a. Reply to Team Snyder (rewritten 2026-09-29: the giveaway is off)

**To:** GuestServices@snydersfarm.com
**From:** admin@dayhop.quest
**Re:** Calling off the giveaway

> Hi Team Snyder,
>
> I owe you a straight answer rather than more silence.
>
> I proposed a family pass giveaway and then did not run it. The dates I floated have come and gone. Nothing was posted, no entries were taken, and no one is waiting on a prize, so there is nothing for you to sort out on your end.
>
> The reason is simple. Our audience is still small enough that a contest would have looked busier than it was, and I would rather tell you that than run one and send you a screenshot of it.
>
> Snyder's is still in our day trip guide, free, where it has been since we added it: the corn maze, the pumpkin patch, the hayride and the campfire pods, with the note that you are in Blandford-Blenheim and not Kitchener, because every listing gets that wrong.
>
> When our numbers are worth showing you, I will send them unprompted, with the real figure attached. If they never get there, you will not hear from me again and you have lost nothing.
>
> If you would rather come off the guide, reply with one word and it is done today.
>
> Andrew
> DayHop, dayhop.quest

**Why the giveaway did not happen (on file 2026-09-29).**

1. **The pitch went out.** On Sep 15 (00:34 UTC, Resend id `3cacfc57-007f-4ec9-8f31-0cccacd56ea9`) Snyder's was sent "A family-pass giveaway for Snyder's, run by us", one of six farm pitches in batch `farms-2026-09-14` (Chudleigh's, Downey's, Brooks, Pingle's, Reesor's, Snyder's). It proposed one family pass, entries the week of Sep 28, and a winner drawn Sat Oct 3. The send is logged in the local `social/ops/sent-log.json`.
2. **Snyder's replied** asking for our Instagram handle. That was the only interested reply of the six.
3. **We never answered.** The follow-up asking which pass and which dates was drafted (Sep 15, then again Sep 19 as the original 1a) and never sent. Without a pass and dates there was no prize, so nothing could be announced.
4. **The audience could not carry it.** As of Sep 15, @dayhopofficial had 24 posts and 0 followers. A contest would have delivered Snyder's nothing, and the reach in a collab post would have come from their audience, not ours.
5. **The dates lapsed and the scheduler went away.** The Sep 27, Sep 30 and Oct 3 posts were never posted and are now struck. Zeely, which was to schedule them, was cancelled Sep 27 (docs/tools.md).

Net: no entries were taken, no prize was promised publicly, and nobody is owed anything. The one thing outstanding is the silence toward Snyder's, which email 1a closes.

**Why this version.** The original asked Snyder's to pick a pass and dates for entries opening the week of Sep 28 and a winner drawn Oct 3. That email was never sent, those dates are gone, and the posts that depended on it are struck. Rewritten to close the loop honestly instead of reopening it: no new deadline, no reach claim the traffic cannot support, and one reversible ask. Written dash free per `docs/copy-style-guide.md`.

**Do not** re-propose the giveaway. Zeely is cancelled (docs/tools.md), so the scheduler the posts were written for is going away, and a contest run to the current audience would embarrass both sides.

### 1b. Reply to the social-proof prospect ("the farm")

**Re:** (their original ask for social proof before proceeding)

> Hi [Name] — fair ask. Here's where we actually are: dayhop.quest just crossed 5 organic clicks from Google Search in the past 28 days per Search Console — small, but real and growing week over week. We're not going to inflate that.
>
> Happy to circle back with an update once the numbers are worth showing off properly — should be weeks, not months, at the pace we're adding.

**Before sending:** the TikTok number is intentionally left out. This session has no live TikTok analytics access, and the one data point in the codebase (`services/socialBatch.js` comment) says @dayhop3 had ZERO posts as of its last edit. If Chrome's TikTok access shows real, current numbers (followers/views/posts), fold them in — otherwise send as-is rather than guess.

---

## 2. Zeely — 30-post image calendar (Sep 20 – Oct 19)

Full table also lives in `docs/ads.md` on branch `claude/zeely-image-calendar` (PR #2, unmerged — https://github.com/mugendiz/dayhop-v2/pull/2). Reproduced here so this file is self-contained.

24 of 30 reuse real photos already in `assets/photos/` (zero new production cost). 6 are marked *(Zeely-generate)* — no existing asset, use Zeely's image generation. Destination for all: `dayhop.quest?utm_source=zeely&utm_medium=social&utm_campaign=fall26-spots` (append `-giveaway` for rows 13/16/19). Every row works for Instagram (@dayhopofficial) feed; rows marked TT are also native fits for TikTok's photo-post mode.

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

**Also still open:** connect at least one social account (Instagram or TikTok) to Zeely so these can auto-post/boost — not yet done as of this handoff.

**Sequencing note (updated 2026-09-29):** the giveaway rows are struck. Nothing in this calendar now depends on a reply from Snyder's, and email 1a no longer asks for one. Dates in the table are ordering, not scheduling: most are in the past and Zeely is cancelled, so the remaining posts go out by hand or not at all.

---

## 3. BLG — active through Sep 27, no task queued yet

BLG is fully active and paid-for through its Sep 27 billing date (pause takes effect after, not before). No specific BLG task has been requested yet — if there's a Reddit/Quora opportunity or keyword pick worth pulling before it pauses, surface it and it'll get folded into the outreach/content plan above.

---

## Status snapshot

| Item | State |
|---|---|
| Email 1a (Snyder's) | Drafted, not sent |
| Email 1b (social-proof farm) | Drafted, not sent — needs real TikTok number or send without one |
| Zeely 30-post calendar | Drafted (PR #2 open), not entered into Zeely |
| Zeely social account connection | Not done |
| BLG task | None queued |
| PR #1 (BLG pause / Claude Pro / community-queue security fix) | Open, unmerged — https://github.com/mugendiz/dayhop-v2/pull/1 |
| PR #2 (this content calendar) | Open, unmerged — https://github.com/mugendiz/dayhop-v2/pull/2 |
