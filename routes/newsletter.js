// routes/newsletter.js — DayHop V2
// Public consent endpoints for the weekly digest:
//   POST /api/newsletter/subscribe    { email, source?, owner_id? } → 200
//   GET  /api/newsletter/confirm      ?token= → branded HTML "you're in"
//   GET  /api/newsletter/unsubscribe  ?token= → branded HTML "you're out"
//   POST /api/newsletter/unsubscribe  ?token= → 200 (RFC 8058 one-click,
//        fired by Gmail/Yahoo's native Unsubscribe button — no HTML needed)
//
// Subscribe responses are deliberately uniform: whether the address was new,
// already subscribed, or pending, the caller sees the same 200 — the list
// must not be an oracle for probing which emails exist.

const express = require('express');
const router = express.Router();
const newsletter = require('../services/newsletter');

// Minimal branded page for the two human-facing link landings — same tokens
// as /blog so the trip out of the inbox still looks like DayHop.
function page(title, body, ok = true) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — DayHop</title>
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<style>body{margin:0;background:#FBF7EE;color:#102A2E;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
.card{max-width:440px;background:#fff;border:1px solid rgba(16,42,46,.14);border-radius:0 18px 18px 0;padding:34px 36px;box-shadow:0 4px 14px rgba(16,42,46,.08)}
h1{font-size:24px;line-height:1.25;margin:0 0 10px}p{line-height:1.6;color:#2C4A4E;margin:0 0 18px}
.logo{font-weight:700;font-size:20px;margin:0 0 18px}
a.btn{display:inline-block;background:#FF6B4A;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px}</style>
</head><body><div class="card"><p class="logo">${ok ? 'DayHop' : 'DayHop'}</p><h1>${title}</h1><p>${body}</p>
<a class="btn" href="/">Plan a day →</a></div></body></html>`;
}

router.post('/subscribe', async (req, res) => {
  const { email, source, owner_id } = req.body || {};
  const result = await newsletter.subscribe(email, {
    source: typeof source === 'string' ? source : 'unknown',
    ownerId: (req.user && req.user.id) || (typeof owner_id === 'string' ? owner_id : null),
    ip: req.ip // part of the CASL consent record
  });
  if (!result.ok) {
    return res.status(400).json({ error: 'INVALID_EMAIL', message: 'That doesn’t look like an email address.' });
  }
  // Same body for every outcome (see header note).
  res.json({ ok: true, message: 'Check your inbox — click the confirmation link and you’re in.' });
});

router.get('/confirm', async (req, res) => {
  const token = String(req.query.token || '');
  const result = await newsletter.confirm(token);
  res.setHeader('Cache-Control', 'no-store');
  if (!result.ok) {
    return res.status(404).send(page('That link didn’t work',
      'It may have expired or already been used. Subscribe again from the site and we’ll send a fresh one.', false));
  }
  // The reward, immediately: straight into the Playbook (also linked from the
  // welcome email that just went out).
  res.send(page('You’re in 🎉',
    'Your Weekend Playbook is ready — 70+ GTA outings actually worth your Saturday. It’s also in the welcome email we just sent, along with your Thursday weekend brief.')
    .replace('<a class="btn" href="/">Plan a day →</a>',
      `<a class="btn" href="/playbook?t=${encodeURIComponent(token)}">Open my Playbook →</a>`));
});

// Human path: someone clicked "Unsubscribe" in the email footer.
router.get('/unsubscribe', async (req, res) => {
  const result = await newsletter.unsubscribe(String(req.query.token || ''));
  res.setHeader('Cache-Control', 'no-store');
  if (!result.ok) {
    return res.status(404).send(page('That link didn’t work',
      'It may have already been used. If you keep getting emails, write us at admin@dayhop.quest and we’ll sort it by hand.', false));
  }
  res.send(page('You’re unsubscribed',
    'Done — no more weekend briefs. The planner itself is still yours any time you want it.'));
});

// Machine path: RFC 8058 one-click POST from the mail provider's own
// unsubscribe button. Must succeed with no interstitial and no redirect.
router.post('/unsubscribe', async (req, res) => {
  await newsletter.unsubscribe(String(req.query.token || ''));
  res.status(200).end();
});

module.exports = router;
