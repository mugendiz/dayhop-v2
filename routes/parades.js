// routes/parades.js — DayHop V2
// GET  /santa-parades           every GTA Santa Claus parade of 2026 on one
//                               map and one table, each row checked against
//                               the organizer's own page (data/santaParades2026.js)
// POST /api/parades/remind      "email me the night before" (services/paradeReminders.js)
//
// Built for the week of Nov 3, 2026: the incumbent GTA parade list still
// showed 2025 dates (research notes, 2026-11-03), so the claim this page
// makes is "the 2026 dates, checked, on a map". Plain HTML table first, so
// AI answers can quote it; the map is a layer on top.

const express = require('express');
const router = express.Router(); // the page, mounted at app level
const api = express.Router();    // mounted at /api/parades behind the newsletter limiter
const { PARADES, NOT_POSTED } = require('../data/santaParades2026');
const reminders = require('../services/paradeReminders');
const newsletter = require('../services/newsletter');
const { page, escapeHtml: esc, origin, recordView } = require('./blog');

const TORONTO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
const fmtDay = ymd => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtVerified = ymd => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function shareLinks(url) {
  const tag = medium => `${url}?utm_source=share&utm_medium=${medium}&utm_campaign=parades`;
  const text = 'Every GTA Santa Claus parade for 2026, with times and a map';
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${tag('whatsapp')}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tag('facebook'))}`,
    copy: tag('copy')
  };
}

// Photos: Wikimedia Commons, CC BY 2.0, self-hosted and resized
// (public/img/parades/, fetched 2026-11-03). All three are from Toronto's
// parade, so captions say Toronto; never caption one as another town's.
const PHOTO_CREDIT = (file, author) => `Photo: <a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(file).replace(/%20/g, '_')}" rel="noopener" target="_blank">${author}</a>, <a href="https://creativecommons.org/licenses/by/2.0/" rel="noopener" target="_blank">CC BY 2.0</a>`;
const PHOTOS = {
  hero: { src: '/img/parades/santa-waving.jpg', w: 1200, h: 700, alt: 'Santa waving from his sleigh float at the Toronto Santa Claus Parade',
    caption: `Santa at the Original Santa Claus Parade, Toronto. ${PHOTO_CREDIT('File:Santa Claus Parade (Toronto) (23052920425).jpg', 'Randy Landicho')}` },
  strip: [
    { src: '/img/parades/elves.jpg', w: 800, h: 533, alt: 'Elves dancing past families sitting along the curb in Toronto',
      caption: `Curbside in Toronto. ${PHOTO_CREDIT('File:Santa Claus Parade (Toronto) (22634640577).jpg', 'Randy Landicho')}` },
    { src: '/img/parades/clowns.jpg', w: 800, h: 533, alt: 'Clowns in bright wigs handing out cheer at the Toronto parade',
      caption: `Clowns on the Toronto route. ${PHOTO_CREDIT('File:Santa Claus Parade (Toronto) (22430193564).jpg', 'Randy Landicho')}` }
  ],
  og: '/img/parades/og-parades.jpg'
};

const STYLE = `
<style>
.pz-hero{margin:0 0 14px}
.pz-hero img,.pz-strip img{display:block;width:100%;height:auto;border-radius:14px}
.pz-hero figcaption,.pz-strip figcaption{font-size:11.5px;color:#8a9a9c;margin:4px 2px 0}
.pz-hero figcaption a,.pz-strip figcaption a{color:inherit}
.pz-strip{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0 6px}
.pz-strip figure{margin:0}
@media (max-width:640px){.pz-strip{grid-template-columns:1fr}}
.pz-lede{font-size:17px;line-height:1.6;color:#2C4A4E;margin:0 0 6px}
.pz-checked{display:inline-block;background:#E8F2EC;color:#2D5A47;font-weight:700;font-size:13px;padding:5px 10px;border-radius:999px;margin:4px 0 16px}
#pz-map{height:380px;border-radius:14px;border:1px solid #E8E2D4;margin:0 0 6px;z-index:0}
.pz-mapnote{font-size:12.5px;color:#6b7c7e;margin:0 0 22px}
.pz-table{width:100%;border-collapse:collapse;font-size:15px;margin:0 0 10px}
.pz-table th{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#3F6F5C;border-bottom:2px solid #E8E2D4;padding:8px 6px}
.pz-table td{border-bottom:1px solid #EFE9DB;padding:12px 6px;vertical-align:top}
.pz-table tr.past td{opacity:.45}
.pz-town{font-weight:800;color:#102A2E}
.pz-note{display:block;font-size:13px;color:#6b7c7e;margin-top:3px}
.pz-tbc{color:#B5482A;font-weight:600}
.pz-box{background:#102A2E;color:#fff;border-radius:14px;padding:18px;margin:22px 0}
.pz-box h2{margin:0 0 4px;font-size:19px;color:#fff}
.pz-box p{margin:0 0 12px;color:#d9e3df;font-size:14px;line-height:1.5}
.pz-form{display:flex;gap:8px;flex-wrap:wrap}
.pz-form select,.pz-form input{flex:1;min-width:160px;min-height:44px;padding:10px 12px;border-radius:10px;border:0;font-size:16px}
.pz-form button{min-height:44px;background:#E1502F;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:15px;cursor:pointer}
#pz-msg{margin:8px 0 0;font-size:14px;color:#FFB627}
.pz-share a,.pz-share button{display:inline-flex;align-items:center;min-height:44px;margin:0 6px 8px 0;padding:0 16px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
@media (max-width:640px){.pz-table thead{display:none}.pz-table,.pz-table tbody,.pz-table tr,.pz-table td{display:block;width:100%}.pz-table tr{border-bottom:1px solid #EFE9DB;padding:10px 0}.pz-table td{border:0;padding:2px 0}}
</style>`;

