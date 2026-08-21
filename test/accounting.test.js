// test/accounting.test.js — the ledger math. Amount parsing, Stripe invoice
// and refund shaping (idempotency keys, zero-amount skips, promo invoices),
// income categorization, recurring materialization keys, and the P&L rollup,
// all from synthetic objects — no network, no DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAmountToCents, categorizeStripeIncome, ledgerEntryFromInvoice,
  ledgerEntriesFromRefundedCharge, recurringEntriesDue, computeSummary
} = require('../services/accounting');

// ---------- parseAmountToCents ----------

test('parses plain and formatted amounts to cents', () => {
  assert.equal(parseAmountToCents('12.34'), 1234);
  assert.equal(parseAmountToCents('0.5'), 50);
  assert.equal(parseAmountToCents('1,234.00'), 123400);
  assert.equal(parseAmountToCents('$99'), 9900);
  assert.equal(parseAmountToCents(7), 700);
});

test('rejects empty, negative, and non-numeric amounts', () => {
  for (const bad of ['', '-5', 'abc', '12.345', null, '0']) {
    assert.throws(() => parseAmountToCents(bad), undefined, `expected throw for ${JSON.stringify(bad)}`);
  }
});

// ---------- categorizeStripeIncome ----------

test('categorizes by customer id, sponsor winning ties', () => {
  const sponsors = new Set(['cus_sponsor', 'cus_both']);
  const members = new Set(['cus_member', 'cus_both']);
  assert.equal(categorizeStripeIncome('cus_sponsor', sponsors, members), 'sponsorship');
  assert.equal(categorizeStripeIncome('cus_member', sponsors, members), 'membership');
  assert.equal(categorizeStripeIncome('cus_both', sponsors, members), 'sponsorship');
  assert.equal(categorizeStripeIncome('cus_unknown', sponsors, members), 'uncategorized');
  assert.equal(categorizeStripeIncome(null, sponsors, members), 'uncategorized');
});

// ---------- ledgerEntryFromInvoice ----------

const PAID_AT = Math.floor(Date.parse('2026-08-10T15:00:00Z') / 1000);
const invoice = over => Object.assign({
  id: 'in_1',
  amount_paid: 500,
  currency: 'cad',
  created: PAID_AT - 60,
  status_transitions: { paid_at: PAID_AT },
  customer: 'cus_member',
  customer_email: 'member@example.com',
  number: 'DAYHOP-0001',
  subscription: 'sub_1'
}, over);

test('a paid invoice becomes a positive income row keyed by invoice id', () => {
  const row = ledgerEntryFromInvoice(invoice(), 'membership', 'stripe_webhook');
  assert.equal(row.direction, 'income');
  assert.equal(row.amount_cents, 500);
  assert.equal(row.currency, 'cad');
  assert.equal(row.external_id, 'in_1');
  assert.equal(row.occurred_at, new Date(PAID_AT * 1000).toISOString());
  assert.equal(row.stripe_customer_id, 'cus_member');
  assert.equal(row.category, 'membership');
});

test('occurred_at falls back to created when paid_at is missing', () => {
  const row = ledgerEntryFromInvoice(invoice({ status_transitions: {} }), 'membership', 'stripe_webhook');
  assert.equal(row.occurred_at, new Date((PAID_AT - 60) * 1000).toISOString());
});

test('zero-amount invoices ($0 trial, 100%-off promo) produce no row', () => {
  assert.equal(ledgerEntryFromInvoice(invoice({ amount_paid: 0 }), 'membership', 'stripe_webhook'), null);
});

test('a promo-discounted invoice records amount_paid, not the sticker price', () => {
  // $5 price, 50%-off coupon → Stripe says amount_paid 250.
  const row = ledgerEntryFromInvoice(invoice({ amount_paid: 250 }), 'membership', 'stripe_webhook');
  assert.equal(row.amount_cents, 250);
});

// ---------- ledgerEntriesFromRefundedCharge ----------

const refundedCharge = refunds => ({
  id: 'ch_1',
  currency: 'cad',
  created: PAID_AT,
  customer: 'cus_member',
  billing_details: { email: 'member@example.com' },
  refunds: { data: refunds }
});

