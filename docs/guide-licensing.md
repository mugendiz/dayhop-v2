# DayHop City Guides — Guest Licensing (B2B one-pager)

*Internal ops draft, 2026-08-24. The pitch below is ready to paste into
outreach email; pricing is a starting position, negotiable per venue.*

## The product

Field-checked PDF nature guides for Markham, Richmond Hill, Newmarket,
Toronto, Hamilton, and Lake Simcoe — 31–37 places per guide with trails,
lookouts, waterways, legal fishing spots, parking/washroom notes on every
entry, ready-made day plans, and a season calendar. Updated editions ship
free to every reader. Retail: $20/guide, $59 the collection.

## The offer: guest licenses

Your guests get the guides free; you buy one license per property.

| Tier | Who it fits | What's included | Price (annual) |
|---|---|---|---|
| **Guest License** | BnBs, cottages, boutique inns | Unlimited guest downloads of ONE regional guide via your private link/QR | $149/yr |
| **Concierge** | Hotels, campgrounds, marinas | The full six-guide collection for guests + a co-branded cover page ("Presented by …") | $349/yr |
| **Destination** | BIAs, tourism boards, libraries | Collection license for members/patrons + your logo on the frontispiece + quarterly usage report | $749/yr |

Why they buy: a $149 license replaces the dead rack of pamphlets with a
branded amenity guests actually keep, and it costs less than one night's
ADR. The correction promise (readers get fixed editions free) means the
concierge never hands out stale information again.

## Mechanics (when first license sells)

- Delivery: a per-partner signed link (same HMAC scheme as buyer tokens,
  longer expiry) or a monthly-rotated QR poster we send as a print-ready
  PDF. No new infrastructure needed on day one.
- Co-branding: one extra cover line in the renderer keyed off the partner
  link — small build, do it on first Concierge sale, not before.
- Invoice via Stripe payment link; books to `sponsorship` in the ledger.

## First 10 targets

The 25-venue CRM list already contains the right people (Chudleigh's,
Downey's, the fair boards). Add: Jackson's Point / Sibbald-area cottage
rentals, Barrie waterfront hotels, Dundas BnBs, Hamilton's escarpment-area
inns, GO-corridor boutique hotels marketing "car-free day trips."

## Outreach paragraph (paste-ready)

> We make the field-checked nature guides for [region] — trails, lookouts,
> waterways, and the parking-and-washroom details guests actually ask the
> front desk about. Instead of selling them to your guests at $20, we
> license them to properties: your guests download free through your link,
> you look like the host who knows everything, and updated editions flow
> automatically. A single license costs less than one night's room rate.
> Want the Hamilton guide to review? Reply and it's yours.
