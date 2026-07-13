// routes/details.js — DayHop V2
// POST /api/details — enrich one idea for the detail panel.
// Two independent, fail-soft lookups run in parallel:
//   place: Google Place Details (extra photos, editorial summary, live
//          open-now, hours, rating depth). google_places ideas carry their
//          place_id as their idea id; everything else is resolved with one
//          text search first.
//   facts: Grok local color (interesting facts, history, typical busy
//          times, an insider tip) under the same no-fabrication contract
//          as idea generation.
// Either half may be null in the response. Results are cached for 24h —
// a place's history doesn't change between viewers.

const express = require('express');
const router = express.Router();

const maps = require('../services/googleMaps');
const grok = require('../services/grok');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map();

router.post('/', async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) {
    return res.status(400).json({ error: 'MISSING_TITLE', message: 'A place title is required.' });
  }
  const venue = String(b.venue || '').trim().slice(0, 200) || null;
  const location = String(b.location || '').trim().slice(0, 200) || null;
  const city = String(b.city || '').trim().slice(0, 120) || null;
  const category = String(b.category || '').trim().slice(0, 40) || null;
  const source = String(b.source || '').trim().slice(0, 40);
  const id = b.id != null ? String(b.id).slice(0, 200) : null;

  const key = (source === 'google_places' && id ? id : `${title}|${city || ''}`).toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.payload);

  const [place, facts] = await Promise.all([
    lookupPlace({ id, source, title, venue, location, city }).catch(err => {
      console.warn('[details] place lookup failed:', err.message);
      return null;
    }),
    grok.placeFacts({ title, venue, location, city, category }).catch(err => {
      console.warn('[details] facts generation failed:', err.message);
      return null;
    })
  ]);

  const payload = { place, facts };
  if (place || facts) {
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), payload });
  }
  res.json(payload);
});

async function lookupPlace({ id, source, title, venue, location, city }) {
  // Ideas grounded by Google Places carry the place_id as their idea id.
  if (source === 'google_places' && id) return maps.getPlaceDetails(id);

  // Everything else (curated, Viator, events…): one text search, then take
  // the top match — same normalized pipeline the grounding search uses.
  const query = [venue || title, location || city].filter(Boolean).join(', ');
  const results = await maps.searchPlaces({ query, maxResults: 1 });
  if (!results.length || !results[0].place_id) return null;
  return maps.getPlaceDetails(results[0].place_id);
}

module.exports = router;
