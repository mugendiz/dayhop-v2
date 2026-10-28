# Working agreements for agents in this repository

Standing rules, set 2026-10-28. These apply to Claude and any other agent
working here, in every session, without being re-asked.

## 1. GOALS.md is read-only

`GOALS.md` holds the founder's goals. Read it at the start of any piece of
work large enough to have a direction. Measure what you are about to do
against it, and say plainly when something is off track.

Never edit `GOALS.md`. Not to add a goal, not to soften one, not to update a
number, not to tidy the wording. If a goal is stale or conflicts with the
work in hand, say so and stop. The founder resolves it.

This is the whole point of the file: a goal the agent cannot rewrite is a
fixed point that makes drift visible. An agent that edits the goal to match
what got built has destroyed the only instrument that would have caught the
drift.

## 2. Every number carries its source

Never state a number without saying where it came from and what window it
covers. This applies to anything quantitative said to the founder, in chat
or in a file: metrics, costs, counts, test results, performance claims.

Not this:

> Signups are down 12%.

This:

> Signups down 12%, from the `analytics` events table, last 30d against
> the prior 30d, queried 2026-10-28.

A number without provenance cannot be checked, and an unchecked number from
a model is a guess wearing a suit. If you cannot source it, say you are
estimating, and say from what. If the source is a file, cite `path:line`.

This rule binds the agent, and the founder is entitled to demand it on any
number at any time.

## 3. Log findings with a date

When a session turns up something worth acting on later, append it to
`docs/findings-log.md` with the date, the number, the source, and what you
think it costs. Follow the format already in that file.

The log is not for the agent's benefit. It is so that in six weeks the
founder can look back and see whether the flagged things actually mattered.
That is the only way to find out whether this habit earns its keep, and it
is the step everyone skips. Entries therefore get reviewed, not just
written: the Reviewed column is filled in later, honestly, including when
the finding turned out to be noise.

Do not log routine work. A finding is something that was not being looked
for and that changes a decision.

## 4. House copy style

Anything a customer, subscriber, prospect, or venue partner reads follows
`docs/copy-style-guide.md`. The dash rule is checked mechanically by
`services/copyStyle.js` and `test/copyStyle.test.js`, and a violation fails
the build. New customer-facing templates must be added to that test's
coverage list.

## 5. Before pushing

Run `node --test`. The suite is the gate that enforces the standards above,
so a push that has not run it is a push that has not been checked.
