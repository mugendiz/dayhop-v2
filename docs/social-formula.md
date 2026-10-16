# DayHop monthly social formula

The posting plan in one place. The calendar is generated from
`data/socialFormula.js`, so changing a day or a time there changes every
month after it. Written 2026-10-15, when Zeely's scheduler access was about
to end (around Oct 30) and the stack had no scheduler left.

## The month at a glance

| Day | Time (Toronto) | Format | Pillar | What it is |
|---|---|---|---|---|
| First Monday | 19:30 | Video | App moment | Screen recording of the planner answering one real parent request. The only slot where DayHop leads. |
| Tuesday | 19:30 | Video | Hidden in plain sight | One surprising fact about one outdoor catalog place. Never a list. |
| Wednesday | 12:00 | Photo | Postcard | One owned photo, one line, the photo credit. |
| Thursday | 19:30 | Video | This weekend | One dated outdoor thing on this weekend, from Talk of the town or the curated events. |
| Saturday | 08:30 | Video | Worth the drive | One day trip, posted the morning families decide. |
| Sunday | 10:00 | Photo | Postcard | Same as Wednesday. |

A holiday swaps the Thursday before its weekend for a **Long weekend**
post (Thanksgiving, Christmas, New Year's Day, Family Day and the rest of
`ontarioHolidays()`).

A typical month is about 22 posts: 13 short videos and 9 photo posts.

Every video ends, in its last 1.5 seconds, on: **DayHop. A Nature App. Get
out there.**

## Why this mix

From the account's own numbers (recorded in `services/socialBatch.js`):
single surprising local facts with a face or motion in frame one reach 700
to 900 views, and lists, roundups and text over photo sit at 86 to 245 with
no shares. Instagram has close to no followers, so only Reels reach new
people there. So the growth work is three short videos a week, each built on
one fact.

Photo posts stay because they cost nothing. The 36 spot photos in
`assets/photos` are Wikimedia Commons images under CC BY, CC BY-SA, CC0 or
public domain, so they can be posted as long as the credit line goes with
them. The plan writes that line into every caption: keep it.

The times are starting defaults, not research. Tune them from the 24 hour
log, then edit `data/socialFormula.js`.

## What runs by itself

- **On the 24th at 10:00**, the server emails next month's plan to the
  operator inbox: a CSV with one row per post, the month's photos attached,
  and captions drafted by Grok and checked against the house copy rule.
  `SOCIAL_MONTH=off` turns it off.
- **Every Tuesday at 09:00**, the social batch drafts scripts for exactly
  the formula's video slots in the coming week (Thursday, Saturday, the next
  Tuesday, and the app moment when a first Monday falls in range). Drafts are
  grounded in catalog places, day trips and dated events, and each one is
  checked before it reaches you.
- **Any time**, the owner can preview a month at
  `/api/admin/social/month?month=2026-11` (add `&format=csv` or
  `&format=text`; `&captions=1` drafts captions with Grok), or send it now
  with `POST /api/admin/social/month/send`.

## What you still do

Nothing posts on its own. There is no TikTok or Instagram publishing
integration, and the videos have to be filmed.

1. **Once a month, after the 24th email:** schedule every Postcard row in
   Instagram's own scheduler or Meta Business Suite, at its date and time.
   Fix any FIX CAPTION row first.
2. **Once a week, after the Tuesday email:** film the three videos in one
   session (10 to 20 seconds each, phone, no AI footage). Schedule each in
   TikTok Studio on desktop and as an Instagram Reel.
3. **24 hours after each post:** log views, 2 second hold and shares.

## Scheduler limits (check before relying on them)

These come from third party guides, not from Meta's or TikTok's own help
pages, so treat them as likely, not confirmed:

- Instagram's native scheduler is reported to reach about 75 days ahead, and
  Meta Business Suite has no CSV import for Instagram, so the month's photos
  are scheduled one by one in a single sitting.
  ([Metricool](https://metricool.com/how-to-schedule-content-on-instagram/),
  [SocialBu](https://socialbu.com/blog/schedule-instagram-reels-and-posts))
- TikTok Studio on desktop is reported to schedule from 15 minutes to 10
  days ahead, for Creator or Business accounts only, and not from the phone
  app. That is why videos are scheduled weekly.
  ([Hopper HQ](https://www.hopperhq.com/blog/how-to-schedule-tiktok-posts-desktop-mobile/),
  [SocialBu](https://socialbu.com/blog/schedule-tiktok-posts))
- Third party schedulers (Metricool, PostEverywhere and others) take CSV
  uploads across platforms, and the CSV from the 24th would load into one.
  Not set up here: this plan is built to need no new tool and no new spend.
