// routes/personalGuides.js — DayHop V2
// The personalized trip guide ($20, Ontario places only).
//
//   GET  /api/personal-guides/places            → Ontario place names for the picker
//   POST /api/personal-guides/checkout          → { city, start, end, name? } → Stripe URL
//   GET  /api/personal-guides/status?session_id → { state, token? } (starts the build if needed)
//   GET  /api/personal-guides/download?t=       → the PDF (signed, one year)
//
// The build runs after payment (services/personalGuideFulfill.js); the
// thank-you page polls /status, which also restarts a build a restart killed.

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { ONTARIO_PLACES } = require('../data/ontarioPlaces');
const { validateOrder, PRICE_CENTS } = require('../services/personalGuide');
const fulfillment = require('../services/personalGuideFulfill');
const store = require('../services/personalGuideStore');
const analytics = require('../services/analytics');

let _stripe = null;
function getStripe() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

router.get('/places', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ places: ONTARIO_PLACES.map(p => p.name) });
});

router.post('/checkout', checkoutLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Purchases are not available right now.' });
  const v = validateOrder(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error, message: v.message });
  const { order } = v;
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const ownerId = (req.user && req.user.id) ||
      (typeof (req.body && req.body.owner_id) === 'string' ? req.body.owner_id.trim().slice(0, 80) : null);
    const email = typeof (req.body && req.body.email) === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(req.body.email.trim())
      ? req.body.email.trim() : null;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'cad',
          unit_amount: PRICE_CENTS,
          product_data: {
            name: `Your ${order.city} trip guide`,
            description: `A personalized DayHop guide for ${order.city}, ${order.start}${order.end !== order.start ? ` to ${order.end}` : ''}. PDF by email within about 15 minutes.`
          }
        }
      }],
      client_reference_id: ownerId || undefined,
      customer_email: (req.user && req.user.email) || email || undefined,
      // guide:'personal' routes fulfillment (services/billing.js) and books
      // the invoice to other_income like every guide sale.
      metadata: fulfillment.metadataFor(order),
      invoice_creation: { enabled: true, invoice_data: { metadata: { guide: 'personal' } } },
      allow_promotion_codes: true,
      success_url: `${origin}/guides/personal/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/guides/personal?purchase=cancelled`
    });
    analytics.recordEvent({ type: 'guide_checkout_started', ownerKey: ownerId || 'anon', meta: { guide: 'personal', city: order.city } });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[personal-guides] checkout failed:', err.message);
    res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'Could not start checkout. Please try again.' });
  }
});

router.get('/status', statusLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED' });
  const sid = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'BAD_SESSION' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (!session || session.payment_status !== 'paid' || !session.metadata || session.metadata.guide !== 'personal') {
      return res.status(402).json({ error: 'NOT_PAID', message: 'This checkout is not paid yet.' });
    }
    // Same dedupe as the webhook: whichever arrives first fulfils.
    await require('../services/billing').fulfillCheckoutSessionOnce(session, 'thanks').catch(() => {});
    const status = await fulfillment.ensureBuild(session);
    res.json({
      state: status.state,
      city: session.metadata.city,
      email: (session.customer_details && session.customer_details.email) || null,
      ...(status.state === 'ready' ? { token: fulfillment.signToken(sid) } : {})
    });
  } catch (err) {
    console.error('[personal-guides] status failed:', err.message);
    res.status(502).json({ error: 'STATUS_FAILED' });
  }
});

// Admin: rebuild a buyer's guide with today's listings (the order page
// promises this free the week before a trip). x-admin-key only; emails the
// fresh PDF again.
router.post('/rebuild', async (req, res) => {
  const expected = process.env.ADMIN_KEY;
  const given = req.headers['x-admin-key'];
  if (!expected || !given || String(given) !== expected) return res.status(403).json({ error: 'FORBIDDEN' });
  const stripe = getStripe();
  const sid = typeof (req.body && req.body.session_id) === 'string' ? req.body.session_id.trim() : '';
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'BAD_SESSION' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (!session || session.payment_status !== 'paid' || (session.metadata || {}).guide !== 'personal') return res.status(404).json({ error: 'NOT_A_PAID_PERSONAL_GUIDE' });
    await store.setStatus(sid, { state: 'rebuild' });
    const result = await fulfillment.runBuild(session, { resend: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(502).json({ error: 'REBUILD_FAILED', message: err.message });
  }
});

router.get('/download', async (req, res) => {
  const sid = fulfillment.verifyToken(req.query.t);
  if (!sid) return res.status(403).json({ error: 'BAD_TOKEN', message: 'This download link has expired. Write to admin@dayhop.quest for a fresh one.' });
  try {
    const guide = await store.getGuide(sid);
    const pdf = guide && await fulfillment.renderPdf(sid);
    if (!pdf) return res.status(404).json({ error: 'NOT_READY', message: 'Your guide is still being built. Try again in a few minutes.' });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${fulfillment.fileName(guide)}"`);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(pdf);
  } catch (err) {
    console.error('[personal-guides] download failed:', err.message);
    res.status(500).json({ error: 'DOWNLOAD_FAILED' });
  }
});

module.exports = router;
