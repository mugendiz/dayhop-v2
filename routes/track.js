// routes/track.js — DayHop V2 (Phase 4)
// POST /api/track { type, idea_id?, source?, owner_id? } → 204
// Lightweight client-event sink (booking clicks are the affiliate-revenue
// metric that must never be lost). Anonymous allowed: owner precedence is
// authenticated user > guest id from localStorage > 'anon'.

const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');
const metaPixel = require('../services/metaPixel');

// Only client-originated event types are accepted here; server-truth events
// (prompt_generated, plan_built) are recorded by their own routes. The set
// itself lives in analytics.js next to the server list, so the accept-list
// and the record-list can never drift apart.
const CLIENT_TYPES = analytics.CLIENT_EVENT_TYPES;

router.post('/', (req, res) => {
  const { type, idea_id, source, owner_id, price, currency, attrib } = req.body || {};
  if (!CLIENT_TYPES.has(type)) {
    return res.status(400).json({ error: 'BAD_EVENT', message: 'Unknown event type.' });
  }
  // Booking clicks may carry the product price (affiliate commission math
  // on the admin dashboard). Sanitized hard: number, sane range, 3-letter
  // currency — everything else is dropped, never rejected.
  let meta;
  const p = Number(price);
  if (type === 'booking_click' && Number.isFinite(p) && p > 0 && p < 100000) {
    meta = { price: Math.round(p * 100) / 100 };
    if (typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())) {
      meta.currency = currency.trim().toUpperCase();
    }
  }
  // Ad attribution rides on the funnel events only — sanitized to known
  // utm_*/fbclid keys, so meta can't become a free-form dumping ground.
  if (type === 'signup' || type === 'upgrade_viewed') {
    const utm = analytics.sanitizeAttrib(attrib);
    if (utm) meta = Object.assign(meta || {}, { utm });
  }
  analytics.recordEvent({
    type,
    ownerKey: (req.user && req.user.id) || owner_id || 'anon',
    ideaId: idea_id,
    source,
    meta
  });
  // Account creation is a Meta-optimizable conversion; sent server-side so
  // ad blockers can't eat it. No-op until META_* env vars exist.
  if (type === 'signup') {
    metaPixel.sendEvent('CompleteRegistration', {
      email: req.user && req.user.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      sourceUrl: req.headers.referer
    });
  }
  res.status(204).end();
});

module.exports = router;
