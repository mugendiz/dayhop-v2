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

router.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2 || q.length > 120) return res.json({ suggestions: [] });

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
    res.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    console.warn('[geo] autocomplete failed:', err.message);
    // The combobox always has its typed-text fallback row — an empty list
    // degrades gracefully, an error banner would not.
    res.json({ suggestions: [] });
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
