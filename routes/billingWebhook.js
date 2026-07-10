// routes/billingWebhook.js — DayHop V2 (Phase 4)
// Stripe webhook handler. Mounted in server.js BEFORE express.json() with an
// express.raw() body parser, because Stripe signature verification needs the
// exact raw bytes.

const billing = require('../services/billing');

module.exports = async function billingWebhook(req, res) {
  if (!billing.isConfigured()) {
    return res.status(503).json({ error: 'BILLING_NOT_CONFIGURED' });
  }
  try {
    const outcome = await billing.handleWebhook(req.body, req.headers['stripe-signature']);
    console.log('[billing] webhook:', outcome);
    res.json({ received: true });
  } catch (err) {
    if (err.code === 'WEBHOOK_NOT_CONFIGURED') {
      console.error('[billing]', err.message);
      return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' });
    }
    // Bad signature or malformed payload — reject so Stripe retries/flags it.
    console.warn('[billing] webhook rejected:', err.message);
    res.status(400).json({ error: 'WEBHOOK_INVALID' });
  }
};
