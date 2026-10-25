// routes/dreamHomes.js — DayHop V2
// GET /api/dream-homes → the live open houses for the homepage rail
// (services/dreamHomes.js): published homes with a window open now or still
// ahead, open now first. Expired and draft homes never leave the server.
// Admin writes live in routes/admin.js under /api/admin/dream-homes.

const express = require('express');
const router = express.Router();
const dreamHomes = require('../services/dreamHomes');

router.get('/', async (req, res) => {
  try {
    const homes = await dreamHomes.listPublic();
    // Short and private: a home an admin just published (or a window that
    // just closed) shows on the next page load, not a minute later, and no
    // shared cache holds it.
    res.set('Cache-Control', 'private, max-age=15');
    res.json({ homes, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[dream-homes] list failed:', err.message);
    res.status(502).json({ error: 'DREAM_HOMES_UNAVAILABLE', homes: [] });
  }
});

module.exports = router;
