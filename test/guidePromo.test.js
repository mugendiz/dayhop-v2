// test/guidePromo.test.js — FALL75 is pre-applied on guide checkouts while it
// runs, and the promo-code box comes back by itself once it expires.
const test = require('node:test');
const assert = require('node:assert/strict');

const cityGuidesRoute = require('../routes/cityGuides');
const { promoParams } = cityGuidesRoute;

test('the live promo is applied for the buyer before it expires', () => {
  const during = Date.parse('2026-09-15T16:00:00Z');
  const p = promoParams(during, {});
  assert.deepEqual(Object.keys(p), ['discounts']);
  assert.match(p.discounts[0].promotion_code, /^promo_/);
  // Stripe rejects discounts + allow_promotion_codes together.
  assert.equal(p.allow_promotion_codes, undefined);
});

test('the code box returns once the promo window closes', () => {
  const lastSecond = Date.parse('2026-09-22T03:59:58Z');
  const after = Date.parse('2026-09-22T04:00:00Z');
  assert.ok(promoParams(lastSecond, {}).discounts);
  assert.deepEqual(promoParams(after, {}), { allow_promotion_codes: true });
});

test('GUIDE_AUTO_PROMO=off turns the pre-applied discount off', () => {
  const during = Date.parse('2026-09-15T16:00:00Z');
  assert.deepEqual(promoParams(during, { GUIDE_AUTO_PROMO: 'off' }), { allow_promotion_codes: true });
});
