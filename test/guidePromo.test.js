// test/guidePromo.test.js — the running promo is pre-applied on guide
// checkouts while it runs, the code box comes back by itself once it expires,
// and the window we advertise can never outlast the Stripe code behind it.
const test = require('node:test');
const assert = require('node:assert/strict');

const cityGuidesRoute = require('../routes/cityGuides');
const { promoParams } = cityGuidesRoute;
const promo = require('../services/promo');

const DURING = promo.ENDS_MS - 60_000;
const AFTER = promo.ENDS_MS + 1;

test('the live promo is applied for the buyer before it expires', () => {
  const p = promoParams(DURING, {});
  assert.deepEqual(Object.keys(p), ['discounts']);
  assert.match(p.discounts[0].promotion_code, /^promo_/);
  // Stripe rejects discounts + allow_promotion_codes together.
  assert.equal(p.allow_promotion_codes, undefined);
});

test('the code box returns once the promo window closes', () => {
  assert.ok(promoParams(promo.ENDS_MS - 1000, {}).discounts);
  assert.deepEqual(promoParams(AFTER, {}), { allow_promotion_codes: true });
});

test('GUIDE_AUTO_PROMO=off turns the pre-applied discount off', () => {
  assert.deepEqual(promoParams(DURING, { GUIDE_AUTO_PROMO: 'off' }), { allow_promotion_codes: true });
});

test('the route and the client are served the same window', () => {
  const cfg = promo.publicConfig(DURING);
  assert.equal(cfg.active, true);
  assert.equal(cfg.code, promo.CODE);
  assert.equal(Date.parse(cfg.endsUtc), promo.ENDS_MS);
  // Whatever the strip says, checkout must agree at the same instant.
  assert.ok(promoParams(DURING, {}).discounts, 'strip on but checkout at full price');
  assert.equal(promo.publicConfig(AFTER).active, false);
  assert.deepEqual(promoParams(AFTER, {}), { allow_promotion_codes: true });
});

test('verify() refuses a window that outlasts the Stripe code', async () => {
  const fake = async () => ({
    json: async () => ({
      id: promo.ID, code: promo.CODE, active: true,
      // Stripe says the code died an hour before our window does.
      expires_at: Math.floor((promo.ENDS_MS - 3600_000) / 1000)
    })
  });
  const out = await promo.verify(fake, { STRIPE_SECRET_KEY: 'sk_test_x' });
  assert.equal(out.ok, false);
  assert.match(out.reason, /outlasts Stripe/);
});

test('verify() passes when the Stripe code outlives the window', async () => {
  const fake = async () => ({
    json: async () => ({
      id: promo.ID, code: promo.CODE, active: true,
      expires_at: Math.floor((promo.ENDS_MS + 3600_000) / 1000)
    })
  });
  const out = await promo.verify(fake, { STRIPE_SECRET_KEY: 'sk_test_x' });
  assert.equal(out.ok, true);
});

test('verify() never throws when it cannot run', async () => {
  const out = await promo.verify(async () => { throw new Error('offline'); }, { STRIPE_SECRET_KEY: 'sk_test_x' });
  assert.equal(out.ok, null);
  assert.match(out.reason, /offline/);
});
