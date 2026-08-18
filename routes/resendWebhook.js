// routes/resendWebhook.js — DayHop V2
// Resend delivery signals (email.delivered / .opened / .bounced) → the
// outreach audit trail, and hard bounces auto-suppress a prospect's cadence.
// Mounted with express.raw BEFORE the JSON parser (same as the Stripe
// webhook) because Svix signatures are computed over the exact bytes.
//
// Setup (one time, Resend dashboard → Webhooks): endpoint
// https://dayhop.quest/api/webhooks/resend, events email.delivered,
// email.opened, email.bounced; put the signing secret (whsec_…) in
// RESEND_WEBHOOK_SECRET. Without the secret the route answers 503 and
// nothing is trusted — fail-closed, not fail-open.

const crypto = require('crypto');
const outreach = require('../services/outreach');

const SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

function verify(req) {
  // Svix scheme: HMAC-SHA256 over "<id>.<timestamp>.<payload>" keyed with the
  // base64 part of the whsec_ secret; header carries "v1,<base64sig>" entries.
  const id = req.headers['svix-id'];
  const ts = req.headers['svix-timestamp'];
  const sigHeader = req.headers['svix-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false; // replay window
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.${req.body}`)
    .digest('base64');
  return String(sigHeader).split(' ').some(part => {
    const sig = part.split(',')[1] || '';
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

const TYPE_MAP = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.bounced': 'bounced'
};

module.exports = async function resendWebhook(req, res) {
  if (!SECRET) {
    return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Set RESEND_WEBHOOK_SECRET to enable.' });
  }
  if (!verify(req)) {
    return res.status(401).json({ error: 'BAD_SIGNATURE' });
  }
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    const mapped = TYPE_MAP[event.type];
    const resendId = event.data && event.data.email_id;
    if (mapped && resendId) {
      // Fire-and-forget: webhook delivery must never depend on our DB write.
      outreach.recordEmailEvent(resendId, mapped).catch(() => {});
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: 'BAD_PAYLOAD' });
  }
};
