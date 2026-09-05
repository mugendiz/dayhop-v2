// routes/weather.js — DayHop V2 (mobile Favs grid, Sept 2026)
// GET /api/weather?lat=&lng= → today's conditions for one place, for the
// tile mini-modal's weather chip. Thin wrapper over services/weather
// (OpenWeather, cached 10 min on an ~11 km grid), so a grid of tiles in one
// city costs one upstream call. 503 when OPENWEATHER_API_KEY is unset.
const express = require('express');
const router = express.Router();

let weather = require('../services/weather');
// Tests swap the provider; production never calls this.
router._setProvider = (p) => { weather = p; };

function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

router.get('/', async (req, res) => {
  const lat = num(req.query.lat, -90, 90);
  const lng = num(req.query.lng, -180, 180);
  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'lat and lng are required.' });
  }
  try {
    const c = await weather.getConditions({ lat, lng });
    res.set('Cache-Control', 'public, max-age=600');
    res.json({
      temp_c: c.temp_c,
      feels_like_c: c.feels_like_c,
      condition: c.condition,
      description: c.description,
      is_rainy: Boolean(c.is_rainy),
      wind_kph: c.wind_kph
    });
  } catch (err) {
    if (err.code === 'WEATHER_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'WEATHER_UNAVAILABLE', message: 'Weather is not configured.' });
    }
    res.status(502).json({ error: 'WEATHER_FAILED', message: 'Could not fetch weather right now.' });
  }
});

module.exports = router;
