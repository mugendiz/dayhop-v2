// routes/playbook.js — DayHop V2
// "The GTA Family Weekend Playbook" — the lead magnet. One server-rendered
// page generated live from the curated catalog + auto-discovered verified
// finds, so it improves every week without anyone touching it.
//
// Access model: /playbook?t=<subscriber token> renders the full guide for a
// CONFIRMED subscriber (the same per-subscriber secret used in confirm/
// unsubscribe links — delivered by the welcome email). Without a valid token
// it renders a teaser: three sample picks + the subscribe form. That keeps
// the exchange honest — the product is the reward for confirmed consent —
// without building any auth.

const express = require('express');
const router = express.Router();
const curated = require('../data/curatedCatalog');
const newsletter = require('../services/newsletter');
const analytics = require('../services/analytics');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Auto-catalog entries ride along when available; failures never block the
// page (the curated list alone is the product).
function autoEntries() {
  try {
    const rows = require('../services/autoCatalog').entries() || [];
    return rows
      .filter(r => (r.status || 'active') === 'active')
      .map(r => r.entry || r)
      .filter(e => e && e.title && e.description);
  } catch (e) {
    return [];
  }
}

// Friendly section labels + display order. Small categories fold into
// neighbours so no section renders with one lonely card.
const SECTIONS = [
  { key: 'kids', label: 'Made for kids', blurb: 'Where little legs and short attention spans win.' },
  { key: 'adventures', label: 'Big adventures', blurb: 'The days they’ll still be talking about in December.' },
  { key: 'water', label: 'Water days', blurb: 'Beaches, splash pads, paddles, and cruises.' },
  { key: 'culture', label: 'Culture & wow', blurb: 'Immersive, beautiful, and genuinely kid-tolerant.' },
  { key: 'food', label: 'Food worth the trip', blurb: 'Markets, patios, and places where eating IS the outing.' },
  { key: 'general', label: 'Local gems', blurb: 'The quiet finds locals keep to themselves.' }
];
const CATEGORY_FOLD = { cruises: 'water', patios: 'food' };

function isRainProof(e) {
  return (e.tags || []).some(t => t === 'indoor' || t === 'rainy');
}
function isNew(e) {
  if (!e.opened_at) return false;
  const ageDays = (Date.now() - new Date(e.opened_at).getTime()) / 86400000;
  return ageDays > 0 && ageDays < 425;
}

