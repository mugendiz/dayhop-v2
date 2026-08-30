// services/digestLinks.js — first-party digest email tracking, the
// "measure clicks, not opens" way (docs/email-marketing.md). Every pick
// link in the Thursday digest routes through GET /api/digest/click (an
// HMAC-signed redirect — signing kills open-redirect abuse), and the HTML
// carries a 1×1 open pixel. Opens stay reported because they're free, but
// Apple MPP inflates them; clicks are the number that gates decisions.
//
// Subscriber identity in links is a one-way HMAC of the email (`sid`) —
// NEVER newsletter_subscribers.token, which is the unsubscribe secret and
// would leak to third-party sites via the Referer header.
//
// Issue id = the Toronto date of the send (one digest per week, so the
// date names the issue).

const crypto = require('crypto');

function secret() {
  // Dedicated secret preferred; ADMIN_KEY is an acceptable stand-in (both
  // live server-side only). The literal fallback keeps dev links renderable
  // — worthless as a signature, fine for localhost previews.
  const s = process.env.DIGEST_TRACK_SECRET || process.env.ADMIN_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    // Forgeable click-signatures = open-redirect + analytics spoofing.
    throw new Error('DIGEST_TRACK_SECRET (or ADMIN_KEY) must be set in production.');
  }
  return 'dayhop-dev-only';
}

const hmac = input => crypto.createHmac('sha256', secret()).update(input).digest('hex');

/** Stable, opaque per-subscriber id — safe to put in URLs. */
function subscriberId(email) {
  return hmac(`sid|${String(email || '').trim().toLowerCase()}`).slice(0, 16);
}

/** Signature binding issue + subscriber + destination together. */
function signClick(issue, sid, url) {
  return hmac(`click|${issue}|${sid}|${url}`).slice(0, 24);
}

function signOpen(issue, sid) {
  return hmac(`open|${issue}|${sid}`).slice(0, 24);
}

// timingSafeEqual with the length check the raw API refuses to do.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

function verifyClick(issue, sid, url, sig) {
  return safeEqual(sig, signClick(issue, sid, url));
}

function verifyOpen(issue, sid, sig) {
  return safeEqual(sig, signOpen(issue, sid));
}

/** Redirect URL for a digest pick. `idx` is the pick's position (0 = top). */
function clickUrl(base, { issue, sid, url, idx }) {
  const sig = signClick(issue, sid, url);
  const q = new URLSearchParams({ i: issue, s: sid, u: url, sig });
  if (idx != null) q.set('p', String(idx));
  return `${base}/api/digest/click?${q}`;
}

function openPixelUrl(base, { issue, sid }) {
  const q = new URLSearchParams({ i: issue, s: sid, sig: signOpen(issue, sid) });
  return `${base}/api/digest/open?${q}`;
}

module.exports = { subscriberId, clickUrl, openPixelUrl, verifyClick, verifyOpen, signClick, signOpen };