test('each refund becomes its own negative income row keyed by refund id', () => {
  const rows = ledgerEntriesFromRefundedCharge(refundedCharge([
    { id: 're_1', amount: 200, currency: 'cad', created: PAID_AT + 100 },
    { id: 're_2', amount: 300, currency: 'cad', created: PAID_AT + 200 }
  ]), 'membership');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.external_id), ['re_1', 're_2']);
  assert.deepEqual(rows.map(r => r.amount_cents), [-200, -300]);
  assert.equal(rows[0].direction, 'income');
});

test('re-processing the same charge yields the same external_ids (idempotency contract)', () => {
  const charge = refundedCharge([{ id: 're_1', amount: 500, currency: 'cad', created: PAID_AT }]);
  const a = ledgerEntriesFromRefundedCharge(charge, 'membership');
  const b = ledgerEntriesFromRefundedCharge(charge, 'membership');
  assert.deepEqual(a.map(r => r.external_id), b.map(r => r.external_id));
});

// ---------- recurringEntriesDue ----------

const template = over => Object.assign({
  id: 'render-hosting', vendor: 'Render', category: 'hosting',
  amount_cents: 700, currency: 'cad', day_of_month: 5, active: true
}, over);

test('a template is due only once its day of month has passed', () => {
  assert.equal(recurringEntriesDue([template()], { year: 2026, month: 8, day: 3 }).length, 0);
  const onDay = recurringEntriesDue([template()], { year: 2026, month: 8, day: 5 });
  const later = recurringEntriesDue([template()], { year: 2026, month: 8, day: 20 });
  assert.equal(onDay.length, 1);
  // Same month key whenever in the month it runs → the upsert dedupes.
  assert.equal(onDay[0].external_id, 'rec:render-hosting:2026-08');
  assert.equal(later[0].external_id, 'rec:render-hosting:2026-08');
  assert.equal(onDay[0].direction, 'expense');
  assert.equal(onDay[0].amount_cents, 700);
});

test('inactive templates are skipped', () => {
  assert.equal(recurringEntriesDue([template({ active: false })], { year: 2026, month: 8, day: 20 }).length, 0);
});

// ---------- computeSummary ----------

const entry = over => Object.assign({
  direction: 'income', amount_cents: 500, fee_cents: null,
  currency: 'cad', occurred_at: '2026-08-10T15:00:00Z', category: 'membership'
}, over);

test('rolls up income, expenses, fees, categories, and net', () => {
  const s = computeSummary([
    entry(),
    entry({ amount_cents: 9900, category: 'sponsorship', fee_cents: 317 }),
    entry({ amount_cents: -500, category: 'membership' }),                    // refund
    entry({ direction: 'expense', amount_cents: 700, category: 'hosting' }),
    entry({ direction: 'expense', amount_cents: 2000, category: 'marketing' })
  ]);
  const cad = s.by_currency.CAD;
  assert.equal(cad.income_cents, 9900); // 500 + 9900 - 500
  assert.equal(cad.expense_cents, 2700);
  assert.equal(cad.net_cents, 7200);
  assert.equal(cad.fee_cents, 317);
  assert.equal(cad.income_by_category.membership, 0); // refund cancelled it
  assert.equal(cad.income_by_category.sponsorship, 9900);
  assert.equal(cad.expense_by_category.hosting, 700);
  assert.equal(s.count, 5);
});

test('buckets months in order across a year boundary', () => {
  const s = computeSummary([
    entry({ occurred_at: '2026-01-15T00:00:00Z', amount_cents: 100 }),
    entry({ occurred_at: '2025-12-20T00:00:00Z', amount_cents: 200 }),
    entry({ occurred_at: '2026-01-02T00:00:00Z', direction: 'expense', amount_cents: 50 })
  ]);
  const months = s.by_currency.CAD.months;
  assert.deepEqual(months.map(m => m.month), ['2025-12', '2026-01']);
  assert.equal(months[1].income_cents, 100);
  assert.equal(months[1].expense_cents, 50);
  assert.equal(months[1].net_cents, 50);
});

test('keeps currencies in separate buckets, never converted', () => {
  const s = computeSummary([
    entry(),
    entry({ currency: 'usd', amount_cents: 9900, category: 'sponsorship' })
  ]);
  assert.equal(s.by_currency.CAD.income_cents, 500);
  assert.equal(s.by_currency.USD.income_cents, 9900);
});
