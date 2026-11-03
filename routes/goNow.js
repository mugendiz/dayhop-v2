// routes/goNow.js — DayHop V2
// "Go Now": can we leave the house with a kid right now? The nearest
// washrooms, with honest changing-table and stroller info, on one map.
// Data and honesty rules: services/goNow.js.
//
//   GET  /go                    the page. ?p=<id> opens one stop and makes it
//                               the link preview; ?lat&lng centres the map.
//   GET  /api/go/near           nearest stops as JSON (spec shape)
//   GET  /api/go/place/<id>     one stop
//   GET  /api/go/card/<id>.png  the share card (1080x1350)
//   POST /api/go/alert          "email me when this status changes"
//                               (Toronto live stops only; services/goAlerts.js)
//
// /go/<key> stays the keyed profile-link router (routes/go.js); this page
// is only the bare /go path. No accounts, no upsells on this page.

const express = require('express');
const sharp = require('sharp');
const goNow = require('../services/goNow');
const { escapeHtml: esc, origin, recordView } = require('./blog');

const page = express.Router();
const api = express.Router();

const ID_RE = /^[a-z]{2,4}-[a-z0-9]{1,40}$/i;

const SOURCE_LABEL = {
  toronto_open_data: 'City of Toronto open data (live)',
  ottawa_open_data: 'City of Ottawa open data',
  osm: 'OpenStreetMap',
  manual: 'Checked by DayHop'
};

const fmtDate = d => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'unknown');