function allEntries() {
  const seen = new Set();
  const all = [];
  for (const e of [...curated, ...autoEntries()]) {
    const key = String(e.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(e);
  }
  return all;
}

function chips(e) {
  const bits = [];
  if (e.cost_tier) bits.push(`<span class="chip${e.cost_tier === 'free' ? ' chip-free' : ''}">${esc(e.cost_tier)}</span>`);
  if (e.good_for_ages) bits.push(`<span class="chip">ages ${esc(e.good_for_ages)}</span>`);
  if (isRainProof(e)) bits.push('<span class="chip chip-rain">☔ rain-proof</span>');
  if (isNew(e)) bits.push('<span class="chip chip-new">NEW</span>');
  return bits.join('');
}

function card(e) {
  const link = e.booking_url || e.maps_url;
  const where = e.venue || e.location || '';
  return `
<article class="pick">
  <h3>${link ? `<a href="${esc(link)}">${esc(e.title)}</a>` : esc(e.title)}</h3>
  ${where ? `<p class="where">${esc(where)}</p>` : ''}
  <p class="desc">${esc(e.description)}</p>
  <p class="meta">${chips(e)}
    ${e.maps_url ? `<a class="minor" href="${esc(e.maps_url)}">map</a>` : ''}
    ${e.booking_url ? `<a class="minor" href="${esc(e.booking_url)}">tickets</a>` : ''}
  </p>
</article>`;
}

const STYLES = `
:root{--ink:#102A2E;--ink-soft:#2C4A4E;--paper:#FBF7EE;--paper-dim:#F2ECDC;--coral:#FF6B4A;--coral-dark:#E1502F;--moss:#3F6F5C;--line:rgba(16,42,46,0.14)}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:0 20px 60px}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.logo{font-weight:700;font-size:21px;color:var(--ink);text-decoration:none}
.cta{font-weight:700;font-size:14px;color:#fff;background:var(--coral);text-decoration:none;padding:9px 16px;border-radius:8px}
.cta:hover{background:var(--coral-dark)}
.eyebrow{font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:var(--moss);font-weight:600}
h1{font-size:clamp(30px,5vw,42px);line-height:1.15;margin:8px 0 10px;letter-spacing:-0.02em}
.sub{color:var(--ink-soft);font-size:17px;max-width:600px}
h2{font-size:23px;margin:44px 0 2px;letter-spacing:-0.01em}
.section-blurb{color:var(--ink-soft);margin:0 0 16px;font-size:14.5px}
.pick{background:#fff;border:1px solid var(--line);border-radius:0 14px 14px 0;padding:16px 20px;margin:0 0 12px;box-shadow:0 2px 8px rgba(16,42,46,0.05);break-inside:avoid}
.pick h3{margin:0 0 2px;font-size:17.5px;line-height:1.3}
.pick h3 a{color:var(--ink);text-decoration:none}
.pick h3 a:hover{color:var(--coral-dark)}
.where{margin:0 0 6px;font-size:12.5px;color:var(--ink-soft)}
.desc{margin:0 0 8px;font-size:14.5px;color:var(--ink-soft)}
.meta{margin:0;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px}
.chip{background:var(--paper-dim);border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:11.5px}
.chip-free{background:#E7F3ED;border-color:#bcdccc;color:#12855C;font-weight:600}
.chip-rain{background:#EAF2F8;border-color:#c4d9e8}
.chip-new{background:#FFF0EB;border-color:#f2cabb;color:var(--coral-dark);font-weight:700}
.minor{color:var(--coral-dark);font-weight:600;text-decoration:none}
.print-btn{font:inherit;font-weight:700;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:8px;padding:9px 16px;cursor:pointer}
.gate{background:#fff;border:1px solid var(--line);border-radius:0 18px 18px 0;box-shadow:0 4px 14px rgba(16,42,46,0.08);padding:26px 28px;margin:26px 0}
.gate strong{font-size:19px;display:block;margin-bottom:4px}
.gate p{color:var(--ink-soft);font-size:14.5px;margin:0 0 14px}
.gate form{display:flex;gap:8px;flex-wrap:wrap}
.gate input{flex:1;min-width:200px;font:inherit;font-size:14px;border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:var(--paper)}
.gate button{font:inherit;font-weight:700;font-size:14px;color:#fff;background:var(--coral);border:0;border-radius:9px;padding:10px 18px;cursor:pointer}
.gate button:hover{background:var(--coral-dark)}
.gate-msg{font-size:13px;margin:8px 0 0;min-height:1em}
.fineprint{font-size:11.5px;color:var(--ink-soft);opacity:.8;margin:10px 0 0}
footer{border-top:1px solid var(--line);margin-top:50px;padding-top:22px;font-size:13px;color:var(--ink-soft)}
@media print{.topbar .cta,.print-btn,.gate,footer nav{display:none}body{background:#fff}.pick{box-shadow:none}}
`;

function page({ title, description, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
<nav class="topbar"><a class="logo" href="/">DayHop</a><a class="cta" href="/">Plan my day →</a></nav>
${bodyHtml}
<footer>
<p>DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:admin@dayhop.quest">admin@dayhop.quest</a> — generated live from the same data that powers the planner, so it's never out of date.</p>
</footer>
</div>
</body>
</html>`;
}

const SUBSCRIBE_FORM = `
<div class="gate">
  <strong>Get the full Playbook — free</strong>
  <p>Subscribe to the weekend brief (one email, Thursday mornings) and the complete Playbook lands with your welcome email. No spam, ever. One-click unsubscribe.</p>
  <form id="gate-form">
    <input type="email" id="gate-email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">
    <button type="submit">Send me the Playbook</button>
  </form>
  <p class="gate-msg" id="gate-msg" role="status" aria-live="polite"></p>
  <p class="fineprint">By subscribing you agree to weekly emails from DayHop (Richmond Hill, ON, Canada — admin@dayhop.quest). Unsubscribe any time.</p>
</div>
<script>
(function(){var f=document.getElementById('gate-form');if(!f)return;var m=document.getElementById('gate-msg');
f.addEventListener('submit',function(e){e.preventDefault();var email=(document.getElementById('gate-email').value||'').trim();if(!email)return;
var b=f.querySelector('button');b.disabled=true;
fetch('/api/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,source:'playbook'})})
.then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.message||'Something went wrong.');return d;})})
.then(function(d){m.textContent='Check your inbox — confirm your email and the Playbook link arrives right after.';m.style.color='#12855C';f.hidden=true;})
.catch(function(err){m.textContent=err.message;b.disabled=false;});});})();
</script>`;

router.get('/', async (req, res) => {
  const token = String(req.query.t || '').trim();
  let subscriber = null;
  if (token) {
    const row = await newsletter.getByToken(token);
    if (row && row.status === 'subscribed') subscriber = row;
  }

  const entries = allEntries();
  res.setHeader('Cache-Control', 'no-store'); // token-personal, never shared caches

  if (!subscriber) {
    // Teaser: the three strongest wow picks, then the gate.
    const samples = entries.filter(e => e.wow).slice(0, 3);
    analytics.recordEvent({ type: 'playbook_view', ownerKey: `ip-${req.ip}`, source: 'teaser' });
    return res.send(page({
      title: 'The GTA Family Weekend Playbook — DayHop',
      description: `${entries.length} GTA outings actually worth your Saturday — curated, honest, and free with the DayHop weekend brief.`,
      bodyHtml: `
