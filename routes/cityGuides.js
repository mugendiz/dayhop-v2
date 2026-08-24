// routes/cityGuides.js — DayHop V2
// Paid city nature guides ($20 PDF).
//
//   GET  /api/cityguides                 → registry for the /guides page + feed card
//   POST /api/cityguides/checkout        → { slug } → Stripe Checkout URL (guests welcome)
//   GET  /api/cityguides/claim?session_id= → paid session → { token, slug } for
//                                          instant download on the success page
//                                          (email fulfillment is the backup)
//   GET  /api/cityguides/download?t=     → signed token → the PDF itself
//
// Fulfillment (email + ledger) rides the Stripe webhook — see
// services/cityGuides.fulfillPurchase and services/billing.handleWebhook.

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const cityGuides = require('../services/cityGuides');
const analytics = require('../services/analytics');

let _stripe = null;
function getStripe() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

router.get('/', (req, res) => {
  res.json({ guides: cityGuides.list(), currency: cityGuides.CURRENCY.toUpperCase() });
});

// Checkout sessions cost a Stripe API call each — keep drive-by scripts from
// minting them in bulk.
const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/checkout', checkoutLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Purchases are not available right now.' });
  const slug = typeof (req.body && req.body.slug) === 'string' ? req.body.slug.trim() : '';
  const guide = cityGuides.bySlug(slug);
  if (!guide || guide.status !== 'live') {
    return res.status(404).json({ error: 'UNKNOWN_GUIDE', message: 'That guide is not available yet.' });
  }
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    // Guests buy too: Stripe collects the email, fulfillment sends the PDF
    // there. client_reference_id ties the sale to a signed-in owner when
    // there is one (analytics only — the download link is the entitlement).
    const ownerId = (req.user && req.user.id) ||
      (typeof (req.body && req.body.owner_id) === 'string' ? req.body.owner_id.trim().slice(0, 80) : null);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: cityGuides.CURRENCY,
          unit_amount: cityGuides.PRICE_CENTS,
          product_data: {
            name: guide.title,
            description: `${guide.subtitle} PDF, delivered by email — free updated editions included.`
          }
        }
      }],
      client_reference_id: ownerId || undefined,
      customer_email: (req.user && req.user.email) || undefined,
      metadata: { guide: guide.slug },
      // The invoice carries the guide slug so billing.js books this sale to
      // 'other_income' in the ledger instead of 'uncategorized'.
      invoice_creation: { enabled: true, invoice_data: { metadata: { guide: guide.slug } } },
      allow_promotion_codes: true,
      success_url: `${origin}/guides?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/guides?purchase=cancelled`
    });
    analytics.recordEvent({ type: 'guide_checkout_started', ownerKey: ownerId || 'anon', meta: { guide: guide.slug } });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[city-guides] checkout failed:', err.message);
    res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'Could not start checkout. Please try again.' });
  }
});

// Instant delivery on the success page: swap a paid session id for a signed
// download token. Session ids are unguessable, so possession + paid status
// is proof of purchase; the token it mints is scoped to that guide only.
router.get('/claim', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED' });
  const sid = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'BAD_SESSION' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    const slug = session.metadata && session.metadata.guide;
    if (session.payment_status !== 'paid' || !slug || !cityGuides.bySlug(slug)) {
      return res.status(402).json({ error: 'NOT_PAID', message: 'This purchase has not completed.' });
    }
    res.json({ slug, token: cityGuides.signToken(slug) });
  } catch (err) {
    console.warn('[city-guides] claim failed:', err.message);
    res.status(404).json({ error: 'UNKNOWN_SESSION' });
  }
});

router.get('/download', async (req, res) => {
  const slug = cityGuides.verifyToken(req.query.t);
  if (!slug) {
    return res.status(403).send('This download link is invalid or has expired. Reply to your receipt email or write admin@dayhop.quest and we\'ll send a fresh one.');
  }
  try {
    const pdf = await cityGuides.getPdf(slug);
    if (!pdf) return res.status(404).send('Guide not found.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="DayHop-${slug}-nature-guide.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[city-guides] download failed:', err.message);
    res.status(500).send('Could not build your PDF just now — try again in a minute, or write admin@dayhop.quest.');
  }
});

module.exports = router;
