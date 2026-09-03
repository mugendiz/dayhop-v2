// routes/geo.js — DayHop V2
// GET /api/geo/reverse?lat=..&lng=.. → { city, label }
// Turns shared browser coordinates into a friendly locality label so the
// UI can show "📍 Near you · Richmond Hill · L4C". Coordinates are used
// per-request only and never stored.
//
// GET /api/geo/autocomplete?q=..&lat=..&lng=..&near=.. → { suggestions }
// Live location predictions for the combobox. Bias resolution order:
// explicit lat/lng (user shared location) → `near` city text (geocoded
// through the 24h cache, so it's effectively free) → unbiased.

const express = require('express');
const router = express.Router();
const maps = require('../services/googleMaps');
const { ONTARIO_PLACES } = require('../data/ontarioPlaces');

// Keyless first pass: Ontario places matched by prefix (then substring).
// Google Places Autocomplete is only consulted when the local list has
// fewer than LOCAL_ENOUGH matches AND the input is long enough to mean
// somewhere specific — so "niag", "rich", "mark" never leave the server.
const LOCAL_ENOUGH = 3;
const REMOTE_MIN_CHARS = 4;
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function localSuggest(q) {
  const n = fold(q);
  const starts = [], contains = [];
  for (const p of ONTARIO_PLACES) {
    const t = fold(p.name);
    if (t.startsWith(n)) starts.push(p);
    else if (n.length >= 3 && t.includes(n)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, 6).map(p => ({
    place_id: null,
    text: `${p.name}, ON, Canada`,
    main: p.name,
    secondary: `${p.region}, Ontario`
  }));
}

router.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 120) return res.json({ suggestions: [] });

  const local = localSuggest(q);
  if (local.length >= LOCAL_ENOUGH || q.length < REMOTE_MIN_CHARS) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json({ suggestions: local });
  }

  let lat = Number(req.query.lat);
  let lng = Number(req.query.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  if (!hasCoords) {
    lat = lng = null;
    const near = String(req.query.near || '').trim().slice(0, 120);
    if (near) {
      try {
        const geo = await maps.geocode(near);
        lat = geo.lat;
        lng = geo.lng;
      } catch (e) { /* unbiased is fine */ }
    }
  }

  try {
    const suggestions = await maps.autocompletePlaces({ input: q, lat, lng });
    // Server-side the prefix is already cached ~5 min — tell the browser the
    // same, so retyping a prefix never re-crosses the network (and never
    // burns a slot in the geo rate limiter).
    res.set('Cache-Control', 'public, max-age=300');
    // Local matches lead; Google fills the rest (deduped by display text).
    const seen = new Set(local.map(s => fold(s.main)));
    const remote = suggestions.filter(s => !seen.has(fold(s.main)));
    res.json({ suggestions: [...local, ...remote].slice(0, 6) });
  } catch (err) {
    console.warn('[geo] autocomplete failed:', err.message);
    // The combobox always has its typed-text fallback row — the local
    // matches (if any) still serve; an error banner would not.
    res.json({ suggestions: local });
  }
});

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'BAD_COORDS', message: 'Invalid coordinates.' });
  }

  try {
    const { city, label } = await maps.reverseGeocode({ lat, lng });
    res.json({ city, label });
  } catch (err) {
    if (err.code === 'REVERSE_NOT_FOUND') {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Could not name that location.' });
    }
    console.warn('[geo] reverse geocode failed:', err.message);
    res.status(502).json({ error: 'GEO_UNAVAILABLE', message: 'Location lookup unavailable right now.' });
  }
});

module.exports = router;
