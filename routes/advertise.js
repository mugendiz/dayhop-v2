// routes/advertise.js — DayHop V2
// Venue-facing media kit: GET /advertise (the pitch + tiers) and
// POST /advertise/inquiry (lead capture). This is the sales surface for the
// sponsored-placement revenue motion — B2B flat-fee visibility, sold to GTA
// family venues. The page makes the trust contract explicit on purpose:
// labeled slots, relevance-gated, advisories apply to sponsors too — that
// honesty is the thing being sold.
//
// Inquiry handling is deliberately boring: record an analytics event and
// email the admin (fail-soft, like everything else). No sponsor tables or
// rendering slots exist yet — those get built after the first deal closes.

const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');
const { sendEmail } = require('../services/email');

const ADMIN_EMAIL = process.env.EMAIL_REPLY_TO || 'admin@dayhop.quest';

const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const STYLES = `
:root{--paper:#FBF7EE;--ink:#102A2E;--ink-soft:#2C4A4E;--coral:#FF6B4A;--coral-dark:#E5522F;--line:rgba(16,42,46,.14)}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6}
.wrap{max-width:860px;margin:0 auto;padding:28px 22px 60px}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:34px}
.logo{font-weight:700;font-size:20px;color:var(--ink);text-decoration:none}
.cta{background:var(--coral);color:#fff;text-decoration:none;font-weight:700;padding:9px 18px;border-radius:10px;font-size:14px}
h1{font-size:32px;line-height:1.2;margin:0 0 12px}
.lede{font-size:17px;color:var(--ink-soft);max-width:620px;margin:0 0 30px}
h2{font-size:21px;margin:38px 0 12px}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:18px 0}
.tier{background:#fff;border:1px solid var(--line);border-radius:0 16px 16px 0;padding:22px}
.tier h3{margin:0 0 2px;font-size:18px}
.tier .price{font-size:26px;font-weight:800;margin:0 0 12px}.tier .price span{font-size:14px;font-weight:500;color:var(--ink-soft)}
.tier ul{margin:0;padding-left:18px;font-size:14px;color:var(--ink-soft)}.tier li{margin-bottom:6px}
.tier.hot{border-color:var(--coral);box-shadow:0 4px 14px rgba(255,107,74,.15)}
.badge{display:inline-block;background:var(--coral);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px}
.founding{background:#fff;border:2px solid var(--coral);border-radius:0 16px 16px 0;padding:20px 24px;margin:22px 0}
.trust{background:rgba(16,42,46,.045);border-radius:0 14px 14px 0;padding:18px 22px;margin:20px 0;font-size:14.5px;color:var(--ink-soft)}
.trust strong{color:var(--ink)}
form{background:#fff;border:1px solid var(--line);border-radius:0 16px 16px 0;padding:24px;margin-top:16px;display:grid;gap:12px}
label{font-size:13px;font-weight:700}
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:9px;font-size:15px;font-family:inherit;background:var(--paper)}
textarea{min-height:90px;resize:vertical}
button{background:var(--coral);color:#fff;border:0;font-weight:700;font-size:16px;padding:13px;border-radius:10px;cursor:pointer}
button:hover{background:var(--coral-dark)}button:disabled{opacity:.6}
.msg{font-size:14px;min-height:1.2em;margin:0}
footer{border-top:1px solid var(--line);margin-top:50px;padding-top:22px;font-size:13px;color:var(--ink-soft)}
@media(max-width:520px){h1{font-size:26px}}
`;

function pageHtml() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Advertise on DayHop — reach GTA families while they plan their weekend</title>
<meta name="description" content="Sponsored placements put your venue in front of GTA families at the exact moment they decide what to do this weekend. Flat monthly pricing, honest labeling, real reporting.">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>${STYLES}</style>
<script src="/pixel.js" defer></script>
</head><body><div class="wrap">
<nav class="topbar"><a class="logo" href="/">DayHop</a><a class="cta" href="/">See the planner →</a></nav>

<h1>Be the answer to “what are we doing this weekend?”</h1>
<p class="lede">DayHop is where GTA families plan their days out — real venues, live weather,
honest closure advisories, and a Thursday-morning weekend brief. A sponsored placement puts
your venue in front of them at the exact moment they're deciding, not scrolling.</p>

