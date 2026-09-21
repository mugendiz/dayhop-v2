# DayHop house copy style

Standing directive, set 2026-09-21. Permanent until the founder changes it.
Applies to everything a customer, subscriber, prospect, or venue partner
reads: website copy, ad creatives, and email. It does not apply to code
comments, log lines, commit messages, or admin-only internal text. This is
about what DayHop says to the outside world, not how the codebase talks to
itself.

## The one hard rule, checked automatically

No em dash, no en dash, and no double-hyphen standing in for one, anywhere
in customer-facing copy. Use a period. Use a comma. Rewrite the sentence.
A hyphen inside a real compound word or a range is fine and untouched:
"7-day trial," "GTA-wide," "3-8 years." What is banned is the habit of
stitching two clauses together with a dash instead of deciding how they
actually relate.

Wrong: "Your day, sorted — five picks, one tap, no scrolling."
Right: "Your day, sorted. Five picks, one tap, no scrolling."

`services/copyStyle.js` checks this mechanically, and `test/copyStyle.test.js`
runs it against the actual rendered output of every customer-facing template
in the codebase. That test is part of `node --test`, which every PR must
pass before it merges. A dash in customer-facing copy fails the build. That
is what "nothing is published without matching the standard" means in a
codebase: the gate is the test suite, not a promise to remember.

Anyone adding a new customer-facing template must add it to
`test/copyStyle.test.js`'s coverage list, or the new copy ships unchecked.

## The voice: Claude Hopkins and David Ogilvy, not generic AI copy

Both men sold hard and told the truth. Neither ever wrote a sentence whose
only job was to sound impressive.

**Specifics beat superlatives.** "70+ outings, organized by age, budget, and
rain-proofness" beats "an amazing collection of activities." A number, a
name, a place, a price: always the specific fact over the vague claim. If a
claim cannot be made specific, cut it.

**Every piece of copy has one reason why.** Hopkins: give the reader a
reason to act now, stated plainly. Not "check it out," but "your first
three months are half price, and the code expires Friday." State the offer,
the benefit, and the deadline. Let the reader do the arithmetic on why that
matters, or do it for them in one clause.

**Write for one reader, not a crowd.** "You," not "families." "Your
Saturday," not "everyone's weekend." Ogilvy's rule: the reader is intelligent
and busy, never a fool and never an audience of thousands. Second person,
always.

**Short sentences. Plain words.** No word a twelve-year-old would need a
dictionary for. No jargon a founder finds natural but a parent never says
out loud ("actionable," "seamless," "curated experience"). Cut every
adjective that is not doing real work.

**The headline or subject line is the whole sale, in miniature.** Ogilvy
spent more time on headlines than on anything else in an ad, because most
people read no further. A subject line must promise a specific, believable
benefit. "This weekend: Riverdale Farm + 4 more GTA picks" beats "Your
weekly DayHop newsletter."

**Never claim what cannot be proven.** No "best," "amazing," or
"revolutionary" without a fact standing next to it that makes the claim
true. A rating, a count, a price, a date: cite it. If there is no fact to
cite, the claim does not belong in the copy.

**One call to action.** Every email, every page, every ad ends with exactly
one thing the reader should do next, stated as a plain instruction: "Sign up
here," not "Learn more about our offerings."

## What this is not

This is not a ban on personality, warmth, or a sense of humor. Hopkins and
Ogilvy both wrote copy with real character. It is a ban on padding,
throat-clearing, and the specific tic of using a dash to avoid deciding how
two ideas relate to each other.
