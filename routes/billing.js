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

// Hassle-free cancellation: one call, cancels at period end (no immediate
// loss, no proration surprises), fully reversible until the period lapses.
router.post('/cancel', requireUser, async (req, res) => {
  if (!billing.isConfigured()) return notConfigured(res);
  try {
    const sub = await billing.setCancelAtPeriodEnd(req.ownerId, true);
    analytics.recordEvent({ type: 'membership_cancelled', ownerKey: req.ownerId });
    res.json({ status: sub.status, cancel_at_period_end: true, current_period_end: sub.current_period_end });
  } catch (err) {
    if (err.code === 'NO_SUBSCRIPTION') {
      return res.status(404).json({ error: 'NO_SUBSCRIPTION', message: 'No membership on file for this account.' });
    }
    console.error('[billing] cancel failed:', err.message);
    res.status(502).json({ error: 'CANCEL_FAILED', message: 'Could not update your membership. Please try again.' });
  }
});

// The change of heart, equally hassle-free: renewal switches back on.
router.post('/resume', requireUser, async (req, res) => {
  if (!billing.isConfigured()) return notConfigured(res);
  try {
    const sub = await billing.setCancelAtPeriodEnd(req.ownerId, false);
    analytics.recordEvent({ type: 'membership_resumed', ownerKey: req.ownerId });
    res.json({ status: sub.status, cancel_at_period_end: false, current_period_end: sub.current_period_end });
  } catch (err) {
    if (err.code === 'NO_SUBSCRIPTION') {
      return res.status(404).json({ error: 'NO_SUBSCRIPTION', message: 'No membership on file for this account.' });
    }
    console.error('[billing] resume failed:', err.message);
    res.status(502).json({ error: 'RESUME_FAILED', message: 'Could not update your membership. Please try again.' });
  }
});

// Today's spend against the free daily limits, so the client can show a
// truthful "2 of 3 plans left" without keeping its own tally. Guests pass
// their stable guest id as ?owner_id (same key the generate route counts
// against). Best-effort: any failure just omits usage.
async function usageFor(req, entitlements) {
  if (!entitlements || entitlements.daily_generates == null) return undefined; // unlimited tier
  const ownerKey = (req.user && req.user.id) ||
    (typeof req.query.owner_id === 'string' && req.query.owner_id.trim().slice(0, 80)) || null;
  if (!ownerKey) return undefined;
  try {
    const [generates, replans] = await Promise.all([
      analytics.countToday('prompt_generated', ownerKey),
      analytics.countToday('plan_replanned', ownerKey)
    ]);
    return { generates_today: generates, replans_today: replans };
  } catch (err) {
    return undefined;
  }
}

router.get('/status', async (req, res) => {
  const configured = billing.isConfigured();
  // Entitlements and price ride along so the client can show the right
  // limits and upgrade prompts without hardcoding tier rules or amounts.
  const entitlements = await entitlementsFor(req.user).catch(() => null);
  const price = await billing.getPriceInfo().catch(() => null);
  // Super admins are Pro-and-then-some with no subscription behind it: report
  // pro so the client never shows upgrade chrome, and admin for admin chrome.
  if (entitlements && entitlements.tier === 'admin') {
    return res.json({ configured, pro: true, admin: true, status: 'admin', entitlements, price });
  }
  const usage = await usageFor(req, entitlements);
  if (!req.user) return res.json({ configured, pro: false, status: null, entitlements, price, usage });
  try {
    const sub = await billing.getSubscription(req.user.id);
    res.json({
      configured,
      pro: Boolean(sub && ['active', 'trialing'].includes(sub.status)),
      status: sub ? sub.status : null,
      cancel_at_period_end: sub ? Boolean(sub.cancel_at_period_end) : false,
      current_period_end: sub ? sub.current_period_end : null,
      entitlements,
      price,
      usage
    });
  } catch (err) {
    console.warn('[billing] status failed:', err.message);
    res.json({ configured, pro: false, status: null, entitlements, price, usage });
  }
});

module.exports = router;
