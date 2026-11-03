// routes/issues.js — DayHop V2
// The public web copy of every newsletter issue, so a forwarded or shared
// link opens a real page (and unfurls in WhatsApp, iMessage and Facebook):
//
//   GET /weekend                  → the latest weekend brief
//   GET /weekend/:date            → that issue (YYYY-MM-DD, the send date)
//   GET /talk-of-the-town         → the latest Talk of the town
//   GET /talk-of-the-town/:date   → that issue
//
// Each page is the issue exactly as sent (services/issueStore.js snapshot,
// saved before the first email goes out), in the blog's page shell (pixel.js
// for first-touch utm attribution, the site footer), with a subscribe box at
// the top so a forwarded reader can join: source 'issue_share'.

const express = require('express');
const router = express.Router();
const issueStore = require('../services/issueStore');
const kit = require('../services/emailKit');
const digest = require('../services/digest');
const tott = require('../services/tottDigest');
const { page, origin, recordView } = require('./blog');

const KIND_BY_PATH = { weekend: 'weekend', 'talk-of-the-town': 'tott' };
const { isDate } = issueStore;

function fmtLong(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function subscribeBox(kind) {
  const when = kind === 'tott' ? 'every Monday' : 'every Thursday';
  return `
<section id="issue-subscribe" style="background:#102A2E;color:#ffffff;border-radius:14px;padding:18px 18px 16px;margin:8px 0 22px;">
  <p style="margin:0 0 4px;font-size:18px;font-weight:800;">Get this ${when} 📬</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#d9e3df;">The best family plans around the GTA, picked for the week ahead. Free, one click to leave.</p>
  <form id="issue-sub-form" style="display:flex;gap:8px;flex-wrap:wrap;" novalidate>
    <input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address" style="flex:1;min-width:200px;padding:11px 12px;border-radius:10px;border:0;font-size:16px;">
    <button type="submit" style="background:#E1502F;color:#ffffff;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:15px;cursor:pointer;">Sign me up</button>
  </form>
  <p id="issue-sub-msg" role="status" aria-live="polite" style="margin:8px 0 0;font-size:13.5px;color:#FFB627;"></p>
</section>`;
}

// Subscribe (with first-touch attribution from pixel.js) and copy-link.
const PAGE_SCRIPT = `
<script>
(function () {
  var f = document.getElementById('issue-sub-form');
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = f.querySelector('input'), btn = f.querySelector('button'), msg = document.getElementById('issue-sub-msg');
    var email = (input.value || '').trim();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { msg.textContent = 'That email does not look right.'; input.focus(); return; }
    btn.disabled = true;
    fetch('/api/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'issue_share', attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { msg.textContent = d.message || 'Check your inbox to confirm. Then you are in.'; input.value = ''; })
      .catch(function () { msg.textContent = 'Could not sign you up just now. Please try again.'; })
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

// Talk of the town before any issue has been sent: this week's live picks
// from the weekly store (services/talkOfTown.js), so the homepage carousel
// and shared links always land on something. Hooks are the picks' own first
// sentences (no Grok call on a page view). Null when the shelf is empty.
function liveTottSnapshot() {
  const talkOfTown = require('../services/talkOfTown');
  const raw = talkOfTown.active({ point: { lat: 43.6532, lng: -79.3832 }, limit: talkOfTown.SHELF_SIZE });
  if (!raw.length) return null;
  const { applyEnrichment, firstSentence } = require('../services/issueEnrich');
  const picks = applyEnrichment(raw, { hooks: raw.map(p => firstSentence(p.description || p.title)), standout: 0 });
  return { kind: 'tott', picks, hubName: 'Toronto', subject: `Talk of the town: ${picks[0].title}` };
}

async function renderIssue(req, res, pathKey, date, liveSnap = null) {
  const kind = KIND_BY_PATH[pathKey];
  const snap = liveSnap || (isDate(date) ? await issueStore.getIssue(kind, date).catch(() => null) : null);
  if (liveSnap) date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  if (!snap) {
    res.status(404).send(page({
      req, title: 'Issue not found | DayHop', description: 'That newsletter issue is not here.',
      canonicalPath: `/${pathKey}`, ogType: 'website',
      bodyHtml: `<h1>We could not find that issue.</h1><p><a href="/${pathKey}">See the latest one</a> or <a href="/">plan your own day</a>.</p>`
    }));
    return;
  }
  recordView(req, `issue_${kind}`, liveSnap ? 'live' : date);
  const base = origin(req);
  const canonicalPath = liveSnap ? `/${pathKey}` : `/${pathKey}/${date}`;
  const webUrl = `${base}${canonicalPath}`;
  const lead = snap.picks[0] || {};
  const leadPhoto = kit.photoFor(lead, base);
  const ogImage = leadPhoto ? leadPhoto.src : `${base}/img/email/${kind === 'tott' ? 'masthead-tott.png' : 'masthead-weekend.png'}`;
  const name = kind === 'tott' ? 'Talk of the town' : 'The weekend brief';
  const title = `${name}, ${fmtLong(date)} | DayHop`;
  const description = lead.title
    ? `If you only do one thing: ${String(lead.title).replace(/\s*[—–]\s*/g, ', ')}. ${snap.picks.length} hand-picked family plans around the GTA.`
    : `${snap.picks.length} hand-picked family plans around the GTA.`;
  const body = (kind === 'tott' ? tott.digestBody : digest.digestBody)(snap, { base, web: true, webUrl });
  res.set('Cache-Control', 'public, max-age=600');
  res.send(page({
    req, title, description, canonicalPath, ogImage, ogType: 'article', subscribePanel: false,
    bodyHtml: `${subscribeBox(kind)}
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">${body}</div>
${PAGE_SCRIPT}`
  }));
}

async function latest(req, res, pathKey) {
  const date = await issueStore.latestDate(KIND_BY_PATH[pathKey]).catch(() => null);
  if (date) return res.redirect(302, `/${pathKey}/${date}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
  if (pathKey === 'talk-of-the-town') {
    const live = (() => { try { return liveTottSnapshot(); } catch { return null; } })();
    if (live) return renderIssue(req, res, pathKey, null, live);
  }
  return renderIssue(req, res, pathKey, null);
}

for (const pathKey of Object.keys(KIND_BY_PATH)) {
  router.get(`/${pathKey}`, (req, res, next) => latest(req, res, pathKey).catch(next));
  router.get(`/${pathKey}/:date`, (req, res, next) => renderIssue(req, res, pathKey, req.params.date).catch(next));
}

module.exports = { router };
