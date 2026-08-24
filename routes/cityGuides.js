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

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const cityGuides = require('../services/cityGuides');
const analytics = require('../services/analytics');
const { isAdmin } = require('../services/entitlements');

// Admins get every guide unlocked: the signed-in admin account (attachUser
// runs globally, so req.user is here when the page sends its bearer token)
// or the x-admin-key header both count.
function adminKeyOk(req) {
  const expected = process.env.ADMIN_KEY;
  const provided = req.headers['x-admin-key'];
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function isAdminReq(req) {
  return isAdmin(req.user) || adminKeyOk(req);
}

let _stripe = null;
function getStripe() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

router.get('/', (req, res) => {
  const admin = isAdminReq(req);
  const guides = cityGuides.list().map(g =>
    admin && g.status === 'live'
      ? Object.assign({}, g, { admin_token: cityGuides.signToken(g.slug) })
      : g);
  res.json({ guides, currency: cityGuides.CURRENCY.toUpperCase(), admin });
});

// Checkout sessions cost a Stripe API call each — keep drive-by scripts from
// minting them in bulk.
const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/checkout', checkoutLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Purchases are not available right now.' });
  const slug = typeof (req.body && req.body.slug) === 'string' ? req.body.slug.trim() : '';
  const isBundle = slug === cityGuides.BUNDLE.slug;
  const guide = isBundle ? cityGuides.BUNDLE : cityGuides.bySlug(slug);
  if (!guide || (!isBundle && guide.status !== 'live')) {
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
          unit_amount: isBundle ? cityGuides.BUNDLE.price_cents : cityGuides.PRICE_CENTS,
          product_data: {
            name: guide.title,
            description: isBundle
              ? 'All six DayHop city guides as PDFs, delivered by email — free updated editions included.'
              : `${guide.subtitle} PDF, delivered by email — free updated editions included.`
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
    const isBundle = slug === cityGuides.BUNDLE.slug;
    if (session.payment_status !== 'paid' || !slug || (!isBundle && !cityGuides.bySlug(slug))) {
      return res.status(402).json({ error: 'NOT_PAID', message: 'This purchase has not completed.' });
    }
    if (isBundle) {
      const tokens = cityGuides.GUIDES.filter(g => g.status === 'live')
        .map(g => ({ slug: g.slug, title: g.title, token: cityGuides.signToken(g.slug) }));
      return res.json({ slug, bundle: true, tokens });
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
    // ?inline=1 renders the PDF in the browser tab (admin quick-look);
    // default stays a download for buyers.
    const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="DayHop-${slug}-nature-guide.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[city-guides] download failed:', err.message);
    res.status(500).send('Could not build your PDF just now — try again in a minute, or write admin@dayhop.quest.');
  }
});

// Admin: mint a promotion code for the guides (launch promos, partner codes).
// The server holds the live Stripe key, so the operator never has to handle
// it — POST with the x-admin-key header (or a signed-in admin session):
//   { code, percent_off, max_redemptions?, expires_at? (unix seconds) }
// Idempotent on the code: if an active promotion code already exists under
// that code, it is returned instead of duplicated.
router.post('/promo', async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: 'FORBIDDEN' });
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED' });

  const body = req.body || {};
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const percentOff = Number(body.percent_off);
  const maxRedemptions = Number.isInteger(body.max_redemptions) && body.max_redemptions > 0
    ? body.max_redemptions : undefined;
  const expiresAt = Number.isInteger(body.expires_at) && body.expires_at > Date.now() / 1000
    ? body.expires_at : undefined;
  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    return res.status(400).json({ error: 'BAD_CODE', message: 'Code must be 3-20 letters/digits.' });
  }
  if (!(percentOff > 0 && percentOff <= 100)) {
    return res.status(400).json({ error: 'BAD_PERCENT', message: 'percent_off must be 1-100.' });
  }
  try {
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length) {
      const p = existing.data[0];
      const couponId = (p.coupon && p.coupon.id) || (p.promotion && p.promotion.coupon) || null;
      return res.json({ existed: true, promotion_code_id: p.id, code: p.code, coupon_id: couponId, max_redemptions: p.max_redemptions, expires_at: p.expires_at });
    }
    const coupon = await stripe.coupons.create({ percent_off: percentOff, duration: 'once', name: code });
    // Current API shape (promotion object); falls back to the legacy
    // `coupon` parameter for accounts pinned to an older version.
    let promo;
    try {
      promo = await stripe.promotionCodes.create({
        promotion: { type: 'coupon', coupon: coupon.id },
        code,
        max_redemptions: maxRedemptions,
        expires_at: expiresAt
      });
    } catch (err) {
      if (!/unknown parameter/i.test(err.message || '')) throw err;
      promo = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code,
        max_redemptions: maxRedemptions,
        expires_at: expiresAt
      });
    }
    res.json({ existed: false, promotion_code_id: promo.id, code: promo.code, coupon_id: coupon.id, percent_off: percentOff, max_redemptions: promo.max_redemptions, expires_at: promo.expires_at });
  } catch (err) {
    console.error('[city-guides] promo create failed:', err.message);
    res.status(502).json({ error: 'PROMO_FAILED', message: err.message });
  }
});

module.exports = router;
