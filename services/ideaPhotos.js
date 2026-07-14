// services/ideaPhotos.js — DayHop V2
// Fills in real venue photos for result ideas that arrived without one
// (curated catalog, open-data events, ungrounded Grok picks) so cards show
// the actual place instead of the category stock image. One cached Places
// lookup per venue (services/googleMaps.findPhotoUrl), a handful at a time.
// Fails soft everywhere: no Maps key or a failed lookup just leaves
// image_url null and the frontend falls back to the stock photo.

const maps = require('./googleMaps');

const CONCURRENCY = 5;
const MAX_LOOKUPS = 16; // bound worst-case latency/spend per request

async function enrichIdeaImages(ideas, { city, coords } = {}) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !Array.isArray(ideas)) return ideas;

  const missing = ideas
    .filter(i => i && !i.image_url && (i.venue || i.title))
    .slice(0, MAX_LOOKUPS);
  if (!missing.length) return ideas;

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
  return ideas;
}

module.exports = { enrichIdeaImages };
