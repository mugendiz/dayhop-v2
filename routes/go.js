// routes/go.js — keyed profile links. GET /go/<key>[/<page>] records a
// link_click event (meta.src = key, meta.page) and 302s to the page with
// the same key riding along as ?src= and utm_*. This is the tap between a
// TikTok view and a checkout that was never counted before Sept 2026:
// views were known, guide_checkout_started was known, the bio tap in the
// middle was not. Keys and pages are fixed allow-lists — no open redirect.

const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');

// Channel keys (Hopkins mode: every surface links with its own key).
const KEYS = new Set([
  'tiktok',   // @dayhop3 bio
  'ig',       // @dayhopofficial bio
  'igs',      // IG story link sticker
  'blog',     // dayhop.quest/blog article CTAs
  'reddit',   // comment links (rare, value-first protocol)
  'email',    // Thursday digest footer
  'zv-e',     // Meta Ad A (planner demo)
  'zv-a'      // Meta Ad B (guide)
]);

// Destinations. Default is the planner (the product sample); "rh" is the
// Richmond Hill sales letter; "guides" the gallery.
const PAGES = {
  plan: '/',
  guides: '/guides',
  rh: '/guides/richmond-hill'
};

const clean = (v) => String(v || '').trim().toLowerCase().slice(0, 32);

function destination(key, page) {
  const path = PAGES[page] || PAGES.plan;
  const q = new URLSearchParams({
    src: key,
    utm_source: key,
    utm_medium: 'social',
    utm_campaign: 'go-' + (PAGES[page] ? page : 'plan')
  });
  return path + '?' + q.toString();
}

router.get('/:key/:page?', (req, res) => {
  const key = clean(req.params.key);
  const page = clean(req.params.page) || 'plan';
  if (!KEYS.has(key)) return res.status(404).send('Unknown link.');
  analytics.recordEvent({
    type: 'link_click',
    ownerKey: 'anon',
    meta: {
      src: key,
      page: PAGES[page] ? page : 'plan',
      ua: String(req.get('user-agent') || '').slice(0, 120)
    }
  });
  res.set('Cache-Control', 'no-store');
  res.redirect(302, destination(key, page));
});

module.exports = router;
module.exports.KEYS = KEYS;
module.exports.PAGES = PAGES;
module.exports.destination = destination;
