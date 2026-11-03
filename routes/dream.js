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

async function homes() {
  try {
    const list = await require('../services/dreamHomes').listPublic();
    return list.map(h => ({
      id: `home-${h.id}`, kind: 'home', kicker: 'Real open house', emoji: '🏡',
      title: h.area, line: `${fmtPrice(h.price)} asking price`,
      taste: [h.note, (h.windows || []).length ? `Open house: ${h.windows.map(w => `${w.day}, ${String(w.label).replace(/^\S+\s/, '')}`).join(' · ')}.` : null].filter(Boolean).join(' '),
      image: null, alt: `Drawing of a house in ${h.area}`,
      link: { label: 'Map it', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}` }
    }));
  } catch { return []; }
}

/** The scroll order: the first vision card, then homes, then the rest. */
async function dreams() {
  const h = await homes();
  return [BOARD[0], ...h.slice(0, 4), ...BOARD.slice(1)];
}

const HOUSE_SVG = '<svg viewBox="0 0 200 140" class="dr-house" aria-hidden="true"><path d="M30 70 L100 20 L170 70" fill="none" stroke="#FBF7EE" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><rect x="48" y="66" width="104" height="60" fill="none" stroke="#FBF7EE" stroke-width="6" stroke-linejoin="round"/><rect x="88" y="90" width="24" height="36" fill="#FBF7EE"/><rect x="60" y="80" width="18" height="16" fill="#FBF7EE" opacity=".7"/><rect x="122" y="80" width="18" height="16" fill="#FBF7EE" opacity=".7"/></svg>';

function panel(d, i) {
  const bg = d.image
    ? `<img class="dr-bg" src="${esc(d.image)}" alt="${esc(d.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="1600" height="1000">`
    : `<div class="dr-bg dr-bg--drawing" role="img" aria-label="${esc(d.alt)}">${HOUSE_SVG}</div>`;
  const credit = d.credit
    ? `<p class="dr-credit">${esc(d.credit.place)}. Photo: <a href="${esc(d.credit.url)}" target="_blank" rel="noopener">${esc(d.credit.author)}</a>, ${esc(d.credit.licence)}</p>`
    : (d.kind === 'home'
      ? '<p class="dr-credit">A drawing, not a photo of this home. Open house times and prices change. Verify with the listing agent before you go. DayHop is not a real estate brokerage and does not sell homes.</p>'
      : '');
  return `<section class="dr-panel" id="${esc(d.id)}" aria-label="${esc(d.title)}">
  ${bg}
  <div class="dr-shade"></div>
  <div class="dr-copy">
    <p class="dr-kicker"><span aria-hidden="true">${d.emoji || '✨'}</span> ${esc(d.kicker)}</p>
    <h2 class="dr-title">${esc(d.title)}</h2>
    <p class="dr-line">${esc(d.line)}</p>
    ${d.taste ? `<p class="dr-taste"><b>Get a taste:</b> ${esc(d.taste)}</p>` : ''}
    <div class="dr-actions">
      <button type="button" class="dr-btn dr-btn--share" data-share="${esc(d.id)}">↗ Share this dream</button>
      ${d.link ? `<a class="dr-btn dr-btn--go" href="${esc(d.link.url)}" target="_blank" rel="noopener">${esc(d.link.label)} →</a>` : ''}
    </div>
    ${credit}
  </div>
</section>`;
}

function scrollHtml(list, { shell = false } = {}) {
  const data = JSON.stringify(list.map(d => ({ id: d.id, title: d.title, kicker: d.kicker, line: d.line, image: d.image }))).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Dream big | DayHop (admin preview)</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#102A2E">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/share-sheet.css">
<style>
:root{--ink:#102A2E;--ink-soft:#2C4A4E;--paper:#FBF7EE;--paper-dim:#F2ECDC;--coral-btn:#E1502F;--coral-dark:#C43F22;--marigold:#FFB627;--line:rgba(16,42,46,.14);--shadow-lg:0 20px 48px rgba(16,42,46,.22)}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--ink);color:#fff;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.dr-top{position:fixed;z-index:10;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:max(12px,env(safe-area-inset-top)) 16px 12px;background:linear-gradient(rgba(16,42,46,.7),rgba(16,42,46,0))}
.dr-top a{color:#fff;text-decoration:none;font-weight:800;font-size:17px;min-height:44px;display:inline-flex;align-items:center}
.dr-beta{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:var(--marigold);color:var(--ink);padding:4px 9px;border-radius:999px;margin-left:8px}
.dr-scroll{height:100vh;height:100dvh;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none}
.dr-scroll::-webkit-scrollbar{display:none}
.dr-panel{position:relative;height:100vh;height:100dvh;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;display:flex;align-items:flex-end}
.dr-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dr-bg--drawing{display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#3F6F5C,#102A2E 75%)}
.dr-house{width:min(60vw,320px);height:auto;margin-bottom:22vh}
.dr-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,42,46,0) 35%,rgba(16,42,46,.55) 60%,rgba(16,42,46,.92) 100%)}
.dr-copy{position:relative;width:100%;max-width:640px;padding:0 20px max(28px,env(safe-area-inset-bottom))}
.dr-kicker{margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--marigold)}
.dr-title{margin:0 0 6px;font-size:clamp(30px,7vw,48px);line-height:1.08;letter-spacing:-.01em}
.dr-line{margin:0 0 12px;font-size:17px;line-height:1.45;color:#E7EEEA}
.dr-taste{margin:0 0 16px;font-size:15px;line-height:1.5;color:#D3DDD8}
.dr-taste b{color:#fff}
.dr-actions{display:flex;flex-wrap:wrap;gap:10px}
.dr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:12px;font:inherit;font-weight:800;font-size:15px;text-decoration:none;cursor:pointer;border:0}
.dr-btn--share{background:var(--marigold);color:var(--ink)}
.dr-btn--go{background:rgba(255,255,255,.14);color:#fff;border:1.5px solid rgba(255,255,255,.5)}
.dr-credit{margin:12px 0 0;font-size:11.5px;color:#A9BAB4}
.dr-credit a{color:inherit}
.dr-empty{display:grid;place-items:center;height:100%;margin:0;color:#A9BAB4}
.dr-hint{position:fixed;z-index:10;right:16px;bottom:max(18px,env(safe-area-inset-bottom));font-size:12px;color:#A9BAB4}
@media (min-width:900px){.dr-copy{margin-left:6vw;padding-bottom:56px}}
</style>
</head>
<body>
<header class="dr-top"><a href="/">← DayHop<span class="dr-beta">Dream big · admin preview</span></a></header>
<main class="dr-scroll" id="dr-scroll">
${shell ? '<p class="dr-empty" id="dr-empty">Loading…</p>' : list.map(panel).join('\n')}
</main>
<script src="/share-sheet.js" defer></script>
<script>
(function () {
  var DREAMS = ${data};
  var main = document.getElementById('dr-scroll');
  function jump() { if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); } }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share]');
    if (!b || !window.DayHopShare) return;
    var d = DREAMS.filter(function (x) { return x.id === b.getAttribute('data-share'); })[0];
    if (!d) return;
    window.DayHopShare.open({ title: d.title, kicker: d.kicker, text: d.title + '. ' + d.line + ' Dream big with me?', thumb: d.image, url: location.origin + '/dream#' + d.id, campaign: 'dream' });
  });
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
      DREAMS = d.dreams; main.innerHTML = d.html; jump();
    })
    .catch(function () { document.getElementById('dr-empty').textContent = 'Not found.'; });` : 'jump();'}
})();
</script>
</body>
</html>`;
}

const slim = d => ({ id: d.id, kind: d.kind || 'vision', kicker: d.kicker, emoji: d.emoji, title: d.title, line: d.line, image: d.image, alt: d.alt });

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
    if (req.query.view === 'html') out.html = list.map(panel).join('\n');
    res.json(out);
  } catch (err) { next(err); }
});

module.exports = { page, api, requireDream, canSeeDream, isLocal, dreams, scrollHtml };

