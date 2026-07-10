// routes/admin.js — DayHop V2 (Phase 4)
// GET /api/admin/metrics — internal analytics, protected by ADMIN_KEY.
// Constant-time key comparison; 503 (not 401) when no key is configured so
// a missing env var can never silently open the endpoint.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const analytics = require('../services/analytics');
const billing = require('../services/billing');

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/metrics', async (req, res) => {
  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({
      error: 'ADMIN_NOT_CONFIGURED',
      message: 'Set ADMIN_KEY in .env to enable the metrics endpoint.'
    });
  }
  if (!keyMatches(req.headers['x-admin-key'] || req.query.key)) {
    return res.status(401).json({ error: 'FORBIDDEN', message: 'Bad admin key.' });
  }

  try {
    const data = await analytics.metrics();
    res.json(Object.assign({ billing: billing.status(), generated_at: new Date().toISOString() }, data));
  } catch (err) {
    console.error('[admin] metrics failed:', err.message);
    res.status(500).json({ error: 'METRICS_FAILED', message: 'Could not compute metrics.' });
  }
});

module.exports = router;
