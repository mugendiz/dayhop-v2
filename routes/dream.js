// routes/dream.js — DayHop V2
// Dream big (BETA, not public): the vision-board scroll.
//
//   GET /dream        a full-screen vertical scroll, one dream per screen:
//                     the vision cards (data/dreamBoard.js) and the real open
//                     houses (services/dreamHomes.js), each with a real way to
//                     get a taste and a share button.
//   GET /api/dream    the same, as JSON (?view=html adds the rendered
//                     panels), for the homepage rail and the /dream shell.
//
// Who sees it: admin accounts (the ADMIN_EMAILS list or a team role in
// services/outreach) and localhost. Everyone else gets a 404 from the APIs
// and never sees the homepage section. A page visit carries no sign-in
// token (it lives in the browser), so on the live site /dream is an empty
// noindex shell that fetches its panels from /api/dream with the admin's
// token; on localhost the server renders it directly. In no sitemap or
// llms.txt.

const express = require('express');
const BOARD = require('../data/dreamBoard');
const { escapeHtml: esc } = require('./blog');

const page = express.Router();
const api = express.Router();

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// Never in production: with 'trust proxy' on, req.hostname follows
// X-Forwarded-Host, which a visitor can set to "localhost". Render runs with
// NODE_ENV=production (render.yaml), so there only admins get in.
const isLocal = req => process.env.NODE_ENV !== 'production' && LOCAL_HOSTS.has(String(req.hostname || ''));

/** Admin account or localhost. Never throws. */
async function canSeeDream(req) {
  if (isLocal(req)) return true;
  const user = req.user;
  if (!user || !user.email) return false;
  try {
    if (require('../services/entitlements').isAdmin(user)) return true;
    return Boolean(await require('../services/outreach').roleFor(user.email));
  } catch { return false; }
}

/** Express middleware: 404 unless canSeeDream. */
function requireDream(req, res, next) {
  canSeeDream(req).then(ok => (ok ? next() : res.status(404).set('Cache-Control', 'no-store').json({ error: 'NOT_FOUND' })), next);
}

const fmtPrice = p => (p != null ? `$${Number(p).toLocaleString('en-CA')}` : '');
const TORONTO_DAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());

// "Jan 16 to 24, 2027", "Nov 12 to Jan 3", "Wed Nov 4" (next of a list of
// dates), "Year-round". Pure.
const MON = ymd => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' });
const DAY = ymd => Number(ymd.slice(8, 10));
function whenLabel(d) {
  const w = d.when;
  if (!w) return 'Year-round';
  if (w.dates) {
    const n = d.next_date || w.dates[0];
    return `Next: ${new Date(`${n}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  }
  const y = w.end.slice(0, 4);
  if (w.start === w.end) return `${MON(w.start)} ${DAY(w.start)}, ${y}`;
  if (w.start.slice(0, 7) === w.end.slice(0, 7)) return `${MON(w.start)} ${DAY(w.start)} to ${DAY(w.end)}, ${y}`;
  return `${MON(w.start)} ${DAY(w.start)} to ${MON(w.end)} ${DAY(w.end)}${w.start.slice(0, 4) === y ? `, ${y}` : ''}`;
}

