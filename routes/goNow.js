// routes/goNow.js — DayHop V2
// "Go Now": the nearest washroom, changing table or family stop, on a map,
// in one tap. Data and honesty rules live in services/goNow.js.
//
//   GET /go                    the page (mobile first). ?p=<id> opens one
//                              place and makes it the link preview.
//   GET /api/go/near           nearest results as JSON
//   GET /api/go/card/<id>.png  the share card image (1080x1350)
//
// /go/<key> stays the keyed profile-link router (routes/go.js); this page
// is only the bare /go path.

const express = require('express');
const sharp = require('sharp');
const goNow = require('../services/goNow');
const { escapeHtml: esc, origin, recordView } = require('./blog');

const page = express.Router();
const api = express.Router();

const ID_RE = /^[a-z]{2,4}-[a-z0-9]{1,40}$/i;

function html({ base, title, description, ogImage, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${base}${canonical}">
<meta name="theme-color" content="#FBF7EE">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${base}${canonical}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css">
<link rel="stylesheet" href="/go.css">
<script src="/pixel.js" defer></script>
</head>
<body>
<header class="gn-top">
  <a class="gn-logo" href="/" aria-label="DayHop home">DayHop <span>Go Now</span></a>
  <div class="gn-chips" role="tablist" aria-label="What do you need">
    <button class="gn-chip on" data-layer="wc" role="tab" aria-selected="true">${ICON.wc}<span>Washrooms</span></button>
    <button class="gn-chip" data-layer="ct" role="tab" aria-selected="false">${ICON.ct}<span>Changing tables</span></button>
    <button class="gn-chip" data-layer="stop" role="tab" aria-selected="false">${ICON.stop}<span>Family stops</span></button>
  </div>
  <div class="gn-filters" aria-label="Filters">
    <button class="gn-filter" data-f="open" aria-pressed="false">Open now</button>
    <button class="gn-filter" data-f="winter" aria-pressed="false">Winter open</button>
    <button class="gn-filter" data-f="free" aria-pressed="false">Free only</button>
  </div>
</header>
<main id="gn-map" aria-label="Map"></main>
<button id="gn-locate" class="gn-locate" aria-label="Use my location">${ICON.locate}</button>
<section id="gn-sheet" class="gn-sheet" aria-live="polite">
  <div class="gn-grip" aria-hidden="true"></div>
  <p id="gn-where" class="gn-where">Finding what's near you…</p>
  <ol id="gn-list" class="gn-list"></ol>
  <p class="gn-foot">Want a full outdoor day? <a href="/?utm_source=go">Plan it free →</a></p>
  <p class="gn-src">Toronto park washrooms: City of Toronto live feed. Elsewhere: City of Ottawa, Toronto EarlyON and © OpenStreetMap contributors. Only Toronto shows live open or closed; everywhere else says so. <span id="gn-meta"></span></p>
</section>
<div id="gn-toast" class="gn-toast" role="status" aria-live="polite"></div>
<script src="/vendor/leaflet-1.9.4/leaflet.js"></script>
<script src="/go.js" defer></script>
</body>
</html>`;
}

// Small rounded line icons, shared by the chips here and the pins in go.js.
const ICON = {
  wc: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 4v0M7 7v6M5 21l2-8 2 8M17 4v0M15 21v-6h-1l2-8h2l2 8h-1v6"/><circle cx="7" cy="4" r="1.6" fill="currentColor"/><circle cx="17" cy="4" r="1.6" fill="currentColor"/></svg>',
  ct: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 15h16M6 15c0 3 2.5 5 6 5s6-2 6-5M9 11.5c1 .8 2 1.2 3 1.2s2-.4 3-1.2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 6h3l2 8h9l2-6H8M9 14l-1 3"/><circle cx="9" cy="19.5" r="1.6" fill="currentColor"/><circle cx="17" cy="19.5" r="1.6" fill="currentColor"/></svg>',
  locate: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
};

page.get('/go', async (req, res, next) => {
  try {
    recordView(req, 'go', req.query.p ? 'place' : 'map');
    const base = origin(req);
    let title = 'Go Now: open washrooms and changing tables near you | DayHop';
    let description = 'The nearest washroom, changing table or family stop, on one map. Live open or closed status for Toronto park washrooms; honest labels everywhere else in Ontario.';
    let ogImage = `${base}/api/go/card/default.png`;
    let canonical = '/go';
    const id = String(req.query.p || '');
    if (ID_RE.test(id)) {
      const p = await goNow.byId(id).catch(() => null);
      if (p) {
        title = `${p.n}: ${p.statusLabel.label} | DayHop Go Now`;
        description = `${[p.ct && 'Changing table', p.stepfree && 'Step-free entrance', p.free && 'Free'].filter(Boolean).join(', ') || 'Washroom'}. Find the nearest one on DayHop Go Now.`;
        ogImage = `${base}/api/go/card/${encodeURIComponent(p.id)}.png`;
        canonical = `/go?p=${encodeURIComponent(p.id)}`;
      }
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html({ base, title, description, ogImage, canonical }));
  } catch (err) { next(err); }
});

const flag = (s, k) => String(s || '').split(',').includes(k);

api.get('/near', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!(lat > 41 && lat < 57.5 && lng > -95.5 && lng < -74)) {
      return res.status(400).json({ error: 'OUTSIDE_ONTARIO', message: 'Go Now covers Ontario.' });
    }
    const f = req.query.f;
    const results = await goNow.nearest({
      lat, lng, layer: String(req.query.layer || 'wc'),
      filters: { open: flag(f, 'open'), winter: flag(f, 'winter'), free: flag(f, 'free') },
      limit: Math.min(Number(req.query.limit) || 8, 40)
    });
    res.set('Cache-Control', 'no-store');
    res.json({ results, meta: goNow.meta() });
  } catch (err) { next(err); }
});

// One place, for a shared link (/go?p=<id>) to center on.
api.get('/place/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const p = ID_RE.test(id) ? await goNow.byId(id) : null;
    if (!p) return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('Cache-Control', 'public, max-age=600');
    res.json(p);
  } catch (err) { next(err); }
});

// ---------- share card ----------
function wrapLines(text, max, lines) {
  const words = String(text).split(/\s+/);
  const out = [''];
  for (const w of words) {
    const cur = out[out.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) { if (out.length === lines) { out[out.length - 1] = `${cur.replace(/\s+\S*$/, '')}…`; break; } out.push(w); }
    else out[out.length - 1] = (cur + ' ' + w).trim();
  }
  return out;
}
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The 1080x1350 share card as SVG. p null → the generic Go Now card. Pure. */
function cardSvg(p) {
  const F = "DejaVu Sans, Segoe UI, Helvetica, Arial, sans-serif";
  const pill = p ? { open: ['#2D7A55', '#E3F1E8'], unknown: ['#9A6B12', '#FBEFD5'], closed: ['#6B7578', '#ECEEEE'] }[p.statusLabel.key] : null;
  const badges = p ? [p.ct && 'Changing table', p.stepfree && 'Step-free entrance', p.acc && 'Accessible', p.free && 'Free'].filter(Boolean) : [];
  const nameLines = p ? wrapLines(p.n, 20, 3) : ['Washrooms,', 'changing tables,', 'family stops'];
  const sub = p ? (p.park && p.park !== p.n ? p.park : p.addr || '') : 'Nearest first, anywhere in Ontario';
  let y = 470;
  const name = nameLines.map((l, i) => `<text x="90" y="${y + i * 92}" font-family="${F}" font-size="80" font-weight="700" fill="#102A2E">${x(l)}</text>`).join('');
  y += nameLines.length * 92 + 10;
  const subEl = sub ? `<text x="90" y="${y}" font-family="${F}" font-size="38" fill="#41585C">${x(String(sub).slice(0, 44))}</text>` : '';
  y += 90;
  const pillEl = p ? `<rect x="90" y="${y - 52}" rx="34" ry="34" width="${Math.min(900, 60 + p.statusLabel.label.length * 25)}" height="70" fill="${pill[1]}"/><text x="125" y="${y - 6}" font-family="${F}" font-size="38" font-weight="700" fill="${pill[0]}">${x(p.statusLabel.label)}</text>` : '';
  y += p ? 80 : 0;
  // Badges flow left to right and wrap, so four of them never reach the
  // source line at the bottom.
  let bx = 90;
  const badgeEl = badges.map(b => {
    const w = 56 + b.length * 21;
    if (bx + w > 990) { bx = 90; y += 84; }
    const el = `<rect x="${bx}" y="${y - 52}" rx="20" ry="20" width="${w}" height="66" fill="#ffffff" stroke="#2D5A47" stroke-width="3"/><text x="${bx + 28}" y="${y - 8}" font-family="${F}" font-size="34" font-weight="700" fill="#2D5A47">${x(b)}</text>`;
    bx += w + 16;
    return el;
  }).join('');
  const fmtChecked = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const checked = p && p.checked ? `<text x="90" y="1150" font-family="${F}" font-size="30" fill="#6B7C7E">City of Toronto status, last updated ${x(fmtChecked(p.checked))}</text>` : (p ? `<text x="90" y="1150" font-family="${F}" font-size="30" fill="#6B7C7E">Status not live here. Check before you go.</text>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#FBF7EE"/>
<rect width="1080" height="300" fill="#2D5A47"/>
<path d="M0 300 Q 270 360 540 300 T 1080 300 V 300 Z" fill="#2D5A47"/>
<circle cx="930" cy="150" r="88" fill="#E1502F"/>
<g transform="translate(882 102) scale(4)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7v6M5 21l2-8 2 8M15 21v-6h-1l2-8h2l2 8h-1v6"/></g>
<circle cx="910" cy="118" r="6" fill="#fff"/><circle cx="950" cy="118" r="6" fill="#fff"/>
<text x="90" y="150" font-family="${F}" font-size="64" font-weight="800" fill="#ffffff">DayHop</text>
<text x="90" y="215" font-family="${F}" font-size="42" font-weight="600" fill="#CFE3D8">Go Now</text>
${name}${subEl}${pillEl}${badgeEl}${checked}
<rect x="0" y="1200" width="1080" height="150" fill="#102A2E"/>
<text x="90" y="1290" font-family="${F}" font-size="42" font-weight="700" fill="#ffffff">Find the nearest one: dayhop.quest/go</text>
</svg>`;
}

const cardCache = new Map();
api.get('/card/:id.png', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    let p = null;
    if (id !== 'default') {
      if (!ID_RE.test(id)) return res.status(404).end();
      p = await goNow.byId(id);
      if (!p) return res.status(404).end();
    }
    const key = p ? `${p.id}|${p.statusLabel.label}|${p.checked || ''}` : 'default';
    let png = cardCache.get(key);
    if (!png) {
      png = await sharp(Buffer.from(cardSvg(p))).png({ compressionLevel: 9 }).toBuffer();
      if (cardCache.size > 500) cardCache.clear();
      cardCache.set(key, png);
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (err) { next(err); }
});

module.exports = { page, api, cardSvg, html };
