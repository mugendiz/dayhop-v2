// services/ideaPhotos.js — DayHop V2
// Fills in real venue photos for result ideas that arrived without one
// (curated catalog, open-data events, ungrounded Grok picks) so cards show
// the actual place instead of the category stock image. One cached Places
// lookup per venue (services/googleMaps.findPhotoUrl), a handful at a time.
// Fails soft everywhere: no Maps key or a failed lookup just leaves
// image_url null and the frontend falls back to the stock photo.

const maps = require('./googleMaps');

const CONCURRENCY = 5;
// Bound worst-case latency/spend per request. 16 → 6 (Sept 5 2026): each
// lookup is a $0.032 Pro text search, and 16 of them in one cold browse
// drained the whole $1 daily pot before a single $0.007 tile photo could
// resolve. Above-the-fold is six tiles on a phone; the tail stays stock.
const MAX_LOOKUPS = 6;

async function enrichIdeaImages(ideas, { city, coords } = {}) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !Array.isArray(ideas)) return ideas;

  const missing = ideas
    .filter(i => i && !i.image_url && (i.venue || i.title))
    .slice(0, MAX_LOOKUPS);
  if (!missing.length) return inlinePaid(ideas);

  let next = 0;
  let warned = false;
  const workers = Array.from({ length: Math.min(CONCURRENCY, missing.length) }, async () => {
    while (next < missing.length) {
      const idea = missing[next++];
      const place = idea.venue || idea.title;
      const area = idea.location && idea.location !== place ? idea.location : city;
      const query = [place, area].filter(Boolean).join(', ');
      try {
        idea.image_url = await maps.findPhotoUrl({
          query,
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

module.exports = { enrichIdeaImages, inlinePaid };
