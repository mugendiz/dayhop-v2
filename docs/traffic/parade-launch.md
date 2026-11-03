# Santa parades launch kit (week of Nov 3, 2026)

Page: https://dayhop.quest/santa-parades

The claim, and the only claim: **every 2026 GTA Santa Claus parade, checked
against each town's own page, with times and a map.** On 2026-11-03 the
best-known GTA parade list still showed 2025 dates (research notes,
`research_notes/GTA family product gaps November/what_works.md`).

Success metric for this week, not page views: **newsletter confirmations with
consent source `parade_reminder`** and one post that spreads. Read them in the
Monday report (`scripts/weekly-report.js`) and with
`require('./services/paradeReminders').counts()`.

These are drafts. The founder posts them; the agent never posts on anyone's
behalf. Read each community's rules first: several ban self-promotion or
allow it only on set days. Where a group bans links, post the table as text
and offer the link in comments only if asked.

## Order and timing

| When | Where | Why then |
|---|---|---|
| Tue Nov 3 or Wed Nov 4 | r/oakville | Oakville is first (Sat Nov 14) |
| Wed Nov 4 to Fri Nov 6 | r/mississauga, r/Brampton, r/newmarket | Nov 21 parades |
| Mon Nov 9 to Wed Nov 11 | r/toronto (check self-promo rules), r/askTO only as an answer to a parade question | Toronto Nov 22 |
| Mon Nov 16 to Wed Nov 18 | r/Markham, r/pickering, r/ajax, r/vaughan | Nov 28 and 29 parades |
| Any day this week | 2 or 3 local parent Facebook groups the founder already belongs to | Highest-trust channel |
| Wed Nov 4 | blogTO and Daily Hive news tips (their own tip forms) | One story is what tipped every comparable local tool |

## Reddit post (one town at a time)

Title: **Mississauga Santa Claus Parade is Sat Nov 21 at 6 p.m. (plus every other GTA parade date for 2026)**

> Couldn't find a list that had this year's dates (the ones I found still
> showed 2025), so I checked each town's own page and put them in one table
> with a map.
>
> Mississauga: Sat Nov 21, 6 p.m., through Celebration Square. Free
> activities there from 4 p.m., including a DJ skate party, and Santa lights
> the tree as he passes.
>
> Also Nov 21: Brampton 5 p.m., Newmarket 11 a.m., Aurora 6 p.m. Toronto is
> Sun Nov 22 (route not posted yet).
>
> Full list with routes and the official link for each:
> https://dayhop.quest/santa-parades?utm_source=reddit&utm_medium=social&utm_campaign=parades
>
> If your town's isn't on it yet (Richmond Hill, Oshawa, Whitby, Milton
> hadn't posted 2026 dates as of Nov 3), drop it below and I'll add it.

Swap the lead paragraph per subreddit. The last line invites corrections,
which is both useful and the most natural reason to comment.

## Facebook parent group post

> GTA parade dates for 2026, all in one place 🎅
>
> I checked every town's own website (some of the lists online still show
> last year's dates). Oakville Nov 14, Brampton, Mississauga, Newmarket and
> Aurora Nov 21, Toronto Nov 22, Markham, Pickering and Ajax Nov 28, Vaughan
> Nov 29, Stouffville Dec 5, Burlington Dec 6.
>
> Times, routes and a map here, and you can get an email reminder the night
> before: https://dayhop.quest/santa-parades?utm_source=facebook&utm_medium=social&utm_campaign=parades

## Pitch to local media (tip forms)

Subject: **Every GTA Santa parade for 2026 on one map, checked against each town's site**

> Hi, a quick tip for your holiday coverage. The parade roundups still
> ranking for "Santa Claus parades GTA" show 2025 dates. We checked every
> GTA town's own page and published the 2026 dates, start times and routes
> on one free map: https://dayhop.quest/santa-parades
>
> 12 parades confirmed so far, from Oakville on Nov 14 to Burlington on
> Dec 6. Four towns (Richmond Hill, Oshawa, Whitby, Milton) had not posted
> 2026 dates as of Nov 3; we update as they do.
>
> DayHop is a small Toronto-built family day planner. Happy to answer
> anything. (Founder name, phone)

## Before each post

1. Re-check the parades in that post against their official pages, and
   update `verified_on` in `data/santaParades2026.js` (then deploy).
2. Check the four "not posted yet" towns and add any new dates.
3. Never round a time or guess a route: if the official page does not say
   it, the page says "Not posted yet".
