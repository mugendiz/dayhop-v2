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
  assert.equal(out({ status: 'expired', payment_status: 'unpaid' }).amount, '5.00 CAD (unpaid)', 'an abandoned total never reads as paid');
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
  const b = shapeSession(Object.assign({}, base, { customer: 'cus_SOMEONE_ELSE', customer_details: { email: 'someone@else.com', address: {} } }), { refKey: 'k' }).customer;
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
  assert.match(text, /Checkouts: 3 by 2 people\. 2 acquired, 1 attempted/);
  assert.ok(!text.includes('@'), 'no email in the email body');
});

test('CSV quotes commas and quotes in product names', () => {
  const row = shapeSession(Object.assign({}, base, { metadata: {}, line_items: { data: [{ description: 'Guide, "deluxe"' }] } }), { refKey: 'k' });
  assert.match(toCsv([row]), /"Guide, ""deluxe"""/);
});

const { isFounderSession } = require('../services/orderReport');
const { buildOrderReportPdf } = require('../services/orderReportPdf');

test('founder and team checkouts are recognised by email, domain or internal account', () => {
  const founder = { emails: new Set(['owner@example.com']), owners: new Set(['owner-uuid']) };
  assert.equal(isFounderSession(Object.assign({}, base, { customer_details: { email: 'Owner@Example.com' } }), founder), true, 'case-insensitive');
  assert.equal(isFounderSession(Object.assign({}, base, { customer_details: null, customer_email: 'owner@example.com', status: 'expired' }), founder), true, 'prefilled email on an abandoned checkout');
  assert.equal(isFounderSession(Object.assign({}, base, { customer_details: { email: 'test@dayhop.quest' } }), founder), true, 'any DayHop address');
  assert.equal(isFounderSession(Object.assign({}, base, { client_reference_id: 'owner-uuid', customer_details: {} }), founder), true, 'internal account');
  assert.equal(isFounderSession(base, founder), false, 'a real buyer stays');
});

test('the PDF renders every row and still carries no email or name', async () => {
  const rows = [
    shapeSession(base, { refKey: 'k' }),
    shapeSession(Object.assign({}, base, { status: 'expired', payment_status: 'unpaid' }), { refKey: 'k' })
  ];
  const report = { generated_on: '2026-10-19', since: null, rows, summary: summarize(rows), founder_excluded: 3, truncated: false };
  const pdf = await buildOrderReportPdf(report, { compress: false });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  // pdfkit writes page text as hex glyph strings, so check both forms.
  const text = pdf.toString('latin1');
  const hex = text.toLowerCase();
  assert.ok(text.includes('DayHop user report'), 'document title');
  for (const secret of ['buyer@example.com', 'Jane Buyer', 'cus_SECRET123', 'cs_live_a1b2c3']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
    assert.ok(!hex.includes(Buffer.from(secret, 'latin1').toString('hex')), `leaked ${secret} as glyphs`);
  }
});

const { signFileLink, verifyFileLink, LINK_TTL_MS } = require('../services/orderReport');
const linkQuery = url => Object.fromEntries(new URL(url, 'https://dayhop.quest').searchParams);

test('a signed report link opens the right file and nothing else', () => {
  const now = Date.parse('2026-10-19T15:00:00Z');
  const url = signFileLink({ format: 'pdf', since: '2026-09-01', now });
  assert.match(url, /^\/api\/admin\/reports\/orders\/file\?/);
  assert.deepEqual(verifyFileLink(linkQuery(url), now + 1000), { format: 'pdf', since: '2026-09-01' });
  const csv = signFileLink({ format: 'csv', now });
  assert.deepEqual(verifyFileLink(linkQuery(csv), now), { format: 'csv', since: null });
});

test('an expired or altered report link is refused', () => {
  const now = Date.parse('2026-10-19T15:00:00Z');
  const q = linkQuery(signFileLink({ format: 'pdf', now }));
  assert.equal(verifyFileLink(q, now + LINK_TTL_MS + 1), null, 'expired');
  assert.equal(verifyFileLink(Object.assign({}, q, { format: 'csv' }), now), null, 'format swapped');
  assert.equal(verifyFileLink(Object.assign({}, q, { since: '2020-01-01' }), now), null, 'range widened');
  assert.equal(verifyFileLink(Object.assign({}, q, { exp: String(Number(q.exp) + 86400000) }), now), null, 'expiry extended');
  assert.equal(verifyFileLink(Object.assign({}, q, { sig: 'x'.repeat(32) }), now), null, 'forged');
  assert.equal(verifyFileLink({}, now), null);
});

const { shapeSubscriber, shapeMembership, byMonth, periodLabel, personCode, NEWSLETTER_COLUMNS, MEMBERSHIP_COLUMNS } = require('../services/orderReport');

test('a newsletter subscriber becomes dates and a status, never an email', () => {
  const row = shapeSubscriber({
    email: 'Reader@Example.com', status: 'unsubscribed', consent_source: 'footer', owner_id: null,
    created_at: '2026-03-02T15:00:00Z', confirmed_at: '2026-03-02T15:05:00Z', unsubscribed_at: '2026-08-11T12:00:00Z'
  }, { refKey: 'k', cityForCode: () => 'Oakville' });
  assert.deepEqual(row, {
    customer: personCode('reader@example.com', 'k'), city: 'Oakville',
    signed_up: '2026-03-02', confirmed: '2026-03-02', unsubscribed: '2026-08-11', status: 'Unsubscribed', source: 'footer'
  });
  assert.ok(!JSON.stringify(row).toLowerCase().includes('reader@example.com'));
  assert.deepEqual(Object.keys(row).sort(), [...NEWSLETTER_COLUMNS].sort());
  assert.equal(shapeSubscriber({ email: 'x@y.z', status: 'pending', created_at: '2026-02-01T12:00:00Z' }).status, 'Signed up, never confirmed');
});

