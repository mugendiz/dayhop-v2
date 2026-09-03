// routes/photo.js — DayHop V2
// Proxies Google Places photos so idea cards can show real venue imagery
// without ever exposing the server-side Maps API key to the browser.
// GET /api/photo?name=places/<id>/photos/<ref> → 302 to the image URI.

const express = require('express');
const router = express.Router();
const maps = require('../services/googleMaps');

const PHOTO_NAME_RE = /^places\/[^/]+\/photos\/[^/]+$/;

router.get('/', async (req, res) => {
  const name = String(req.query.name || '');
  if (!PHOTO_NAME_RE.test(name)) {
    return res.status(400).json({ error: 'BAD_PHOTO_NAME', message: 'Invalid photo reference.' });
  }

  try {
    const uri = await maps.getPhotoUri(name);
    // 7 days, matching the server-side photo-URI cache: a returning
    // browser never re-asks for a card image it already resolved.
    res.set('Cache-Control', 'public, max-age=604800');
    res.redirect(uri);
  } catch (err) {
    // Frontend <img onerror> falls back to the category stock photo.
    console.warn('[photo] lookup failed:', err.message);
    res.status(404).json({ error: 'PHOTO_UNAVAILABLE', message: 'Photo unavailable.' });
  }
});

module.exports = router;
