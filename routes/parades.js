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
.pz-logi{display:block;font-size:13px;color:#2D5A47;margin-top:6px}
.pz-status{display:inline-block;font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px}
.pz-status.ok{background:#E3F1E8;color:#2D7A55}
.pz-status.no{background:#ECEEEE;color:#6B7578}
tr.pz-unconf td{color:#6b7c7e}
.pz-tips{margin:22px 0}
.pz-tips h2{font-size:21px;margin:0 0 8px}
.pz-tips li{margin:0 0 8px;line-height:1.55}
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

// logistics: { [slug]: { name, dist } } nearest public washroom to each
// start point (services/goNow.js), computed per request; optional.
function logisticsLine(p, logistics) {
  const goLink = `/go?lat=${p.lat}&amp;lng=${p.lng}&amp;utm_source=parades`;
  if (p.slug === 'toronto') return `🚻 Route not posted yet. <a href="${goLink}">Find open washrooms downtown on Go Now</a>`;
  const w = logistics && logistics[p.slug];
  if (!w) return `🚻 <a href="${goLink}">Washrooms near the start on Go Now</a>`;
  const d = w.dist < 1000 ? `${Math.round(w.dist / 10) * 10} m` : `${(w.dist / 1000).toFixed(1)} km`;
  const named = !/^public (washroom|toilets?)$/i.test(String(w.name).trim());
  return `🚻 Nearest public washroom we know of${named ? `: ${esc(w.name)},` : ' is'} about ${d} from the start (open or closed status not live). <a href="${goLink}">More on Go Now</a>`;
}

function bodyHtml(base, today, logistics = {}) {
  const confirmedRows = PARADES.slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => {
    const past = p.date < today;
    return `<tr id="${esc(p.slug)}"${past ? ' class="past"' : ''}>
  <td><b>${esc(fmtDay(p.date))}</b>${past ? '<span class="pz-note">Already happened</span>' : ''}</td>
  <td><span class="pz-town">${esc(p.town)}</span><span class="pz-note">${esc(p.name)}</span></td>
  <td>${p.time ? esc(p.time) : '<span class="pz-tbc">Not posted yet</span>'}</td>
  <td>${esc(p.where)}${p.note ? `<span class="pz-note">${esc(p.note)}</span>` : ''}<span class="pz-logi">${logisticsLine(p, logistics)}</span></td>
  <td><span class="pz-status ok">Confirmed</span><span class="pz-note">Verified on ${esc(fmtVerified(p.verified_on))}</span></td>
  <td><a href="${esc(p.official_url)}" rel="noopener" target="_blank">Official page</a>${past ? '' : `<span class="pz-note"><a href="/santa-parades/${esc(p.slug)}.ics">📅 Add to calendar</a></span>`}</td>
</tr>`;
  });
  const unconfirmedRows = NOT_POSTED.map(town => `<tr class="pz-unconf">
  <td><span class="pz-tbc">Not posted</span></td>
  <td><span class="pz-town">${esc(town)}</span></td>
  <td></td>
  <td><span class="pz-note">No 2026 date on the town's own site when we checked. We add it once they post it.</span></td>
  <td><span class="pz-status no">Unconfirmed</span></td>
  <td></td>
</tr>`);
  const rows = [...confirmedRows, ...unconfirmedRows].join('\n');
  const upcoming = PARADES.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const options = upcoming.map(p => `<option value="${esc(p.slug)}">${esc(p.town)}, ${esc(fmtDay(p.date))}</option>`).join('');
  const share = shareLinks(`${base}/santa-parades`);
  const lastChecked = PARADES.map(p => p.verified_on).sort().pop();
  const mapData = JSON.stringify(PARADES.map(p => ({
    slug: p.slug, town: p.town, day: fmtDay(p.date), time: p.time, lat: p.lat, lng: p.lng, past: p.date < today, url: p.official_url
  }))).replace(/</g, '\\u003c');

  return `${STYLE}
<link rel="stylesheet" href="/vendor/leaflet-1.9.4/leaflet.css">
<figure class="pz-hero">
  <img src="${PHOTOS.hero.src}" width="${PHOTOS.hero.w}" height="${PHOTOS.hero.h}" alt="${esc(PHOTOS.hero.alt)}" fetchpriority="high">
  <figcaption>${PHOTOS.hero.caption}</figcaption>
</figure>
<h1>GTA Santa Claus parades 2026: dates, times and routes, checked 🎅</h1>
<p class="pz-lede">Every 2026 parade we could confirm on the town's or organizer's own page, with start times, routes, the nearest washroom and a map. A date only goes in the table once the official page posts it.</p>
<span class="pz-checked">✓ Last checked ${esc(fmtVerified(lastChecked))}</span>

<div id="pz-map" role="img" aria-label="Map of GTA Santa Claus parade start areas"></div>
<p class="pz-mapnote">Pins mark each parade's start area and are approximate. The official page has the exact route.</p>

<table class="pz-table">
<thead><tr><th>Date</th><th>Town</th><th>Time</th><th>Start and route</th><th>Status</th><th>Official link</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="pz-note">Confirmed means the date is on the organizer's own page. Times and routes can still change, so check the official page the week of the parade.</p>

<div class="pz-strip">
${PHOTOS.strip.map(p => `  <figure><img src="${p.src}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}" loading="lazy"><figcaption>${p.caption}</figcaption></figure>`).join('\n')}
</div>

<section class="pz-tips" id="tips">
  <h2>Parade day with kids: what actually helps</h2>
  <ul>
    <li><b>Layer up more than feels necessary.</b> Standing still on a curb for an hour in late November is colder than walking around in the same weather.</li>
    <li><b>Bring your own hot drinks and snacks.</b> Cafe lineups near the route get long the moment a parade lets out.</li>
    <li><b>Find a washroom before you need one.</b> Washrooms near a route fill up once the crowd arrives. Each row above has the nearest one we know of, and <a href="/go?utm_source=parades">Go Now</a> finds more.</li>
    <li><b>Plan for a washout.</b> Most parades run rain or shine. Know which indoor spot nearby could save the morning if a downpour hits.</li>
    <li><b>Think about transit.</b> Roads along the route close for a few hours and parking nearby disappears early, so a train or bus can beat circling for a spot.</li>
    <li><b>Keep it short for little ones.</b> An hour of waiting plus the parade is a long stretch for a three year old. A spot near the middle of the route usually means less standing around before anything happens.</li>
    <li><b>Check the official page the week of.</b> Towns adjust routes for construction (Pickering moved its route this year), so the town's page beats any list, including this one.</li>
  </ul>
</section>

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
      t.appendChild(document.createTextNode(' · '));
      var o = document.createElement('a'); o.href = p.url; o.target = '_blank'; o.rel = 'noopener'; o.textContent = 'Official page'; t.appendChild(o);
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

// Nearest public washroom to each start point, from Go Now's data
// (services/goNow.js). Winter filter drops anything the source marks closed
// for the season. Never blocks the page: a failure just drops the line.
async function washroomLogistics() {
  const goNow = require('../services/goNow');
  const out = {};
  await Promise.all(PARADES.filter(p => p.slug !== 'toronto').map(async p => {
    try {
      const [w] = await goNow.nearest({ lat: p.lat, lng: p.lng, layer: 'wc', filters: { winter: true }, limit: 1 });
      if (w && w.dist <= 1500) out[p.slug] = { name: w.n, dist: w.dist };
    } catch { /* line omitted */ }
  }));
  return out;
}

router.get('/santa-parades', async (req, res, next) => {
  try {
    recordView(req, 'parades', '2026');
    const base = origin(req);
    const today = TORONTO_DAY.format(new Date());
    const next = PARADES.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const description = `Every 2026 Santa Claus parade in the GTA with dates, start times and routes, checked against each town's own page.${next.length ? ` Next up: ${next[0].town}, ${fmtDay(next[0].date)}.` : ''}`;
    const logistics = await washroomLogistics();
    res.set('Cache-Control', 'public, max-age=600');
    res.send(page({
      req, title: 'GTA Santa Claus parades 2026: dates, times, routes and map | DayHop',
      description, canonicalPath: '/santa-parades', ogType: 'article', subscribePanel: false,
      ogImage: `${base}${PHOTOS.og}`,
      bodyHtml: bodyHtml(base, today, logistics)
    }));
  } catch (err) { next(err); }
});

// Short and old addresses for the page.
router.get(['/parades', '/santa-parades-2026'], (req, res) => res.redirect(301, '/santa-parades'));

// ---------- calendar files ----------
// "11 a.m. to 1 p.m." → [11:00, 13:00]; "6 p.m." → [18:00, 20:00]. Null when
// the official page posted no time (the event is then all day). Pure.
function parseTimes(text) {
  if (!text) return null;
  const re = /(\d{1,2})(?::(\d{2}))?\s*(a|p)\.m\./gi;
  const hits = [];
  let m;
  while ((m = re.exec(text))) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') h += 12;
    hits.push(h * 60 + Number(m[2] || 0));
  }
  if (!hits.length) return null;
  return [hits[0], hits[1] != null && hits[1] > hits[0] ? hits[1] : hits[0] + 120];
}