async function homes() {
  try {
    const list = await require('../services/dreamHomes').listPublic();
    return list.map(h => ({
      id: `home-${h.id}`, kind: 'home', kicker: 'Real open house', emoji: '🏡',
      title: h.area, line: `${fmtPrice(h.price)} asking price`,
      taste: [h.note, (h.windows || []).length ? `Open house: ${h.windows.map(w => `${w.day}, ${String(w.label).replace(/^\S+\s/, '')}`).join(' · ')}.` : null].filter(Boolean).join(' '),
      when: null, venue: h.address, cost: 'Free to visit', status: 'listing',
      image: null, alt: `Drawing of a house in ${h.area}`,
      link: { label: 'Map it', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}` }
    }));
  } catch { return []; }
}

/** The showcase in order (data/dreamBoard.js visibleDreams: soonest first,
 *  year-round last), with real open houses right after the dream home. */
async function dreams(today = TORONTO_DAY()) {
  const list = BOARD.visibleDreams(today);
  const h = await homes();
  const i = list.findIndex(d => d.id === 'dream-home');
  if (h.length) list.splice(i >= 0 ? i + 1 : list.length, 0, ...h.slice(0, 3));
  return list.map(d => Object.assign(d, { when_label: whenLabel(d) }));
}

const HOUSE_SVG = '<svg viewBox="0 0 200 140" class="dr-house" aria-hidden="true"><path d="M30 70 L100 20 L170 70" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><rect x="48" y="66" width="104" height="60" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/><rect x="88" y="90" width="24" height="36" fill="currentColor"/><rect x="60" y="80" width="18" height="16" fill="currentColor" opacity=".7"/><rect x="122" y="80" width="18" height="16" fill="currentColor" opacity=".7"/></svg>';

function panel(d, i, n) {
  const visual = d.image
    ? `<img class="dr-bg" src="${esc(d.image)}" alt="${esc(d.alt)}" ${i ? 'loading="lazy" decoding="async"' : 'fetchpriority="high"'} width="1600" height="1000">`
    : d.kind === 'home'
      ? `<div class="dr-bg dr-poster" role="img" aria-label="${esc(d.alt)}">${HOUSE_SVG}</div>`
      : `<div class="dr-bg dr-poster" aria-hidden="true"><span class="dr-poster-word">${esc(d.kicker)}</span></div>`;
  const credit = d.credit
    ? `<p class="dr-credit">${esc(d.credit.place)}. Photo: <a href="${esc(d.credit.url)}" target="_blank" rel="noopener">${esc(d.credit.author)}</a>, ${esc(d.credit.licence)}</p>`
    : (d.kind === 'home'
      ? '<p class="dr-credit">A drawing, not a photo of this home. Open house times and prices change. Verify with the listing agent before you go. DayHop is not a real estate brokerage and does not sell homes.</p>'
      : '');
  const status = BOARD.STATUS_LABEL[d.status] || '';
  return `<section class="dr-panel" id="${esc(d.id)}" aria-label="${esc(`${i + 1} of ${n}: ${d.title}`)}">
  ${visual}
  <div class="dr-shade"></div>
  <div class="dr-copy">
    <p class="dr-kicker">${esc(d.kicker)}</p>
    <h2 class="dr-title">${esc(d.title)}</h2>
    <p class="dr-line">${esc(d.line)}</p>
    <div class="dr-ticket" aria-label="When and where">
      <div class="dr-stub"><span class="dr-stub-when">${esc(d.when_label || whenLabel(d))}</span></div>
      <dl class="dr-facts">
        <div><dt>Where</dt><dd>${esc(d.venue || '')}</dd></div>
        <div><dt>Cost</dt><dd>${esc(d.cost || '')}</dd></div>
        ${status ? `<div><dt>Dates</dt><dd><span class="dr-status dr-status--${esc(d.status)}">${esc(status)}</span></dd></div>` : ''}
      </dl>
    </div>
    ${d.taste ? `<p class="dr-taste"><b>Get a taste.</b> ${esc(d.taste)}</p>` : ''}
    <div class="dr-actions">
      ${d.link ? `<a class="dr-btn dr-btn--go" href="${esc(d.link.url)}" target="_blank" rel="noopener">Taste it: ${esc(d.link.label)}</a>` : ''}
      <button type="button" class="dr-btn dr-btn--share" data-share="${esc(d.id)}">Share this dream</button>
    </div>
    ${credit}
  </div>
</section>`;
}

function endPanel(n) {
  return `<section class="dr-panel dr-end" id="dream-end" aria-label="End of the showcase">
  <div class="dr-copy dr-end-copy">
    <p class="dr-kicker">${n} dreams, one winter</p>
    <h2 class="dr-title">Pick one and make it a day.</h2>
    <p class="dr-line">Every dream here has a real way in this season. Tell DayHop which one and it plans the day around it, weather and all.</p>
    <div class="dr-actions">
      <a class="dr-btn dr-btn--go" href="/?utm_source=dream&amp;utm_medium=end">Plan a day around a dream</a>
      <button type="button" class="dr-btn dr-btn--share" data-share="dream-end">Share the whole showcase</button>
      <a class="dr-btn dr-btn--ghost" href="#top">Back to the first dream</a>
    </div>
  </div>
</section>`;
}

const panelsHtml = list => `${list.map((d, i) => panel(d, i, list.length)).join('\n')}\n${endPanel(list.length)}`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Instrument+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap';

function scrollHtml(list, { shell = false } = {}) {
  const data = JSON.stringify(list.map(d => ({ id: d.id, title: d.title, kicker: d.kicker, line: d.line, image: d.image })).concat([{ id: 'dream-end', title: "Toronto's winter showcase", kicker: 'Dream big', line: `${list.length} dreams with a real way in this winter.`, image: list.find(d => d.image) ? list.find(d => d.image).image : null }])).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Dream big | DayHop (admin preview)</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0D1726">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/css/share-sheet.css">
<style>
/* A night at the winter shows: midnight ground, frost type, brass for the
   ticket. One full-screen dream at a time, a ticket stub with the real
   dates, the photo as the poster. Single dark look on purpose. */
:root{
  --night:#0D1726; --night-2:#16253C; --frost:#EEF3F8; --mist:#AEBDCC; --brass:#D9A441; --brass-ink:#2A1E05; --ice:#9CCBEA;
  --display:'Big Shoulders Display','Arial Narrow',Impact,sans-serif;
  --body:'Instrument Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;
  /* share sheet tokens */
  --ink:#102A2E; --ink-soft:#2C4A4E; --paper:#FBF7EE; --paper-dim:#F2ECDC; --coral-dark:#C43F22; --marigold:#FFB627; --shadow-lg:0 20px 48px rgba(0,0,0,.35);
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--night);color:var(--frost);font-family:var(--body)}
a{color:inherit}
:focus-visible{outline:3px solid var(--brass);outline-offset:3px}
.dr-top{position:fixed;z-index:10;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:max(12px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 12px max(16px,env(safe-area-inset-left));
  background:linear-gradient(rgba(13,23,38,.85),rgba(13,23,38,0))}
.dr-home{display:inline-flex;align-items:center;gap:10px;min-height:44px;text-decoration:none;font-weight:600}
.dr-badge{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--brass-ink);background:var(--brass);padding:4px 9px;border-radius:4px}
.dr-count{font-family:var(--mono);font-size:13px;color:var(--mist);font-variant-numeric:tabular-nums}
.dr-count b{color:var(--frost);font-weight:500}
.dr-rail{position:fixed;z-index:10;right:max(10px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px}
.dr-rail a{display:block;width:6px;height:18px;border-radius:3px;background:rgba(238,243,248,.25)}
.dr-rail a[aria-current="true"]{background:var(--brass);height:30px}
.dr-scroll{height:100vh;height:100dvh;overflow-y:auto;scroll-snap-type:y mandatory;scroll-behavior:smooth;scrollbar-width:none}
.dr-scroll::-webkit-scrollbar{display:none}
.dr-panel{position:relative;height:100vh;height:100dvh;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;display:flex;align-items:flex-end}
.dr-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dr-poster{display:grid;place-items:center;overflow:hidden;color:var(--ice);
  background:radial-gradient(90% 70% at 70% 30%,rgba(156,203,234,.22),rgba(13,23,38,0) 60%),linear-gradient(160deg,var(--night-2),var(--night))}
.dr-poster-word{font-family:var(--display);font-weight:800;text-transform:uppercase;line-height:.82;font-size:min(34vw,320px);letter-spacing:-.01em;
  color:transparent;-webkit-text-stroke:1.5px rgba(156,203,234,.35);text-align:center;transform:rotate(-6deg) translateY(-12vh);max-width:120vw;text-wrap:balance}
.dr-house{width:min(56vw,300px);height:auto;margin-bottom:24vh}
.dr-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,23,38,.15) 0%,rgba(13,23,38,0) 30%,rgba(13,23,38,.62) 58%,rgba(13,23,38,.96) 100%)}
.dr-copy{position:relative;width:100%;max-width:660px;display:flex;flex-direction:column;gap:12px;
  padding-block:0 max(28px,env(safe-area-inset-bottom));padding-left:max(20px,env(safe-area-inset-left));padding-right:max(28px,env(safe-area-inset-right))}
.dr-kicker{margin:0;font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--brass)}
.dr-title{margin:0;font-family:var(--display);font-weight:800;text-transform:uppercase;font-size:clamp(40px,9vw,78px);line-height:.92;letter-spacing:.005em;text-wrap:balance}
.dr-line{margin:0;font-size:17px;line-height:1.45;color:#DCE5EE;max-width:52ch}
.dr-ticket{display:flex;align-items:stretch;max-width:560px;background:rgba(238,243,248,.08);border:1px solid rgba(238,243,248,.18);border-radius:10px;overflow:hidden;
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.dr-stub{position:relative;flex:0 0 auto;display:grid;place-items:center;padding:12px 16px;background:var(--brass);color:var(--brass-ink);min-width:132px}
.dr-stub::after{content:'';position:absolute;top:6px;bottom:6px;right:-1px;border-right:2px dashed rgba(13,23,38,.55)}
.dr-stub-when{font-family:var(--mono);font-weight:500;font-size:13px;line-height:1.25;text-align:center;white-space:nowrap}
.dr-facts{margin:0;padding:10px 14px;display:grid;grid-template-columns:repeat(3,minmax(0,auto));gap:4px 18px;align-content:center}
.dr-facts div{min-width:0}
.dr-facts dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mist)}
.dr-facts dd{margin:2px 0 0;font-size:14px;font-weight:600}
.dr-status{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor}
.dr-status--official,.dr-status--press{color:#9FE3C1}
.dr-status--listing{color:var(--ice)}
.dr-taste{margin:0;font-size:15px;line-height:1.55;color:#CFD9E3;max-width:58ch}
.dr-taste b{color:var(--frost)}
.dr-actions{display:flex;flex-wrap:wrap;gap:10px}
.dr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:10px;font:inherit;font-weight:600;font-size:15px;text-decoration:none;cursor:pointer;border:0}
.dr-btn--go{background:var(--brass);color:var(--brass-ink)}
.dr-btn--share{background:rgba(238,243,248,.12);color:var(--frost);border:1.5px solid rgba(238,243,248,.55)}
.dr-btn--ghost{background:none;color:var(--mist);text-decoration:underline;padding:0 6px}
.dr-credit{margin:0;font-size:11.5px;color:#8FA1B4}
.dr-end{background:radial-gradient(70% 60% at 80% 20%,rgba(217,164,65,.20),rgba(13,23,38,0) 60%),linear-gradient(170deg,var(--night-2),var(--night))}
.dr-end-copy{padding-block:0 max(18vh,env(safe-area-inset-bottom))}
.dr-empty{display:grid;place-items:center;height:100%;margin:0;color:var(--mist)}
@media (max-width:560px){
  .dr-facts{grid-template-columns:1fr 1fr}
  .dr-stub{min-width:104px;padding:10px 12px}
  .dr-stub-when{white-space:normal;max-width:12ch}
  .dr-line{font-size:16px}
  .dr-rail{display:none}
}
@media (min-width:900px){.dr-copy{margin-left:6vw;padding-bottom:64px}}
@media (prefers-reduced-motion:reduce){.dr-scroll{scroll-behavior:auto}}
</style>
</head>
<body>
<header class="dr-top"><a class="dr-home" href="/">← DayHop <span class="dr-badge">Dream big · admin preview</span></a><span class="dr-count" id="dr-count" aria-live="polite"></span></header>
<nav class="dr-rail" id="dr-rail" aria-label="Dreams"></nav>
<main class="dr-scroll" id="dr-scroll" tabindex="-1">
<span id="top"></span>
${shell ? '<p class="dr-empty" id="dr-empty">Loading…</p>' : panelsHtml(list)}
</main>
<script src="/share-sheet.js" defer></script>
<script>
(function () {
  var DREAMS = ${data};
  var main = document.getElementById('dr-scroll');
  var count = document.getElementById('dr-count');
  var rail = document.getElementById('dr-rail');
  function panels() { return Array.prototype.slice.call(main.querySelectorAll('.dr-panel')); }
  function current() { var h = main.clientHeight || 1; return Math.round(main.scrollTop / h); }
  function paint() {
    var ps = panels(), i = current(), last = ps.length - 1;
    var n = ps.filter(function (p) { return p.id !== 'dream-end'; }).length;
    count.innerHTML = i >= last ? 'The end' : '<b>' + String(i + 1).padStart(2, '0') + '</b> / ' + String(n).padStart(2, '0');
    Array.prototype.forEach.call(rail.children, function (a, k) { a.setAttribute('aria-current', k === i ? 'true' : 'false'); });
  }
  function build() {
    rail.innerHTML = '';
    panels().forEach(function (p, k) {
      var a = document.createElement('a'); a.href = '#' + p.id; a.setAttribute('aria-label', p.getAttribute('aria-label') || ('Dream ' + (k + 1)));
      rail.appendChild(a);
    });
    paint();
  }
  function go(d) { var ps = panels(); var i = Math.max(0, Math.min(ps.length - 1, current() + d)); ps[i].scrollIntoView({ block: 'start' }); }
  main.addEventListener('scroll', function () { window.requestAnimationFrame(paint); }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, .share-sheet')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') { e.preventDefault(); go(-1); }
  });
  document.addEventListener('click', function (e) {
    var top = e.target.closest('a[href="#top"]');
    if (top) { e.preventDefault(); main.scrollTo({ top: 0 }); return; }
    var b = e.target.closest('[data-share]');
    if (!b || !window.DayHopShare) return;
    var d = DREAMS.filter(function (x) { return x.id === b.getAttribute('data-share'); })[0];
    if (!d) return;
    var url = location.origin + '/dream' + (d.id === 'dream-end' ? '' : '#' + d.id);
    window.DayHopShare.open({ title: d.title, kicker: d.kicker, text: d.title + '. ' + d.line + ' Dream big with me?', thumb: d.image, url: url, campaign: 'dream' });
  });
  function jump() { if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); } }
  ${shell ? `// Live site: the panels come from /api/dream with the signed-in
  // admin's token (supabase-js keeps the session in localStorage).
  var token = null;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k)); token = v && (v.access_token || (v.currentSession && v.currentSession.access_token)); }
    }
  } catch (e) { token = null; }
  fetch('/api/dream?view=html', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) { document.getElementById('dr-empty').textContent = 'Not found.'; return; }
      DREAMS = d.share; main.innerHTML = '<span id="top"></span>' + d.html; build(); jump();
    })
    .catch(function () { document.getElementById('dr-empty').textContent = 'Not found.'; });` : 'build(); jump();'}
})();
</script>
</body>
</html>`;
}

