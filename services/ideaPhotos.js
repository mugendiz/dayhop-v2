// services/ideaPhotos.js — DayHop V2
// Fills in real venue photos for result ideas that arrived without one
// (curated catalog, open-data events, ungrounded Grok picks) so cards show
// the actual place instead of the category stock image. One cached Places
// lookup per venue (services/googleMaps.findPhotoUrl), a handful at a time.
// Fails soft everywhere: no Maps key or a failed lookup just leaves
// image_url null and the frontend falls back to the stock photo.

const maps = require('./googleMaps');
const apiCache = require('./apiCache');

const CONCURRENCY = 5;
// Paid lookups per call. 16 → 6 (Sept 5 2026): each lookup is a $0.032 Pro
// text search, and 16 of them in one cold browse drained the whole $1 daily
// pot before a single $0.007 tile photo could resolve. 6 → 12 (Oct 24 2026):
// six left most of a feed on stock art. The raise is held by two guardrails
// instead of a small number:
//   - every idea first gets any photo someone already paid for (one batched
//     cache read, free), so paid lookups only go to places never looked up;
//   - paid lookups stop once today's metered Maps spend passes
//     PHOTO_LOOKUP_BUDGET_SHARE of MAPS_DAILY_BUDGET_USD (half by default),
//     so photos can never starve the candidate searches a feed needs.
// Worst case per call: 12 × $0.032 = $0.38. MAPS_DAILY_BUDGET_USD
// (services/apiCache.js) stays the hard ceiling on the day.
// PHOTO_LOOKUPS_PER_REQUEST overrides the count (0 turns paid lookups off).
const DEFAULT_LOOKUPS = 12;
const lookupsPerRequest = () => {
  const n = Number(process.env.PHOTO_LOOKUPS_PER_REQUEST);
  return Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : DEFAULT_LOOKUPS;
};
const PHOTO_LOOKUP_BUDGET_SHARE = 0.5;
function photoBudgetLeft() {
  const u = apiCache.usageStatus();
  return u.spent_usd < u.budget_usd * PHOTO_LOOKUP_BUDGET_SHARE;
}

function lookupQuery(idea, city) {
  const place = idea.venue || idea.title;
  const area = idea.location && idea.location !== place ? idea.location : city;
  return [place, area].filter(Boolean).join(', ');
}

async function enrichIdeaImages(ideas, { city, coords } = {}) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !Array.isArray(ideas)) return ideas;

  let missing = ideas.filter(i => i && !i.image_url && (i.venue || i.title));
  if (!missing.length) return inlinePaid(ideas);

  // Free pass: lookups already in the cache, for every idea, not just the
  // first few. A cached null is a known "no photo" and is not bought again.
  try {
    const keys = missing.map(i => maps.photoSearchKey(lookupQuery(i, city)));
    const known = await apiCache.peekMany(keys);
    missing = missing.filter((idea, n) => {
      if (!known.has(keys[n])) return true;
      if (known.get(keys[n])) idea.image_url = known.get(keys[n]);
      return false;
    });
  } catch (err) { /* the paid pass below still runs */ }

  missing = missing.slice(0, lookupsPerRequest());
  let next = 0;
  let warned = false;
  const workers = Array.from({ length: Math.min(CONCURRENCY, missing.length) }, async () => {
    while (next < missing.length) {
      if (!photoBudgetLeft()) return;
      const idea = missing[next++];
      try {
        idea.image_url = await maps.findPhotoUrl({
          query: lookupQuery(idea, city),
          lat: coords && coords.lat,
          lng: coords && coords.lng
        });
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn('[ideaPhotos] photo lookup failed (cards fall back to stock):', err.message);
        }
      }
    }
  });
  await Promise.all(workers);
  return inlinePaid(ideas);
}

// Last step on every path: cards whose photo someone already resolved get
// the image URI written in directly (one batched cache read, no Google
// call), so they skip /api/photo and can never hit the daily photo cap.
async function inlinePaid(ideas) {
  try { await maps.inlineCachedPhotos(ideas); }
  catch (err) { console.warn('[ideaPhotos] inline of cached photos failed:', err.message); }
  return ideas;
}

module.exports = { enrichIdeaImages, inlinePaid, lookupsPerRequest, PHOTO_LOOKUP_BUDGET_SHARE };
