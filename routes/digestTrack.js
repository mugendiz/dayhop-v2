// routes/digestTrack.js — GET endpoints the Thursday digest's tracking
// links hit (services/digestLinks.js builds them). Both verify an HMAC
// before recording anything: /click won't redirect to an unsigned
// destination (no open-redirect service), /open won't count an unsigned
// pixel. Events land in the same analytics stream as everything else;
// owner_key is `sub-<sid>` — opaque, per-subscriber, never the
// unsubscribe token.

const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');
const { verifyClick, verifyOpen } = require('../services/digestLinks');

const GIF_1PX = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const clean = (v, max) => String(v || '').trim().slice(0, max);

// 1×1 pixel. Always answers with the gif — a broken signature should render
// invisibly in the email client, just uncounted.
router.get('/open', (req, res) => {
  const issue = clean(req.query.i, 10);
  const sid = clean(req.query.s, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(issue) && verifyOpen(issue, sid, req.query.sig)) {
    analytics.recordEvent({
      type: 'digest_opened',
      ownerKey: `sub-${sid}`,
      meta: { issue }
    });
  }
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': GIF_1PX.length
  });
  res.end(GIF_1PX);
});

// Signed redirect. The signature covers issue+sid+destination, so the only
// URLs this will ever bounce to are ones the digest itself embedded.
router.get('/click', (req, res) => {
  const issue = clean(req.query.i, 10);
  const sid = clean(req.query.s, 16);
  const url = clean(req.query.u, 600);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(issue) &&
    /^https?:\/\//i.test(url) &&
    verifyClick(issue, sid, url, req.query.sig);
  if (!ok) return res.status(400).send('Bad link.');
  const pick = Number(req.query.p);
  analytics.recordEvent({
    type: 'digest_clicked',
    ownerKey: `sub-${sid}`,
    meta: Object.assign({ issue }, Number.isInteger(pick) && pick >= 0 && pick < 50 ? { pick } : null)
  });
  res.redirect(302, url);
});

module.exports = router;