const slim = d => ({ id: d.id, kind: d.kind || 'vision', kicker: d.kicker, emoji: d.emoji, title: d.title, line: d.line, image: d.image, alt: d.alt, when_label: d.when_label, cost: d.cost });
const shareData = list => list.map(d => ({ id: d.id, title: d.title, kicker: d.kicker, line: d.line, image: d.image }))
  .concat([{ id: 'dream-end', title: "Toronto's winter showcase", kicker: 'Dream big', line: `${list.length} dreams with a real way in this winter.`, image: (list.find(d => d.image) || {}).image || null }]);

// Localhost: rendered here. Live site: a shell (no dreams in it) that loads
// its panels from /api/dream with the admin's token, so a page visit never
// needs to carry a session.
page.get('/dream', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (isLocal(req)) return res.send(scrollHtml(await dreams()));
    res.send(scrollHtml([], { shell: true }));
  } catch (err) { next(err); }
});

api.get('/', requireDream, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const list = await dreams();
    const out = { dreams: list.map(slim) };
    if (req.query.view === 'html') { out.html = panelsHtml(list); out.share = shareData(list); }
    res.json(out);
  } catch (err) { next(err); }
});

module.exports = { page, api, requireDream, canSeeDream, isLocal, dreams, scrollHtml, whenLabel, panelsHtml };