test('the same person has the same code at checkout and in the newsletter', () => {
  const checkout = shapeSession(base, { refKey: 'k' }).customer;
  const reader = shapeSubscriber({ email: 'BUYER@example.com', status: 'subscribed', created_at: '2026-05-01T12:00:00Z' }, { refKey: 'k' }).customer;
  assert.equal(checkout, reader);
});

test('a Pro membership row shows start, cancellation and end, never the customer', () => {
  const sec = iso => Date.parse(iso) / 1000;
  const row = shapeMembership({
    id: 'sub_X', status: 'active', livemode: true, created: sec('2026-06-01T14:00:00Z'), start_date: sec('2026-06-01T14:00:00Z'),
    trial_end: sec('2026-06-08T14:00:00Z'), canceled_at: sec('2026-09-20T14:00:00Z'), cancel_at_period_end: true,
    current_period_end: sec('2026-10-08T14:00:00Z'), cancel_at: sec('2026-10-08T14:00:00Z'),
    customer: { id: 'cus_X', email: 'member@example.com', address: { city: 'Barrie' } }
  }, { refKey: 'k' });
  assert.deepEqual(row, {
    customer: personCode('member@example.com', 'k'), city: 'Barrie', started: '2026-06-01', trial_ends: '2026-06-08',
    cancelled: '2026-09-20', ends: '2026-10-08', status: 'Cancelled, runs to its end date'
  });
  assert.deepEqual(Object.keys(row).sort(), [...MEMBERSHIP_COLUMNS].sort());
  assert.ok(!JSON.stringify(row).includes('member@example.com') && !JSON.stringify(row).includes('cus_X'));
  assert.equal(shapeMembership({ status: 'canceled', ended_at: sec('2026-07-01T12:00:00Z'), created: sec('2026-05-01T12:00:00Z'), customer: 'cus_Y' }).status, 'Ended');
  assert.equal(shapeMembership({ status: 'trialing', created: sec('2026-10-01T12:00:00Z'), customer: 'cus_Z' }).status, 'On free trial');
});

test('month by month covers every month of the period, quiet ones as zero', () => {
  const orders = [
    { date: '2026-01-15', acquired: true, amount: '5.00 CAD' },
    { date: '2026-01-20', acquired: false, amount: '5.00 CAD (unpaid)' },
    { date: '2026-03-03', acquired: true, amount: '20.00 CAD' }
  ];
  const newsletter = [{ signed_up: '2026-01-02', unsubscribed: '2026-03-09' }, { signed_up: '2025-12-30', unsubscribed: '' }];
  const memberships = [{ started: '2026-02-10', cancelled: '2026-03-01' }];
  const months = byMonth({ orders, newsletter, memberships, since: '2026-01-01', today: '2026-04-05' });
  assert.deepEqual(months.map(m => m.label), ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026']);
  assert.deepEqual(months.map(m => [m.acquired, m.attempted, m.revenue, m.signups, m.unsubscribes, m.memberships_started, m.memberships_cancelled]), [
    [1, 1, '5.00 CAD', 1, 0, 0, 0],
    [0, 0, '', 0, 0, 1, 0],
    [1, 0, '20.00 CAD', 0, 1, 0, 1],
    [0, 0, '', 0, 0, 0, 0]
  ]);
  assert.equal(periodLabel('2026-01-01', '2026-10-19'), 'January 1, 2026 to October 19, 2026');
  assert.equal(periodLabel(null, '2026-10-19'), 'All time to October 19, 2026');
});

test('the full PDF, with newsletter and membership pages, carries no email', async () => {
  const rows = [shapeSession(base, { refKey: 'k' })];
  const newsletter = [shapeSubscriber({ email: 'reader@example.com', status: 'unsubscribed', created_at: '2026-03-02T15:00:00Z', unsubscribed_at: '2026-08-11T12:00:00Z' }, { refKey: 'k' })];
  const memberships = [shapeMembership({ status: 'active', created: 1780000000, customer: { id: 'cus_M', email: 'member@example.com' } }, { refKey: 'k' })];
  const summary = summarize(rows);
  summary.newsletter = { signed_up: 1, confirmed: 0, unsubscribed: 1, subscribed_now: 0 };
  summary.memberships = { started: 1, cancelled: 0, active_now: 1 };
  summary.by_month = byMonth({ orders: rows, newsletter, memberships, since: '2026-01-01', today: '2026-10-19' });
  const report = { generated_on: '2026-10-19', since: '2026-01-01', period: periodLabel('2026-01-01', '2026-10-19'), rows, newsletter, memberships, summary, founder_excluded: 2, truncated: false };
  const pdf = await buildOrderReportPdf(report, { compress: false });
  const text = pdf.toString('latin1');
  const hex = text.toLowerCase();
  assert.ok(text.includes('DayHop user report'));
  for (const secret of ['reader@example.com', 'member@example.com', 'buyer@example.com', 'cus_M']) {
    assert.ok(!text.includes(secret) && !hex.includes(Buffer.from(secret, 'latin1').toString('hex')), `leaked ${secret}`);
  }
  const summaryText = formatSummary(report);
  assert.match(summaryText, /January 1, 2026 to October 19, 2026/);
  assert.match(summaryText, /Newsletter: 1 signed up, 0 confirmed, 1 unsubscribed/);
  assert.ok(!summaryText.includes('@'));
});
