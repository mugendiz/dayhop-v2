// routes/billing.js — DayHop V2 (Phase 4)
// POST /api/billing/checkout → Stripe Checkout session URL (signed-in only)
// GET  /api/billing/status   → { configured, pro, status }
// The webhook is NOT here — it needs the raw body, so server.js mounts
// billingWebhook before express.json().

const express = require('express');
const router = express.Router();
const billing = require('../services/billing');
const analytics = require('../services/analytics');
const { entitlementsFor } = require('../services/entitlements');
const { requireUser } = require('../middleware/auth');

function notConfigured(res) {
  return res.status(503).json({
    error: 'BILLING_NOT_CONFIGURED',
    message: 'DayHop Pro is not available yet. Check back soon!'
  });
}

router.post('/checkout', requireUser, async (req, res) => {
  if (!billing.isConfigured()) return notConfigured(res);
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await billing.createCheckoutSession({
      ownerId: req.ownerId,
      email: req.user && req.user.email,
      origin
    });
    analytics.recordEvent({ type: 'upgrade_started', ownerKey: req.ownerId });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout failed:', err.message);
    res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'Could not start checkout. Please try again.' });
  }
});

router.get('/status', async (req, res) => {
  const configured = billing.isConfigured();
  // Entitlements ride along so the client can show the right limits and
  // upgrade prompts without hardcoding tier rules.
  const entitlements = await entitlementsFor(req.user && req.user.id).catch(() => null);
  if (!req.user) return res.json({ configured, pro: false, status: null, entitlements });
  try {
    const sub = await billing.getSubscription(req.user.id);
    res.json({
      configured,
      pro: Boolean(sub && ['active', 'trialing'].includes(sub.status)),
      status: sub ? sub.status : null,
      current_period_end: sub ? sub.current_period_end : null,
      entitlements
    });
  } catch (err) {
    console.warn('[billing] status failed:', err.message);
    res.json({ configured, pro: false, status: null, entitlements });
  }
});

module.exports = router;
