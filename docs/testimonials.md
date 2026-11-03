# Reader testimonials: from reply to quote

The quotes beside the buy buttons on /guides and the Richmond Hill sales
letter come from `data/testimonials.js`. Every entry must be a real buyer's
own words that they agreed, in writing, to have published. This is how a
reply becomes an entry.

## Where replies come from

`services/testimonialAsk.js` sends one email about 7 days after a paid guide
or bundle purchase, once per buyer email. It asks how the guide worked out
and whether we may quote the reply credited with first name, last initial
and city. Replies land at admin@dayhop.quest.

It is off by default. To turn it on (after approving the DRAFT copy in
`askEmail`):

1. Run `db/migrations/2026-10-20-testimonial-requests.sql` in Supabase.
2. Set `TESTIMONIAL_EMAILS=on` on Render. `RESEND_API_KEY` must be set and
   `RECOVERY_SWEEP` must not be `off` (the ask rides the same 15 minute sweep).

Purchases are recorded whether or not the flag is on, so buyers from the last
30 days still get asked when it flips. Free purchases (100% coupons, founder
tests) are never asked.

## Turning a reply into an entry

Only if the reply clearly says yes to being quoted (a "yes", "sure, go
ahead", or similar in their own email). No answer means no. A happy reply
without a yes is not consent: either leave it, or reply once asking, and use
it only if they then say yes.

1. Copy their words exactly. You may trim for length (cut whole sentences or
   use "..."), but never reword, merge two replies, or add anything they did
   not write. If the quote has a dash, swap it for a comma or period; that is
   the only edit allowed (house copy style, `services/copyStyle.js`).
2. Credit them as they agreed: first name and last initial. Use the city they
   gave; if they gave none, ask, or leave `city` out. Never guess it.
3. Add an entry to `data/testimonials.js`:

   ```js
   {
     quote: 'We did the Lake Wilcox loop on Saturday and the kids asked to go back.',
     name: 'Sam T.',
     city: 'Markham',
     guide: 'richmond-hill',   // slug they bought ('ontario-collection' for the bundle)
     date: '2026-11-02',       // the day they sent the reply
     source: 'email',
     consent: true,
     consent_note: 'Replied yes to the testimonial ask, email of 2026-11-02 to admin@dayhop.quest'
   }
   ```

   (The example above is illustrative only. Never commit it.)

   `consent_note` must say where and when they said yes, so anyone can find
   the email later. Keep that email; do not delete the thread.
4. Run `node --test`. `test/guideContents.test.js` fails any entry without
   `consent: true` and a `consent_note`, and the copy style test checks the
   quote for dash punctuation.
5. Commit and deploy as usual.

## If someone changes their mind

Remove their entry the same day and deploy. Reply to confirm it is gone.