const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const hhmm = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}00`;

/** One parade as an iCalendar file (America/Toronto wall time). Pure. */
function icsFor(p, base) {
  const ymd = p.date.replace(/-/g, '');
  const times = parseTimes(p.time);
  const when = times
    ? [`DTSTART;TZID=America/Toronto:${ymd}T${hhmm(times[0])}`, `DTEND;TZID=America/Toronto:${ymd}T${hhmm(times[1])}`]
    : (() => { const d = new Date(`${p.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return [`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${d.toISOString().slice(0, 10).replace(/-/g, '')}`]; })();
  const desc = [p.time ? null : 'Start time not posted yet. Check the official page.', p.note, `Official page: ${p.official_url}`, `All GTA parades: ${base}/santa-parades`].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DayHop//Santa Parades 2026//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:America/Toronto',
    'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:parade-${p.slug}-2026@dayhop.quest`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    ...when,
    `SUMMARY:${icsEsc(`${p.name} (${p.town})`)}`,
    `LOCATION:${icsEsc(p.where)}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    `URL:${p.official_url}`,
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
}

router.get('/santa-parades/:slug.ics', (req, res) => {
  const p = PARADES.find(x => x.slug === String(req.params.slug));
  if (!p) return res.status(404).send('Not found');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${p.slug}-santa-parade-2026.ics"`);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(icsFor(p, origin(req)));
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

module.exports = { router, api, bodyHtml, icsFor, parseTimes };
