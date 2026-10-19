// routes/billing.js — DayHop V2 (Phase 4)
// POST /api/billing/checkout → Stripe Checkout session URL (signed-in only)
// GET  /api/billing/status   → { configured, pro, status }
// The webhook is NOT here — it needs the raw body, so server.js mounts
// billingWebhook before express.json().

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const billing = require('../services/billing');
const analytics = require('../services/analytics');
const { entitlementsFor } = require('../services/entitlements');
const { requireUser } = require('../middleware/auth');

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

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
    // Campaign attribution (utm_*/fbclid captured by pixel.js at landing)
    // flows into Stripe metadata so paying customers stay attributable.
    const utm = analytics.sanitizeAttrib(req.body && req.body.attrib);
    // Email-first (2026-10-19): the signed-in user's email is primary, but
    // the body carries a fallback — a user record without an email must not
    // mint an unrecoverable session. 2 Pro checkouts were abandoned with no
    // recovery path; every attempt is now recorded for the 60-minute sweep.
    const { normalizeEmail } = require('../services/checkoutRecovery');
    const email = normalizeEmail(req.user && req.user.email) ||
      normalizeEmail(req.body && req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'NEED_EMAIL', message: 'Add your email to start the Pro trial.' });
    }
    const session = await billing.createCheckoutSession({
      ownerId: req.ownerId,
      email,
      origin,
      attrib: utm
    });
    require('../services/checkoutRecovery').recordAttempt({
      email, productType: 'pro', productLabel: 'DayHop Pro',
      guideSlug: null, stripeSessionId: session.id
    }).catch(err => console.warn('[billing] attempt record failed (non-fatal):', err.message));
    analytics.recordEvent({ type: 'upgrade_started', ownerKey: req.ownerId, meta: utm ? { utm } : null });
    require('../services/metaPixel').sendEvent('InitiateCheckout', {
      email: req.user && req.user.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      sourceUrl: req.headers.referer
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout failed:', err.message);
    res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'Could not start checkout. Please try again.' });
  }
});

// The thank-you page's half of fulfillment — same reasoning as the city
// guides' /fulfill (routes/cityGuides.js, services/billing.js's
// fulfillCheckoutSession comment): a webhook aimed at a sleeping Render free
// instance fails at the connection level, so the browser reconciles the
// session directly on the way back from Stripe instead of trusting the
// webhook to be the only path to activation. The session id is the
// authorization (Stripe hands it only to the buyer via success_url); every
// fact used to activate is read back from Stripe, never from the request.
router.post('/fulfill', checkoutLimiter, async (req, res) => {
  if (!billing.isConfigured()) return notConfigured(res);
  const sid = typeof (req.body && req.body.session_id) === 'string' ? req.body.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'BAD_SESSION' });
  try {
    const session = await billing.retrieveCheckoutSession(sid);
    // A trial checkout is 'no_payment_required' (nothing due yet) — still a
    // real, completed signup, same test the guide flow uses.
    const settled = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (!settled) return res.status(402).json({ error: 'NOT_PAID', message: 'This checkout has not completed.' });
    const outcome = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
    console.log('[billing] fulfill via thanks page:', outcome);
    res.json({ fulfilled: true });
  } catch (err) {
    // Never fail the buyer's page over this — the webhook (or a reload) can
    // still deliver it; this call just removes the dependency on the
    // instance being awake at the exact moment Stripe's webhook arrives.
    console.error('[billing] thanks-page fulfill failed:', err.message);
    res.status(502).json({ error: 'FULFILL_FAILED' });
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
// truthful "2 of 3 plans left" without keeping its own tally. Guests are
// counted by IP — the SAME key the generate route enforces against (the
// client-chosen owner_id is not trusted there, so it can't be the key
// here either, or the meter and the gate would disagree).
async function usageFor(req, entitlements) {
  if (!entitlements || entitlements.daily_generates == null) return undefined; // unlimited tier
  const ownerKey = (req.user && req.user.id) || `ip-${req.ip}`;
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
  const livemode = billing.status().livemode;
  // Entitlements and price ride along so the client can show the right
  // limits and upgrade prompts without hardcoding tier rules or amounts.
  // This endpoint is hit on every page load — the independent lookups run
  // in parallel instead of 4-5 serial round trips.
  const [entitlements, price, sub] = await Promise.all([
    entitlementsFor(req.user).catch(() => null),
    billing.getPriceInfo().catch(() => null),
    req.user
      ? billing.getSubscription(req.user.id).catch(err => {
          console.warn('[billing] status failed:', err.message);
          return null;
        })
      : Promise.resolve(null)
  ]);
  // Super admins are Pro-and-then-some with no subscription behind it: report
  // pro so the client never shows upgrade chrome, and admin for admin chrome.
  if (entitlements && entitlements.tier === 'admin') {
    return res.json({ configured, livemode, pro: true, admin: true, status: 'admin', entitlements, price });
  }
  const usage = await usageFor(req, entitlements);
  if (!req.user) return res.json({ configured, livemode, pro: false, status: null, entitlements, price, usage });
  res.json({
    configured,
    livemode,
    pro: Boolean(sub && ['active', 'trialing'].includes(sub.status)),
    status: sub ? sub.status : null,
    cancel_at_period_end: sub ? Boolean(sub.cancel_at_period_end) : false,
    current_period_end: sub ? sub.current_period_end : null,
    entitlements,
    price,
    usage
  });
});

module.exports = router;
