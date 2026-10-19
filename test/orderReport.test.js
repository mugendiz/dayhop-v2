// test/orderReport.test.js — the customers and orders report. The rows must
// say what was bought or attempted, when, and in which city, and must never
// carry an email, a name, a phone number or a Stripe id.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shapeSession, summarize, toCsv, formatSummary, COLUMNS } = require('../services/orderReport');
const cityGuides = require('../services/cityGuides');

const guide = cityGuides.GUIDES.find(g => g.status === 'live') || cityGuides.GUIDES[0];
const base = {
  id: 'cs_live_a1b2c3', object: 'checkout.session', livemode: true,
  created: Date.parse('2026-10-03T14:30:00Z') / 1000,
  customer: 'cus_SECRET123',
  customer_details: { email: 'buyer@example.com', name: 'Jane Buyer', phone: '+14165550100', address: { city: 'Markham', country: 'CA', postal_code: 'L3R 0A1', line1: '1 Main St' } },
  client_reference_id: null, currency: 'cad', amount_total: 500,
  total_details: { amount_discount: 1500 }, metadata: { guide: guide.slug, src: 'ig' },
  mode: 'payment', status: 'complete', payment_status: 'paid'
};

test('a row never carries an email, a name, a phone, an address line or a Stripe id', () => {
  const row = shapeSession(base, { refKey: 'k' });
  const flat = JSON.stringify(row) + toCsv([row]);
  for (const secret of ['buyer@example.com', 'Jane', 'Buyer', '+14165550100', '1 Main St', 'L3R', 'cus_SECRET123', 'cs_live_a1b2c3']) {
    assert.ok(!flat.includes(secret), `leaked ${secret}`);
  }
  assert.deepEqual(Object.keys(row).filter(k => !['acquired'].includes(k)).sort(), [...COLUMNS].sort());
});

test('date, product, outcome, amount and discount come from the session', () => {
  const row = shapeSession(base, { refKey: 'k' });
  assert.equal(row.date, '2026-10-03');
  assert.equal(row.time, '10:30', 'Toronto time');
  assert.equal(row.product, guide.title);
  assert.equal(row.kind, 'City guide');
  assert.equal(row.outcome, 'Purchased');
  assert.equal(row.acquired, true);
  assert.equal(row.amount, '5.00 CAD');
  assert.equal(row.discount, '15.00 CAD');
  assert.equal(row.source, 'ig');
});

test('attempted orders, trials and free codes are named for what they are', () => {
  const out = over => shapeSession(Object.assign({}, base, over), { refKey: 'k' });
  assert.equal(out({ status: 'expired', payment_status: 'unpaid' }).outcome, 'Attempted, abandoned at checkout');
  assert.equal(out({ status: 'expired', payment_status: 'unpaid' }).acquired, false);
  assert.equal(out({ status: 'open', payment_status: 'unpaid' }).outcome, 'Attempted, checkout still open');
  assert.equal(out({ payment_status: 'no_payment_required', amount_total: 0 }).outcome, 'Acquired free (100% promo code)');
  const trial = out({ mode: 'subscription', metadata: {}, payment_status: 'no_payment_required', line_items: { data: [{ description: 'DayHop Pro' }] } });
  assert.equal(trial.outcome, 'Free trial started');
  assert.equal(trial.product, 'DayHop Pro');
  assert.equal(trial.kind, 'Membership');
  assert.equal(out({ metadata: { guide: cityGuides.BUNDLE.slug } }).product, cityGuides.BUNDLE.title);
});

test('city: DayHop activity first, then the Stripe billing city, then Unknown', () => {
  const signedIn = Object.assign({}, base, { client_reference_id: 'owner-1' });
  assert.equal(shapeSession(signedIn, { cityForOwner: () => 'Richmond Hill' }).city, 'Richmond Hill');
  assert.equal(shapeSession(signedIn, { cityForOwner: () => 'Richmond Hill' }).city_source, 'DayHop activity');
  assert.equal(shapeSession(signedIn, { cityForOwner: () => null }).city, 'Markham');
  const noAddress = Object.assign({}, base, { customer_details: { email: 'x@y.z', address: { country: 'CA' } } });
  const row = shapeSession(noAddress);
  assert.equal(row.city, 'Unknown');
  assert.equal(row.country, 'CA');
});

test('the anonymous code is stable per person and different between people', () => {
  const a1 = shapeSession(base, { refKey: 'k' }).customer;
  const a2 = shapeSession(Object.assign({}, base, { id: 'cs_other', status: 'expired' }), { refKey: 'k' }).customer;
  const b = shapeSession(Object.assign({}, base, { customer: 'cus_SOMEONE_ELSE' }), { refKey: 'k' }).customer;
  assert.match(a1, /^C-[0-9a-f]{6}$/);
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});

test('summary counts acquired vs attempted, revenue by product, and cities', () => {
  const rows = [
    shapeSession(base, { refKey: 'k' }),
    shapeSession(Object.assign({}, base, { status: 'expired', payment_status: 'unpaid' }), { refKey: 'k' }),
    shapeSession(Object.assign({}, base, { customer: 'cus_2', customer_details: { address: { city: 'Newmarket' } } }), { refKey: 'k' })
  ];
  const s = summarize(rows);
  assert.equal(s.orders, 3);
  assert.equal(s.acquired, 2);
  assert.equal(s.attempted_only, 1);
  assert.equal(s.people, 2);
  assert.equal(s.people_who_acquired, 2);
  assert.equal(s.by_product[0].revenue, '10.00 CAD');
  assert.deepEqual(s.by_city.map(c => c.city), ['Markham', 'Newmarket']);
  const text = formatSummary({ generated_on: '2026-10-19', since: null, rows, summary: s, truncated: false });
  assert.match(text, /3 checkouts by 2 people: 2 acquired, 1 attempted/);
  assert.ok(!text.includes('@'), 'no email in the email body');
});

test('CSV quotes commas and quotes in product names', () => {
  const row = shapeSession(Object.assign({}, base, { metadata: {}, line_items: { data: [{ description: 'Guide, "deluxe"' }] } }), { refKey: 'k' });
  assert.match(toCsv([row]), /"Guide, ""deluxe"""/);
});