<header style="margin-top:10px">
  <span class="eyebrow">Free with the weekend brief</span>
  <h1>The GTA Family Weekend Playbook</h1>
  <p class="sub">${entries.length} outings actually worth your Saturday — hand-curated and verified, organized by age, budget, and rain-proofness. Here's a taste:</p>
</header>
${samples.map(card).join('')}
<p class="sub" style="margin-top:18px">…plus ${entries.length - samples.length} more, including ${entries.filter(e => e.cost_tier === 'free').length} completely free outings and ${entries.filter(isRainProof).length} rain-proof saves.</p>
${SUBSCRIBE_FORM}`
    }));
  }

  // Full playbook for a confirmed subscriber. Unknown categories land in
  // "Local gems" so an auto-discovered entry can never vanish from the page.
  const bySection = new Map(SECTIONS.map(s => [s.key, []]));
  for (const e of entries) {
    const key = CATEGORY_FOLD[e.category] || e.category;
    (bySection.get(key) || bySection.get('general')).push(e);
  }
  const sectionsHtml = SECTIONS
    .filter(s => bySection.get(s.key).length)
    .map(s => `
<section>
  <h2>${esc(s.label)} <span class="eyebrow" style="font-weight:600">· ${bySection.get(s.key).length}</span></h2>
  <p class="section-blurb">${esc(s.blurb)}</p>
  ${bySection.get(s.key).map(card).join('')}
</section>`).join('');

  analytics.recordEvent({ type: 'playbook_view', ownerKey: subscriber.owner_id || 'anon', source: 'full' });
  res.send(page({
    title: 'The GTA Family Weekend Playbook — DayHop',
    description: `${entries.length} GTA outings actually worth your Saturday.`,
    bodyHtml: `
<header style="margin-top:10px">
  <span class="eyebrow">Yours — thanks for subscribing</span>
  <h1>The GTA Family Weekend Playbook</h1>
  <p class="sub">${entries.length} outings actually worth your Saturday: ${entries.filter(e => e.cost_tier === 'free').length} free, ${entries.filter(isRainProof).length} rain-proof, all verified. This page regenerates from live data — bookmark it, it only gets better.</p>
  <p style="margin:14px 0 0"><button class="print-btn" onclick="window.print()">🖨 Save as PDF</button></p>
</header>
${sectionsHtml}
<div class="gate" style="margin-top:40px">
  <strong>Turn any of these into a full day</strong>
  <p>Tell the planner what kind of day you want, in one sentence — it builds the whole thing with real venues, timing, and live weather.</p>
  <a class="cta" href="/">Plan my day →</a>
</div>`
  }));
});

module.exports = router;