function html({ base, title, description, ogImage, canonical, lastCheck }) {
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
<link rel="preload" href="/vendor/leaflet-1.9.4/leaflet.js" as="script">
<link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css">
<link rel="stylesheet" href="/go.css">
<script src="/pixel.js" defer></script>
</head>
<body>
<header class="gn-top">
  <div class="gn-brand"><a class="gn-logo" href="/" aria-label="DayHop home">DayHop</a><span class="gn-title">Go Now</span></div>
  <div class="gn-chips" aria-label="Show only">
    <button class="gn-chip" data-f="open" aria-pressed="false" aria-label="Open washrooms only">${ICON.wc}<span>Open now</span></button>
    <button class="gn-chip" data-f="changing" aria-pressed="false">${ICON.ct}<span>Changing table</span></button>
    <button class="gn-chip" data-f="stroller" aria-pressed="false">${ICON.stroller}<span>Stroller</span></button>
  </div>
  <p class="gn-banner"><b>GTA live</b> · Ontario seeded · Last data check <span id="gn-lastcheck">${esc(lastCheck)}</span></p>
</header>
<main id="gn-map" aria-label="Map of washrooms"></main>
<button id="gn-locate" class="gn-locate" aria-label="Use my location">${ICON.locate}</button>
<section id="gn-sheet" class="gn-sheet" aria-live="polite">
  <div class="gn-grip" aria-hidden="true"></div>
  <div id="gn-detail" class="gn-detail" hidden></div>
  <div id="gn-browse">
    <p id="gn-where" class="gn-where">Finding washrooms near you…</p>
    <ol id="gn-list" class="gn-list"></ol>
  </div>
  <p class="gn-legend"><span class="dot open"></span>Open <span class="dot unknown"></span>Unknown <span class="dot closed"></span>Closed. Only City of Toronto park washrooms have live open or closed status. Everything else says unknown until someone checks.</p>
  <p class="gn-foot">Want a full outdoor day? <a href="/?utm_source=go">Plan it free →</a></p>
  <p class="gn-src">Sources: City of Toronto open data (live), City of Ottawa open data, © OpenStreetMap contributors.</p>
</section>
<div id="gn-toast" class="gn-toast" role="status" aria-live="polite"></div>
<script src="/vendor/leaflet-1.9.4/leaflet.js"></script>
<script src="/go.js" defer></script>
</body>
</html>`;
}

// Small rounded line icons, shared by the chips here and the pins in go.js.
const ICON = {
  wc: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 7v6M5 21l2-8 2 8M15 21v-6h-1l2-8h2l2 8h-1v6"/><circle cx="7" cy="4" r="1.6" fill="currentColor"/><circle cx="17" cy="4" r="1.6" fill="currentColor"/></svg>',
  ct: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="7" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 15h16M6 15c0 3 2.5 5 6 5s6-2 6-5"/></svg>',
  stroller: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h2l2 9h10l2-7H8M12 7V3a6 6 0 0 1 6 6"/><circle cx="9" cy="19" r="1.8" fill="currentColor"/><circle cx="17" cy="19" r="1.8" fill="currentColor"/></svg>',
  locate: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
};

const statusWord = p => ({ open: 'Open', closed: 'Closed', unknown: 'Status unknown' }[p.washroom_status]);
const yesNo = (v, yes, no) => (v === true ? yes : v === false ? no : `${yes.split(' ')[0]} unknown`);

page.get('/go', async (req, res, next) => {
  try {
    recordView(req, 'go', req.query.p ? 'place' : 'map');
    const base = origin(req);
    const m = goNow.meta();
    let title = 'Go Now: open washrooms, changing tables, stroller access | DayHop';
    let description = 'The nearest washroom and what is known about it: open or closed, changing table, stroller access. Live for Toronto park washrooms, seeded across Ontario, unknown when unknown.';
    let ogImage = `${base}/api/go/card/default.png`;
    let canonical = '/go';
    const id = String(req.query.p || '');
    if (ID_RE.test(id)) {
      const p = await goNow.byId(id).catch(() => null);
      if (p) {
        title = `${p.name}: ${statusWord(p)} | DayHop Go Now`;
        description = `${statusWord(p)}. ${yesNo(p.changing_table, 'Changing table', 'No changing table')}. ${yesNo(p.stroller_friendly, 'Stroller friendly', 'Not stroller friendly')}. Checked ${fmtDate(p.last_checked)}.`;
        ogImage = `${base}/api/go/card/${encodeURIComponent(p.id)}.png`;
        canonical = `/go?p=${encodeURIComponent(p.id)}`;
      }
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html({ base, title, description, ogImage, canonical, lastCheck: fmtDate(m.toronto_checked || m.ontario_seeded) }));
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
      lat, lng,
      filters: { open: flag(f, 'open'), changing: flag(f, 'changing'), stroller: flag(f, 'stroller') },
      limit: Math.min(Number(req.query.limit) || 8, 60)
    });
    res.set('Cache-Control', 'no-store');
    res.json({ results, meta: goNow.meta() });
  } catch (err) { next(err); }
});

api.get('/place/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const p = ID_RE.test(id) ? await goNow.byId(id) : null;
    if (!p) return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('Cache-Control', 'public, max-age=600');
    res.json(p);
  } catch (err) { next(err); }
});

// Status-change alerts: a newsletter signup (double opt-in) with a stop
// attached. Only Toronto's live feed can change, so only those stops.
api.post('/alert', express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const { email, id, attrib } = req.body || {};
    const p = ID_RE.test(String(id || '')) ? await goNow.byId(String(id)) : null;
    if (!p) return res.status(400).json({ ok: false, message: 'That stop is not on the map.' });
    if (p.source !== 'toronto_open_data') return res.status(400).json({ ok: false, message: 'Status alerts work for City of Toronto park washrooms, the only ones with live status.' });
    const sub = await require('../services/newsletter').subscribe(email, { source: 'go_alert', ip: req.ip, attrib, userAgent: req.headers['user-agent'] });
    if (!sub.ok) return res.status(400).json({ ok: false, message: 'That email does not look right.' });
    await require('../services/goAlerts').watch(p.id, String(email).trim().toLowerCase(), p.washroom_status);
    require('../services/analytics').recordEvent({ type: 'go_alert', ownerKey: 'anon', meta: { id: p.id } });
    const confirmNote = sub.state === 'already_subscribed' ? '' : ' Confirm your email first (check your inbox), or the alert cannot reach you.';
    res.json({ ok: true, message: `Done. We will email you when ${p.name} opens or closes.${confirmNote}` });
  } catch (err) { next(err); }
});

// ---------- share card ----------
function wrapLines(text, max, lines) {
  const words = String(text).split(/\s+/);
  const out = [''];
  for (const w of words) {
    const cur = out[out.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) {
      if (out.length === lines) { out[out.length - 1] = `${cur.replace(/\s+\S*$/, '')}…`; break; }
      out.push(w);
    } else out[out.length - 1] = (cur + ' ' + w).trim();
  }
  return out;
}
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The 1080x1350 share card as SVG. p null → the generic Go Now card. Pure. */
function cardSvg(p) {
  const F = 'DejaVu Sans, Segoe UI, Helvetica, Arial, sans-serif';
  const COLORS = { true: ['#2D7A55', '#E3F1E8'], open: ['#2D7A55', '#E3F1E8'], unknown: ['#6B7578', '#ECEEEE'], false: ['#B23A2B', '#FBE3DF'], closed: ['#B23A2B', '#FBE3DF'] };
  const nameLines = p ? wrapLines(p.name, 20, 3) : ['Open washrooms,', 'changing tables,', 'stroller access'];
  let y = 470;
  const name = nameLines.map((l, i) => `<text x="90" y="${y + i * 92}" font-family="${F}" font-size="80" font-weight="700" fill="#102A2E">${x(l)}</text>`).join('');
  y += nameLines.length * 92 + 10;
  const sub = p ? (p.park && p.park !== p.name ? p.park : p.address || (p.region === 'GTA' ? '' : 'Ontario')) : 'The nearest one, honestly labelled';
  const subEl = sub ? `<text x="90" y="${y}" font-family="${F}" font-size="38" fill="#41585C">${x(String(sub).slice(0, 44))}</text>` : '';
  y += 100;
  const rows = p ? [
    ['Washroom', statusWord(p), COLORS[p.washroom_status]],
    ['Changing table', p.changing_table === true ? 'Yes' : p.changing_table === false ? 'No' : 'Unknown', COLORS[String(p.changing_table)]],
    ['Stroller', p.stroller_friendly === true ? 'Step-free' : p.stroller_friendly === false ? 'No' : 'Unknown', COLORS[String(p.stroller_friendly)]]
  ] : [];
  const rowEls = rows.map(([label, val, c], i) => {
    const ry = y + i * 96;
    return `<text x="90" y="${ry}" font-family="${F}" font-size="40" fill="#41585C">${x(label)}</text><rect x="520" y="${ry - 50}" rx="34" ry="34" width="${70 + val.length * 26}" height="68" fill="${c[1]}"/><text x="555" y="${ry - 5}" font-family="${F}" font-size="38" font-weight="700" fill="${c[0]}">${x(val)}</text>`;
  }).join('');
  const checked = p ? `<text x="90" y="1150" font-family="${F}" font-size="30" fill="#6B7C7E">${x(`Checked ${fmtDate(p.last_checked)} · ${SOURCE_LABEL[p.source] || p.source}`)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#FBF7EE"/>
<rect width="1080" height="300" fill="#2D5A47"/>
<path d="M0 300 Q 270 360 540 300 T 1080 300 V 300 Z" fill="#2D5A47"/>
<circle cx="930" cy="150" r="88" fill="#E1502F"/>
<g transform="translate(882 102) scale(4)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7v6M5 21l2-8 2 8M15 21v-6h-1l2-8h2l2 8h-1v6"/></g>
<circle cx="910" cy="118" r="6" fill="#fff"/><circle cx="950" cy="118" r="6" fill="#fff"/>
<text x="90" y="150" font-family="${F}" font-size="64" font-weight="800" fill="#ffffff">DayHop</text>
<text x="90" y="215" font-family="${F}" font-size="42" font-weight="600" fill="#CFE3D8">Go Now</text>
${name}${subEl}${rowEls}${checked}
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
    const key = p ? `${p.id}|${p.washroom_status}|${p.last_checked}` : 'default';
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

module.exports = { page, api, cardSvg, html, SOURCE_LABEL };
