// routes/cityGuides.js — DayHop V2
// Paid city nature guides ($20 PDF).
//
//   GET  /api/cityguides                 → registry for the /guides page + feed card
//   POST /api/cityguides/checkout        → { slug } → Stripe Checkout URL (guests welcome)
//   GET  /api/cityguides/claim?session_id= → paid session → { token, slug } for
//                                          instant download on the success page
//   POST /api/cityguides/fulfill         → { session_id } → send the email now
//   GET  /api/cityguides/download?t=     → signed token → the PDF itself
//
// Fulfillment (email + ledger) used to ride the Stripe webhook alone. It no
// longer does: the thank-you page calls /fulfill on the way back from Stripe,
// and whichever path arrives first wins — deduped on the session id inside
// services/billing.fulfillCheckoutSessionOnce. A webhook cannot be the only
// delivery path for a paid product on a free-plan Render service that sleeps;
// see the comment on that function for what Stripe reported on 2026-09-10.

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const cityGuides = require('../services/cityGuides');
const analytics = require('../services/analytics');
const billing = require('../services/billing');
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

// Reader quotes for the buy buttons. Only consented entries leave the
// server, and only the fields the page shows.
function publishableTestimonials() {
  return require('../data/testimonials')
    .filter(t => t && t.consent === true && t.quote && t.name)
    .map(t => ({ quote: t.quote, name: t.name, city: t.city || null, guide: t.guide || null }));
}
router.publishableTestimonials = publishableTestimonials;

router.get('/', (req, res) => {
  const admin = isAdminReq(req);
  const guides = cityGuides.list().map(g =>
    admin && g.status === 'live'
      ? Object.assign({}, g, { admin_token: cityGuides.signToken(g.slug) })
      : g);
  res.json({ guides, testimonials: publishableTestimonials(), currency: cityGuides.CURRENCY.toUpperCase(), admin });
});

// Checkout sessions cost a Stripe API call each — keep drive-by scripts from
// minting them in bulk.
const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Where the buyer lands after Stripe. Allow-listed by key — the client never
// supplies a URL, only a name from this table.
const RETURN_PATHS = {
  'richmond-hill-letter': {
    success: '/guides/richmond-hill/thanks?session_id={CHECKOUT_SESSION_ID}',
    cancel: '/guides/richmond-hill?purchase=cancelled'
  }
};

