// routes/geo.js — DayHop V2
// GET /api/geo/reverse?lat=..&lng=.. → { city, label }
// Turns shared browser coordinates into a friendly locality label so the
// UI can show "📍 Near you · Richmond Hill · L4C". Coordinates are used
// per-request only and never stored.

const express = require('express');
const router = express.Router();
const maps = require('../services/googleMaps');

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