<div class="trust"><strong>Why families trust what we show them (and why that's worth paying for):</strong>
sponsored placements are always labeled, only appear where they're genuinely relevant to the
family's plan, and our closure &amp; safety advisories apply to sponsors exactly like everyone
else. Your listing lives inside recommendations people actually believe.</div>

<h2>Placements</h2>
<div class="tiers">
  <div class="tier"><h3>Featured</h3><p class="price">$99<span>/mo</span></p>
    <ul><li>Priority ranking when relevant in discovery feeds</li>
    <li>“Partner” badge on your listing</li>
    <li>Monthly report: impressions, clicks, plans you appeared in</li></ul></div>
  <div class="tier hot"><span class="badge">Most popular</span><h3>Spotlight</h3><p class="price">$299<span>/mo</span></p>
    <ul><li>Everything in Featured</li>
    <li>Guaranteed slot in one Thursday weekend brief per month</li>
    <li>Photo-rich listing card</li>
    <li>One blog spotlight per quarter</li></ul></div>
  <div class="tier"><h3>Anchor</h3><p class="price">$499<span>/mo</span></p>
    <ul><li>Everything in Spotlight</li>
    <li>Hero featured-card rotation on the homepage</li>
    <li>Seasonal campaign inclusion (March Break, summer, holidays)</li>
    <li>First right of refusal on your category</li></ul></div>
</div>
<p style="font-size:13.5px;color:var(--ink-soft)">Annual prepay: 2 months free. Inventory is
deliberately capped — one sponsored slot per plan, one per weekend brief — so placements stay
scarce and effective.</p>

<div class="founding"><strong>🎉 Founding partner offer — first 5 venues:</strong> Spotlight for
<strong>$99/mo</strong> with code <strong>FOUNDING</strong> at checkout, locked in until your monthly
report shows 500+ families seeing your venue — then list price with 30 days' notice, or cancel.
We're early and you're paying for the audience you actually get. In exchange: honest feedback and
permission to share your results. Month-to-month, cancel anytime.</div>

<h2>Tell us about your venue</h2>
<form id="inq-form">
  <div><label for="inq-venue">Venue / organization</label><input id="inq-venue" required maxlength="120" placeholder="e.g. Sunny Acres Farm, Markham"></div>
  <div><label for="inq-name">Your name</label><input id="inq-name" required maxlength="80"></div>
  <div><label for="inq-email">Email</label><input id="inq-email" type="email" required maxlength="120" placeholder="you@yourvenue.ca"></div>
  <div><label for="inq-tier">Interested in</label><select id="inq-tier">
    <option>Featured ($99/mo)</option><option selected>Spotlight ($299/mo)</option>
    <option>Anchor ($499/mo)</option><option>Not sure yet — tell me more</option></select></div>
  <div><label for="inq-msg">Anything we should know? (optional)</label><textarea id="inq-msg" maxlength="1000" placeholder="Season, target audience, what's worked for you before…"></textarea></div>
  <button type="submit">Request a callback</button>
  <p class="msg" id="inq-msg-out" role="status" aria-live="polite"></p>
</form>
<p style="font-size:13.5px;color:var(--ink-soft)">Prefer email? Write us directly:
<a href="mailto:${esc(ADMIN_EMAIL)}">${esc(ADMIN_EMAIL)}</a>. We reply within one business day.</p>

<footer><p>DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:${esc(ADMIN_EMAIL)}">${esc(ADMIN_EMAIL)}</a></p></footer>
</div>
<script>
(function(){var f=document.getElementById('inq-form');if(!f)return;var m=document.getElementById('inq-msg-out');
f.addEventListener('submit',function(e){e.preventDefault();
var b=f.querySelector('button');b.disabled=true;
fetch('/advertise/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
venue:document.getElementById('inq-venue').value,name:document.getElementById('inq-name').value,
email:document.getElementById('inq-email').value,tier:document.getElementById('inq-tier').value,
message:document.getElementById('inq-msg').value,
attrib:(window.dayhopAttrib&&window.dayhopAttrib())||undefined})})
.then(function(r){if(!r.ok)throw new Error();m.textContent='Got it — we\\u2019ll be in touch within one business day.';m.style.color='#12855C';f.querySelectorAll('input,select,textarea,button').forEach(function(el){el.disabled=true;});})
.catch(function(){m.textContent='Something went wrong — please email us directly instead.';b.disabled=false;});});})();
</script>
</body></html>`;
}

router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.send(pageHtml());
});

router.post('/inquiry', express.json({ limit: '10kb' }), async (req, res) => {
  const { venue, name, email, tier, message, attrib } = req.body || {};
  const clean = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const lead = {
    venue: clean(venue, 120),
    name: clean(name, 80),
    email: clean(email, 120),
    tier: clean(tier, 60),
    message: clean(message, 1000)
  };
  if (!lead.venue || !lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return res.status(400).json({ error: 'INVALID', message: 'Venue and a valid email are required.' });
  }
  const utm = analytics.sanitizeAttrib(attrib);
  analytics.recordEvent({
    type: 'sponsor_inquiry',
    ownerKey: 'anon',
    source: 'advertise',
    meta: { venue: lead.venue, tier: lead.tier, ...(utm ? { utm } : {}) }
  });
  // Best-effort notify — the analytics event is the durable record, so a
  // missing RESEND_API_KEY loses nothing.
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `💰 Sponsor inquiry: ${lead.venue} (${lead.tier || 'no tier'})`,
    html: `<p><strong>${esc(lead.venue)}</strong> — ${esc(lead.tier)}</p>
<p>${esc(lead.name)} &lt;${esc(lead.email)}&gt;</p>
<p>${esc(lead.message) || '(no message)'}</p>
${utm ? `<p style="color:#666">Came via: ${esc(JSON.stringify(utm))}</p>` : ''}`,
    text: `${lead.venue} — ${lead.tier}\n${lead.name} <${lead.email}>\n\n${lead.message || '(no message)'}`
  }).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
