# Chrome execution handoff — 2026-09-19

One-shot list of everything ready to execute via Resend, Zeely, and BLG
(all three logged in via Claude-in-Chrome as of today). Nothing below has
been sent, scheduled, or posted yet — this session (Claude Code) has no
browser/API access to any of the three, so all of it is drafted content
waiting on hand-execution.

---

## 1. Resend — two emails to send

### 1a. Reply to Team Snyder (Snyder's Family Farm giveaway)

**To:** GuestServices@snydersfarm.com
**From:** admin@dayhop.quest
**Re:** A family-pass giveaway for Snyder's, run by us

> Hi Team Snyder,
>
> Our Instagram is **@dayhopofficial**.
>
> To keep things moving on our end: what family-pass would you like to offer, and what dates is it valid through? Once we have that, we'll draft the contest rules and skill-testing question, get you a collab-post invite so it shows on your profile too, and open entries the week of Sep 28 with the winner drawn Saturday Oct 3.
>
> Thanks again — looking forward to sending some fall traffic your way.
>
> Andrew
> DayHop · dayhop.quest

*Blocks the giveaway posts below (rows 13/16/19) until Snyder's replies with pass + dates.*

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
| 13 | Sep 27 | **Giveaway announced** *(Zeely-generate: prize graphic)* | — | "GIVEAWAY: one family pass to Snyder's Family Farm — corn maze, pumpkin patch, hayride. Follow @dayhopofficial + tag 2 friends to enter. Winner drawn Sat Oct 3." | — | IG, TT |
| 14 | Sep 28 | Rouge Carolinian forest (trillium fact) | markham-spot-trillium.jpg | "Less than 1% of Canada is this forest type. It's in Markham, and a trillium there takes 7 years just to bloom." | — | IG |
| 15 | Sep 29 | Main Street Unionville | markham-spot-unionville.jpg | "A main street that looks like a movie set, and it's a GO Train away from downtown." | /blog/toronto-farmers-markets-guide | IG |
| 16 | Sep 30 | **Giveaway reminder** *(Zeely-generate: countdown graphic)* | — | "3 days left to win a family pass to Snyder's Family Farm. Follow + tag 2 friends. Rules in bio." | — | IG, TT |
| 17 | Oct 1 | Dundurn Castle | hamilton-spot-dundurn.jpg | "A real 19th-century castle you can tour, and it's inside Hamilton city limits." | — | IG |
| 18 | Oct 2 | Princess Point, Cootes Paradise | hamilton-spot-cootes.jpg | "Paddle a marsh inside a city — Cootes Paradise doesn't get enough credit." | — | IG |
| 19 | Oct 3 | **Giveaway winner announced** *(Zeely-generate: winner graphic)* | — | "Congrats to our Snyder's Family Farm pass winner! More local giveaways coming — follow @dayhopofficial so you don't miss the next one." | — | IG, TT |
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

**Sequencing note:** rows 13/16/19 (the giveaway) depend on email 1a above landing a reply from Snyder's with pass + dates first.

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
