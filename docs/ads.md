# DayHop Paid Acquisition — Infrastructure & Runbook

Built 2026-08-05. The measurement side of running ads is fully wired; it sits
inert until the Meta account exists. Nothing loads, sends, or tracks until the
env vars are set — and UTM attribution works TODAY with zero configuration.

## What exists (code)

| Piece | Where | What it does |
|---|---|---|
| Attribution capture | `public/pixel.js` | On every page: `utm_*` / `fbclid` / `gclid` from the landing URL → localStorage, first-touch, 90-day window. No keys needed. |
| Meta Pixel loader | `public/pixel.js` + `/api/config` | Injects Meta's `fbevents.js` + PageView **only** when `META_PIXEL_ID` is set server-side. Included on the app, blog, playbook, and shared-guide pages. |
| Conversions API | `services/metaPixel.js` | Server-side events (survive ad blockers): needs `META_PIXEL_ID` + `META_CAPI_TOKEN`. Emails are SHA-256-hashed before sending. Fail-soft like every integration. |
| Funnel events | routes/services | `Lead` (newsletter subscribe) → `NewsletterConfirmed` (double opt-in) → `CompleteRegistration` (account signup) → `InitiateCheckout` (checkout created) → `StartTrial` (Stripe webhook, carries $5 CAD value). Browser sends only PageView, so nothing double-counts. |
| Stripe attribution | `services/billing.js` | The visitor's campaign (`utm_source/campaign/…`) is stamped into Checkout **and** subscription metadata — every paying customer answers "which ad brought you here" in the Stripe dashboard, forever. |
| Admin rollup | admin dashboard → "Acquisition by campaign" | Subscribers / signups / checkouts per utm source+campaign, from the events table. |
| Health | `/health` (operator view) | `integrations.meta_ads: { configured, mode }` — `test` vs `live` vs `pixel-only`. |

## Using it before any ad account exists (now)

Tag every link you share manually:

```
https://dayhop-v2.onrender.com/?utm_source=reddit&utm_medium=organic&utm_campaign=askto-weekend-thread
https://dayhop-v2.onrender.com/playbook?utm_source=facebook&utm_medium=group&utm_campaign=gta-parents-group
```

Anyone arriving through a tagged link who later subscribes, signs up, or starts
checkout shows up in the admin Acquisition card (and in Stripe metadata if they
pay). This answers "which free channel converts" before spending a dollar.

## When the Meta account exists (your steps)

1. business.facebook.com → create Business portfolio → **Events Manager** →
   Connect data → Web → create the pixel/dataset.
2. Copy the numeric **dataset/pixel ID** → set `META_PIXEL_ID` in Render env
   (and local `.env`). Redeploy. PageView starts flowing from all pages.
3. Events Manager → Settings → **Conversions API** → Generate access token →
   set `META_CAPI_TOKEN`. Server conversions start flowing.
4. **Verify in test mode first**: Events Manager → Test events tab → copy the
   code → set `META_TEST_EVENT_CODE`, redeploy, subscribe with a test email,
   watch Lead appear in the tab. Then REMOVE the test code and redeploy.
5. Verify the domain (Business settings → Brand safety → Domains) — required
   for link ads.

No code changes needed at any step — it's all env vars.

## Event → campaign-objective map

| Meta event | Fires when | Optimize ads for it when |
|---|---|---|
| `Lead` | newsletter subscribe (server-side) | Growing the list (playbook lead-magnet ads) |
| `CompleteRegistration` | account created | Growing free users |
| `InitiateCheckout` | Stripe checkout opened | Warm-up signal, not an objective |
| `StartTrial` | Stripe webhook confirms checkout (value: $5 CAD) | The real objective once volume exists (needs ~50/week for Meta's learning phase — start with Lead until then) |
| `NewsletterConfirmed` | double opt-in completed (custom event) | Never — it's a list-quality diagnostic per campaign |

## The $10–20/day test plan (from the scale-to-$100/day discussion)

- **Audience**: GTA metro, parents, 25–45. One campaign, 2–3 creatives
  (Playbook cover photo beats stock; "what are we doing this weekend?" is the
  hook the research validated).
- **Objective ladder**: start optimizing for `Lead` (newsletter) — cheapest
  conversion, feeds the Thursday digest which does the long-term converting.
  Move to `StartTrial` only if volume supports it.
- **Kill/scale criteria** (check the admin Acquisition card + Ads Manager
  weekly): cost per Lead > $3 after ~$100 spent → new creative or audience.
  Cost per paying customer (StartTrial that survives the trial) > ~$15 →
  ads don't pencil at $5/mo; revisit pricing/annual plan before spending more.
- **Attribution check**: every ad's destination URL must carry
  `utm_source=facebook&utm_medium=cpc&utm_campaign=<name>` — Ads Manager has a
  URL-parameters field; Meta fills `{{campaign.name}}` dynamically if you use
  `utm_campaign={{campaign.name}}`.

## Privacy note

The pixel only loads once `META_PIXEL_ID` is set — at that point the privacy
policy should mention Meta advertising cookies. Emails sent to the Conversions
API are SHA-256 hashed client-of-Meta-side (in `services/metaPixel.js`);
raw addresses never leave the server unencrypted-for-Meta.

## Zeely launch brief (2026-08-15 — user chose Zeely over Meta Ads Manager)

Destination (keeps the whole UTM→Stripe attribution chain working):
`https://dayhop.quest/playbook?utm_source=zeely&utm_medium=cpc&utm_campaign=playbook-aug`

- **Offer in the ad**: the free GTA Family Weekend Playbook (lead magnet) —
  NOT the $5 subscription. Cold traffic converts on free value; the digest
  list is also the sponsorship inventory, so every subscriber has B2B value
  even before consumer revenue works.
- **Copy A (problem)**: "It's Thursday night and you still don't know what
  to do with the kids this weekend. This free GTA playbook fixes that —
  6 sections, age & budget filters, rain-proof backups."
- **Copy B (proof)**: "Real GTA spots, live weather, honest closure alerts.
  The weekend planner Toronto families actually use. Grab the free playbook."
- **Creative**: the storybook-flat illustration set (social/ palette:
  cream/coral/marigold/moss). The trail photo asset works for A.
- **Audience**: GTA parents 27–45, 40 km radius on Toronto, interests
  family/parenting/weekend activities. Start CAD $5–10/day.
- **Success math**: playbook page converts via double opt-in; a digest
  subscriber is the unit that makes Spotlight ($299/mo) sellable. Watch
  acquisition card (utm_source=zeely rows) + newsletter funnel on the admin
  dashboard; kill or iterate weekly, one variable at a time.