// The running promo is pre-applied for the buyer instead of waiting to be
// typed: every guide checkout opened between Aug 24 and Sep 8 was abandoned
// on a full-price screen. The window itself lives in services/promo.js —
// see the header there for why it is no longer written out in six places.
const { promoParams } = require('../services/promo');
router.promoParams = promoParams;

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
    // Email-first checkout (2026-10-19): guests used to go straight to
    // Stripe and bounce before typing an email there — 20 of 23 historical
    // sessions have no customer email, which made recovery impossible. The
    // buyer types their email on dayhop.quest first; Stripe gets it as
    // customer_email (prefilled, still editable there), and the attempt is
    // recorded for the 60-minute recovery sweep (services/checkoutRecovery).
    // client_reference_id ties the sale to a signed-in owner when there is
    // one (analytics only — the download link is the entitlement).
    const ownerId = (req.user && req.user.id) ||
      (typeof (req.body && req.body.owner_id) === 'string' ? req.body.owner_id.trim().slice(0, 80) : null);
    const { normalizeEmail } = require('../services/checkoutRecovery');
    const email = normalizeEmail(req.body && req.body.email) ||
      normalizeEmail(req.user && req.user.email);
    if (!email) {
      return res.status(400).json({ error: 'NEED_EMAIL', message: 'Add your email so we can send your guide.' });
    }
    const ret = RETURN_PATHS[req.body && req.body.return] || null;
    // Keyed-ad tracking: each channel sends its own src so conversions are
    // attributable per channel in analytics and in Stripe metadata.
    const src = /^[a-z0-9_-]{1,32}$/.test(String((req.body && req.body.src) || '')) ? req.body.src : undefined;
    const params = {
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
      customer_email: email,
      metadata: Object.assign({ guide: guide.slug }, src ? { src } : {}),
      // The invoice carries the guide slug so billing.js books this sale to
      // 'other_income' in the ledger instead of 'uncategorized'.
      invoice_creation: { enabled: true, invoice_data: { metadata: { guide: guide.slug } } },
      ...promoParams(),
      success_url: origin + (ret ? ret.success : '/guides?purchase=success&session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: origin + (ret ? ret.cancel : '/guides?purchase=cancelled')
    };
    let session;
    try {
      session = await stripe.checkout.sessions.create(params);
    } catch (err) {
      if (!params.discounts) throw err;
      // A deactivated or expired promo must never block a sale.
      console.warn('[city-guides] auto promo rejected, retrying without it:', err.message);
      delete params.discounts;
      params.allow_promotion_codes = true;
      session = await stripe.checkout.sessions.create(params);
    }
    analytics.recordEvent({ type: 'guide_checkout_started', ownerKey: ownerId || 'anon', meta: Object.assign({ guide: guide.slug }, src ? { src } : {}) });
    // Record the attempt for abandoned-checkout recovery. Fail-soft: a DB
    // hiccup here must never block the sale in flight.
    require('../services/checkoutRecovery').recordAttempt({
      email, productType: 'guide', productLabel: guide.title,
      guideSlug: guide.slug, stripeSessionId: session.id
    }).catch(err => console.warn('[city-guides] attempt record failed (non-fatal):', err.message));
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
    // 'no_payment_required' = a completed checkout where a 100%-off promo
    // (e.g. an owner/partner code) zeroed the total — still a real purchase.
    const settled = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (!settled || !slug || (!isBundle && !cityGuides.bySlug(slug))) {
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

// The thank-you page's half of fulfillment: deliver the guide email now,
// rather than hoping the Stripe webhook reaches a service that may be asleep.
//
// The session id is the authorization. It is unguessable, Stripe hands it only
// to the buyer through success_url, and every fact used to fulfill is read back
// from Stripe rather than taken from the request — so the worst a stranger with
// a valid session id can do is re-trigger an email to the address that already
// bought the guide, once, which the dedupe then blocks anyway.
//
// POST, not GET, because it sends mail: a prefetcher or link scanner must not
// be able to trigger it by following a URL.
router.post('/fulfill', checkoutLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED' });
  const sid = typeof (req.body && req.body.session_id) === 'string' ? req.body.session_id.trim() : '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'BAD_SESSION' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    // Same settled test as /claim: 'no_payment_required' is a completed
    // checkout a 100%-off promo zeroed, which is still a real purchase.
    const settled = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (!settled) return res.status(402).json({ error: 'NOT_PAID', message: 'This purchase has not completed.' });
    const outcome = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
    console.log('[city-guides] fulfill via thanks page:', outcome);
    res.json({ fulfilled: true });
  } catch (err) {
    // Never fail the buyer's page over this. They already have the download
    // link from /claim; the email is the durable copy, and the webhook (or a
    // reload of this page) can still deliver it.
    console.error('[city-guides] thanks-page fulfill failed:', err.message);
    res.status(502).json({ error: 'FULFILL_FAILED' });
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
//   { code, percent_off, max_redemptions?, expires_at? (unix seconds), replace? }
// Idempotent on the code: if an active promotion code already exists under
// that code, it is returned instead of duplicated.
//
// Stripe makes expires_at immutable after creation (only active/metadata/
// restrictions are editable), so extending or shortening a live promo means
// retiring the old code and minting a fresh one. `replace: true` does exactly
// that, and reports how many times the retired code had already been redeemed
// so the operator knows whether anyone is mid-flight on it.
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
    const replace = body.replace === true;
    let retired = null;
    const existing = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    if (existing.data.length) {
      const p = existing.data[0];
      const couponId = (p.coupon && p.coupon.id) || (p.promotion && p.promotion.coupon) || null;
      if (!replace) {
        return res.json({ existed: true, promotion_code_id: p.id, code: p.code, coupon_id: couponId, max_redemptions: p.max_redemptions, expires_at: p.expires_at });
      }
      // Retire the old code so the same customer-facing string is free again
      // (codes must be unique across ACTIVE promotion codes).
      await stripe.promotionCodes.update(p.id, { active: false });
      retired = { promotion_code_id: p.id, coupon_id: couponId, times_redeemed: p.times_redeemed, expires_at: p.expires_at };
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
    res.json({ existed: false, replaced: Boolean(retired), retired, promotion_code_id: promo.id, code: promo.code, coupon_id: coupon.id, percent_off: percentOff, max_redemptions: promo.max_redemptions, expires_at: promo.expires_at });
  } catch (err) {
    console.error('[city-guides] promo create failed:', err.message);
    res.status(502).json({ error: 'PROMO_FAILED', message: err.message });
  }
});

module.exports = router;
