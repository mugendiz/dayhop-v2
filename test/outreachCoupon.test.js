// test/outreachCoupon.test.js — the outreach CRM's one-click "Send code"
// (services/outreach.js sendCoupon) must never quote a coupon code or deal
// shape the live /advertise page doesn't also promise. It drifted once
// already: sendCoupon kept sending "FOUNDING50 (50% off your first three
// months)" long after the founding-partner offer moved to flat $99/mo under
// code FOUNDING (routes/advertise.js's own copy) — the exact class of bug
// services/promo.js's header comment warns about (copy and checkout
// disagreeing burned a real customer on 2026-09-08).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const outreach = require('../services/outreach');

test('the coupon code sendCoupon quotes matches the live /advertise page', () => {
  const advertiseSrc = fs.readFileSync(path.join(__dirname, '../routes/advertise.js'), 'utf8');
  assert.ok(
    advertiseSrc.includes(`code <strong>${outreach.FOUNDING_CODE}</strong>`),
    `outreach.js's FOUNDING_CODE ("${outreach.FOUNDING_CODE}") must be the code routes/advertise.js actually advertises`
  );
  assert.doesNotMatch(outreach.FOUNDING_CODE, /50$/, 'FOUNDING50 was retired — never reintroduce it here');
});

test('the exported terms are the current $99/mo offer, not the retired 50%-off one', () => {
  assert.equal(outreach.FOUNDING_CODE, 'FOUNDING');
  assert.match(outreach.FOUNDING_TERMS, /\$99\/mo/);
  assert.doesNotMatch(outreach.FOUNDING_TERMS, /50% off/);
});
