// routes/track.js — DayHop V2 (Phase 4)
// POST /api/track { type, idea_id?, source?, owner_id? } → 204
// Lightweight client-event sink (booking clicks are the affiliate-revenue
// metric that must never be lost). Anonymous allowed: owner precedence is
// authenticated user > guest id from localStorage > 'anon'.

const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');

// Only client-originated event types are accepted here; server-truth events
// (prompt_generated, plan_built) are recorded by their own routes. The set
// itself lives in analytics.js next to the server list, so the accept-list
// and the record-list can never drift apart.
const CLIENT_TYPES = analytics.CLIENT_EVENT_TYPES;

router.post('/', (req, res) => {
  const { type, idea_id, source, owner_id } = req.body || {};
  if (!CLIENT_TYPES.has(type)) {
    return res.status(400).json({ error: 'BAD_EVENT', message: 'Unknown event type.' });
  }
  analytics.recordEvent({
    type,
    ownerKey: (req.user && req.user.id) || owner_id || 'anon',
    ideaId: idea_id,
    source
  });
  res.status(204).end();
});

module.exports = router;
