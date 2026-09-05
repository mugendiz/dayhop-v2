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
  const { type, idea_id, source, owner_id, price, currency, attrib, section } = req.body || {};
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
  // Shelf attribution for CTR: which feed section the engaged card sat in.
  // Deliberately NOT the `source` field — that means partner/provider and
  // feeds the affiliate rollup. Length-capped string, engagement types only.
  if ((type === 'booking_click' || type === 'maps_click' ||
       type === 'shortlist_add' || type === 'card_open') &&
      typeof section === 'string' && section.trim()) {
    meta = Object.assign(meta || {}, { section: section.trim().slice(0, 60) });
  }
  // Favs-grid events (Sept 2026): tile_open carries the surface it was
  // opened from, tile_swipe_plan how the plan add happened, and
  // feed_swipe_shortlist the destination list. Enumerated / length-capped.
  if (type === 'tile_open' || type === 'tile_swipe_plan' || type === 'feed_swipe_shortlist') {
    const b = req.body || {};
    const extra = {};
    if (b.surface === 'favs' || b.surface === 'feed') extra.surface = b.surface;
    if (b.via === 'swipe' || b.via === 'button') extra.via = b.via;
    if (typeof b.list_id === 'string' && b.list_id.trim()) extra.list_id = b.list_id.trim().slice(0, 40);
    if (Object.keys(extra).length) meta = Object.assign(meta || {}, extra);
  }
  // Viewport-truth shelf impressions: the client batches "cards actually
  // seen" per shelf into one event. Sanitized hard — bounded shelf count,
  // capped label length and per-shelf count — so meta can't balloon.
  if (type === 'shelf_seen') {
    const raw = (req.body && req.body.shelves) || null;
    const shelves = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [label, n] of Object.entries(raw).slice(0, 30)) {
        const count = Math.floor(Number(n));
        if (label.trim() && Number.isFinite(count) && count > 0) {
          shelves[label.trim().slice(0, 60)] = Math.min(count, 500);
        }
      }
    }
    // Nothing usable survived sanitizing — don't record an empty event.
    if (!Object.keys(shelves).length) return res.status(204).end();
    meta = Object.assign(meta || {}, { shelves });
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