function bodyHtml(base, today) {
  const rows = PARADES.slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => {
    const past = p.date < today;
    return `<tr id="${esc(p.slug)}"${past ? ' class="past"' : ''}>
  <td><b>${esc(fmtDay(p.date))}</b>${past ? '<span class="pz-note">Already happened</span>' : ''}</td>
  <td><span class="pz-town">${esc(p.town)}</span><span class="pz-note">${esc(p.name)}</span></td>
  <td>${p.time ? esc(p.time) : '<span class="pz-tbc">Not posted yet</span>'}</td>
  <td>${esc(p.where)}${p.note ? `<span class="pz-note">${esc(p.note)}</span>` : ''}</td>
  <td><a href="${esc(p.official_url)}" rel="noopener" target="_blank">Official page</a><span class="pz-note">Checked ${esc(fmtVerified(p.verified_on))}</span></td>
</tr>`;
  }).join('\n');
  const upcoming = PARADES.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const options = upcoming.map(p => `<option value="${esc(p.slug)}">${esc(p.town)}, ${esc(fmtDay(p.date))}</option>`).join('');
  const share = shareLinks(`${base}/santa-parades`);
  const lastChecked = PARADES.map(p => p.verified_on).sort().pop();
  const mapData = JSON.stringify(PARADES.map(p => ({
    slug: p.slug, town: p.town, day: fmtDay(p.date), time: p.time, lat: p.lat, lng: p.lng, past: p.date < today
  }))).replace(/</g, '\\u003c');

  return `${STYLE}
<link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css">
<figure class="pz-hero">
  <img src="${PHOTOS.hero.src}" width="${PHOTOS.hero.w}" height="${PHOTOS.hero.h}" alt="${esc(PHOTOS.hero.alt)}" fetchpriority="high">
  <figcaption>${PHOTOS.hero.caption}</figcaption>
</figure>
<h1>Santa Claus parades in the GTA, 2026 🎅</h1>
<p class="pz-lede">Every 2026 date we could confirm, with start times, where each route runs and a map. Each row is checked against the town's or organizer's own page, not a listing site.</p>
<span class="pz-checked">✓ Last checked ${esc(fmtVerified(lastChecked))}</span>

<div id="pz-map" role="img" aria-label="Map of GTA Santa Claus parade start areas"></div>
<p class="pz-mapnote">Pins mark each parade's start area and are approximate. The official page has the exact route.</p>

<table class="pz-table">
<thead><tr><th>Date</th><th>Town</th><th>Time</th><th>Route</th><th>Source</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="pz-note">Not posted on the town's own site yet: ${esc(NOT_POSTED.join(', '))}. We check again before each weekend and add them here.</p>

<div class="pz-strip">
${PHOTOS.strip.map(p => `  <figure><img src="${p.src}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}" loading="lazy"><figcaption>${p.caption}</figcaption></figure>`).join('\n')}
</div>

${upcoming.length ? `<section class="pz-box" id="remind">
  <h2>Email me the night before 📬</h2>
  <p>Pick your parade and we'll send the time, the route and a tip the evening before. You also get DayHop's free weekend brief every Thursday. One click to leave.</p>
  <form id="pz-form" class="pz-form" novalidate>
    <select name="parade" aria-label="Your parade">${options}</select>
    <input type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">
    <button type="submit">Remind me</button>
  </form>
  <p id="pz-msg" role="status" aria-live="polite"></p>
</section>` : ''}

<div class="pz-share">
  <p style="font-weight:800;margin:0 0 8px;">Know a family who's going? Send them this 💌</p>
  <a href="${esc(share.whatsapp)}" target="_blank" rel="noopener" style="background:#1DA851;color:#fff;">💬 WhatsApp</a>
  <a href="${esc(share.facebook)}" target="_blank" rel="noopener" style="background:#1877F2;color:#fff;">Facebook</a>
  <button type="button" data-copy="${esc(share.copy)}" style="background:#fff;color:#102A2E;border:1.5px solid #102A2E;">🔗 Copy link</button>
</div>

<p style="margin:26px 0 0;font-size:15px;">Want a full outdoor day from one sentence? <a href="/?utm_source=parades">Plan it free →</a></p>

<script src="/vendor/leaflet-1.9.4/leaflet.js"></script>
<script>
(function () {
  var data = ${mapData};
  if (window.L && document.getElementById('pz-map')) {
    var map = L.map('pz-map', { scrollWheelZoom: false }).setView([43.75, -79.45], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var pts = [];
    data.forEach(function (p) {
      var m = L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: p.past ? '#9aa5a6' : '#E1502F', fillOpacity: 0.95 }).addTo(map);
      var t = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p.town; t.appendChild(b);
      t.appendChild(document.createElement('br'));
      t.appendChild(document.createTextNode(p.day + (p.time ? ', ' + p.time : ', time not posted yet')));
      t.appendChild(document.createElement('br'));
      var a = document.createElement('a'); a.href = '#' + p.slug; a.textContent = 'Details'; t.appendChild(a);
      m.bindPopup(t);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length) map.fitBounds(pts, { padding: [24, 24] });
  }
  var f = document.getElementById('pz-form');
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('pz-msg'), btn = f.querySelector('button');
    var email = (f.email.value || '').trim();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { msg.textContent = 'That email does not look right.'; f.email.focus(); return; }
    btn.disabled = true;
    fetch('/api/parades/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, parade: f.parade.value, attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { msg.textContent = d.message || 'Done. Check your inbox to confirm.'; if (d.ok) f.email.value = ''; })
      .catch(function () { msg.textContent = 'Could not save that just now. Please try again.'; })
      .then(function () { btn.disabled = false; });
  });
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      var done = function () { b.textContent = '✓ Link copied'; setTimeout(function () { b.textContent = '🔗 Copy link'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
      else window.prompt('Copy this link:', url);
    });
  });
})();
</script>`;
}

router.get('/santa-parades', (req, res) => {
  recordView(req, 'parades', '2026');
  const base = origin(req);
  const today = TORONTO_DAY.format(new Date());
  const next = PARADES.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const description = `Every 2026 Santa Claus parade in the GTA with dates, start times and routes, checked against each town's own page.${next.length ? ` Next up: ${next[0].town}, ${fmtDay(next[0].date)}.` : ''}`;
  res.set('Cache-Control', 'public, max-age=600');
  res.send(page({
    req, title: 'Santa Claus parades in the GTA 2026: dates, times and map | DayHop',
    description, canonicalPath: '/santa-parades', ogType: 'article', subscribePanel: false,
    ogImage: `${base}${PHOTOS.og}`,
    bodyHtml: bodyHtml(base, today)
  }));
});

api.post('/remind', express.json({ limit: '4kb' }), async (req, res, next) => {
  try {
    const { email, parade, attrib } = req.body || {};
    const sub = await newsletter.subscribe(email, { source: 'parade_reminder', ip: req.ip, attrib, userAgent: req.headers['user-agent'] });
    if (!sub.ok) return res.status(400).json({ ok: false, message: 'That email does not look right.' });
    const r = await reminders.addReminder(String(parade || ''), String(email).trim().toLowerCase());
    if (!r.ok) return res.status(400).json({ ok: false, message: 'Pick a parade from the list.' });
    require('../services/analytics').recordEvent({ type: 'parade_reminder', ownerKey: 'anon', meta: { parade: r.parade.slug } });
    const confirmNote = sub.state === 'already_subscribed' ? '' : ' Check your inbox and confirm your email first, or the reminder cannot reach you.';
    res.json({ ok: true, message: `You're set for ${r.parade.town}. We'll email you the evening before.${confirmNote}` });
  } catch (err) { next(err); }
});

module.exports = { router, api, bodyHtml };
