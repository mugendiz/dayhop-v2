// services/accounting.js — DayHop V2 (single-entry ledger + P&L)
// One row in public.ledger_entries per money movement, signed integer cents:
// income lands automatically from Stripe (webhook + backfill; refunds are
// negative income so sums never need special cases), expenses come from the
// admin panel or monthly recurring templates. Idempotency rides on the
// nullable-unique external_id column (Stripe invoice/refund id, or
// rec:<template>:<YYYY-MM>), so webhook re-delivery, backfill re-runs, and
// scheduler catch-ups are all no-ops.
//
// Requires the Supabase service key; the table is RLS-deny-all to clients.
// Money math lives in pure functions (tested in test/accounting.test.js);
// everything below the IO marker touches the DB or Stripe.

const dbClient = require('./db/client');

function hasServiceKey() {
  return dbClient.status().service_key === true;
}
function db() {
  return dbClient.getClient();
}

let _stripe = null;
function getStripe() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Suggested buckets for the panel's category <select>; the column is free
// text so re-categorizing never fights a check constraint.
const INCOME_CATEGORIES = ['membership', 'sponsorship', 'affiliate', 'other_income', 'uncategorized'];
const EXPENSE_CATEGORIES = ['hosting', 'ai', 'email', 'marketing', 'software', 'domain', 'fees', 'legal', 'general'];

// ---------- Pure helpers (unit-tested, no IO) ----------

/** '12.34' | '1,234' | '$5' -> integer cents. Throws on anything else. */
function parseAmountToCents(input) {
  const cleaned = String(input == null ? '' : input).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error('amount must be a positive number like 12.34');
  }
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1e9) {
    throw new Error('amount out of range');
  }
  return cents;
}

/** Sponsor beats member when a customer id is somehow both. */
function categorizeStripeIncome(customerId, sponsorIds, memberIds) {
  if (customerId && sponsorIds && sponsorIds.has(customerId)) return 'sponsorship';
  if (customerId && memberIds && memberIds.has(customerId)) return 'membership';
  return 'uncategorized';
}

/**
 * Paid Stripe invoice -> ledger row, or null for zero-amount invoices
 * ($0 trials, 100%-off promos). amount_paid is the truth, never the price.
 */
function ledgerEntryFromInvoice(invoice, category, source) {
  if (!invoice || !invoice.id) return null;
  const amount = Math.round(Number(invoice.amount_paid || 0));
  if (!amount) return null;
  const paidAt = invoice.status_transitions && invoice.status_transitions.paid_at;
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : (invoice.customer && invoice.customer.id) || null;
  return {
    direction: 'income',
    amount_cents: amount,
    currency: String(invoice.currency || 'cad').toLowerCase(),
    occurred_at: new Date((paidAt || invoice.created || 0) * 1000).toISOString(),
    category: category || 'uncategorized',
    source: source || 'stripe_webhook',
    external_id: invoice.id,
    stripe_customer_id: customerId,
    counterparty: invoice.customer_email || null,
    description: invoice.number ? `Stripe invoice ${invoice.number}` : 'Stripe invoice',
    meta: { subscription: invoice.subscription || null }
  };
}

/** One Stripe refund object -> one negative-income row (null if zero). */
function ledgerEntryFromRefund(refund, { charge, category, source, customerId, email } = {}) {
  if (!refund || !refund.id) return null;
  const amount = Math.abs(Math.round(Number(refund.amount || 0)));
  if (!amount) return null;
  return {
    direction: 'income',
    amount_cents: -amount,
    currency: String(refund.currency || 'cad').toLowerCase(),
    occurred_at: new Date((refund.created || 0) * 1000).toISOString(),
    category: category || 'uncategorized',
    source: source || 'stripe_webhook',
    external_id: refund.id,
    stripe_customer_id: customerId || null,
    counterparty: email || null,
    description: charge ? `Stripe refund for ${charge}` : 'Stripe refund',
    meta: charge ? { charge } : null
  };
}

/** charge.refunded event object -> rows keyed by refund id (idempotent). */
function ledgerEntriesFromRefundedCharge(charge, category, source) {
  if (!charge) return [];
  const refunds = (charge.refunds && charge.refunds.data) || [];
  const customerId = typeof charge.customer === 'string'
    ? charge.customer
    : (charge.customer && charge.customer.id) || null;
  const email = (charge.billing_details && charge.billing_details.email) || null;
  return refunds
    .map(r => ledgerEntryFromRefund(r, { charge: charge.id, category, source, customerId, email }))
    .filter(Boolean);
}

/**
 * Which recurring templates owe this month an entry, given a Toronto date
 * {year, month, day}. The rec:<id>:<YYYY-MM> key means running this daily,
 * hourly, or after a two-week sleep all lands the same single row.
 */
function recurringEntriesDue(templates, today) {
  const monthKey = `${today.year}-${String(today.month).padStart(2, '0')}`;
  return (templates || [])
    .filter(t => t && t.active && Number(t.day_of_month) <= Number(today.day))
    .map(t => ({
      direction: 'expense',
      amount_cents: Math.abs(Math.round(Number(t.amount_cents))),
      currency: String(t.currency || 'cad').toLowerCase(),
      occurred_at: new Date(Date.UTC(today.year, today.month - 1, Number(t.day_of_month), 12)).toISOString(),
      category: t.category || 'general',
      source: 'recurring',
      external_id: `rec:${t.id}:${monthKey}`,
      counterparty: t.vendor,
      description: t.note || `${t.vendor} (recurring)`,
      created_by: 'scheduler'
    }))
    .filter(r => r.amount_cents > 0);
}

/**
 * Ledger rows -> P&L shape, bucketed per currency (never converted):
 * { by_currency: { CAD: { income_cents, expense_cents, net_cents, fee_cents,
 *   income_by_category, expense_by_category, months: [...] } }, count }.
 * Signed income means refunds subtract with no special case.
 */
function computeSummary(rows) {
  const byCurrency = {};
  for (const row of rows || []) {
    const cur = String(row.currency || 'cad').toUpperCase();
    const b = byCurrency[cur] || (byCurrency[cur] = {
      income_cents: 0, expense_cents: 0, net_cents: 0, fee_cents: 0,
      income_by_category: {}, expense_by_category: {}, _months: {}
    });
    const amount = Math.round(Number(row.amount_cents) || 0);
    const month = String(row.occurred_at || '').slice(0, 7);
    const m = b._months[month] || (b._months[month] = { month, income_cents: 0, expense_cents: 0, net_cents: 0 });
    const cat = row.category || 'uncategorized';
    if (row.direction === 'expense') {
      b.expense_cents += amount;
      b.expense_by_category[cat] = (b.expense_by_category[cat] || 0) + amount;
      m.expense_cents += amount;
    } else {
      b.income_cents += amount;
      b.income_by_category[cat] = (b.income_by_category[cat] || 0) + amount;
      m.income_cents += amount;
    }
    b.fee_cents += Math.round(Number(row.fee_cents) || 0);
  }
  for (const b of Object.values(byCurrency)) {
    b.net_cents = b.income_cents - b.expense_cents;
    b.months = Object.values(b._months)
      .sort((a, z) => a.month.localeCompare(z.month))
      .map(m => Object.assign(m, { net_cents: m.income_cents - m.expense_cents }));
    delete b._months;
  }
  return { by_currency: byCurrency, count: (rows || []).length };
}

// ---------- IO: Supabase + Stripe ----------

function isConfigured() {
  return hasServiceKey();
}

/**
 * Idempotent bulk upsert keyed on external_id (duplicates silently skipped).
 * NEVER throws — the Stripe webhook must stay 2xx on a DB hiccup (backfill
 * is the safety net), so failures warn and return 0.
 */
async function recordStripeEntries(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return 0;
  if (!hasServiceKey()) {
    console.warn('[accounting] no service key — ledger rows dropped (backfill later)');
    return 0;
  }
  try {
    const { data, error } = await db().from('ledger_entries')
      .upsert(list, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    return (data || []).length;
  } catch (err) {
    console.warn('[accounting] ledger write failed:', err.message);
    return 0;
  }
}

/**
 * Customer-id sets for categorization. Sponsors come from the in-memory
 * sponsors cache (may be empty on the very first call after a cold start —
 * those land as 'uncategorized' and are re-categorizable in the panel).
 */
async function customerIndex() {
  const sponsors = new Set();
  try {
    for (const s of require('./sponsors').list()) {
      if (s.stripe_customer_id) sponsors.add(s.stripe_customer_id);
    }
  } catch (err) { /* sponsors optional */ }
  const members = new Set();
  if (hasServiceKey()) {
    try {
      const { data } = await db().from('subscriptions').select('stripe_customer_id').limit(5000);
      for (const r of data || []) if (r.stripe_customer_id) members.add(r.stripe_customer_id);
    } catch (err) {
      console.warn('[accounting] member index failed:', err.message);
    }
  }
  return { sponsors, members };
}

async function categorizeCustomer(customerId) {
  const index = await customerIndex();
  return categorizeStripeIncome(customerId, index.sponsors, index.members);
}

async function addManualExpense({ vendor, category, amount_cents, currency, occurred_on, note } = {}, actor) {
  if (!hasServiceKey()) throw new Error('service key required');
  const who = String(vendor || '').trim();
  if (!who) throw new Error('vendor is required');
  const cents = Math.round(Number(amount_cents));
  if (!Number.isInteger(cents) || cents <= 0 || cents > 1e9) throw new Error('amount must be positive');
  const occurred = occurred_on ? new Date(`${occurred_on}T12:00:00Z`) : new Date();
  if (Number.isNaN(occurred.getTime())) throw new Error('invalid date');
  const row = {
    direction: 'expense',
    amount_cents: cents,
    currency: String(currency || 'cad').toLowerCase().slice(0, 8),
    occurred_at: occurred.toISOString(),
    category: String(category || 'general').trim().toLowerCase() || 'general',
    source: 'manual',
    counterparty: who.slice(0, 200),
    description: note ? String(note).slice(0, 500) : null,
    created_by: actor || null
  };
  const { data, error } = await db().from('ledger_entries').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function listEntries({ from, to, limit = 200 } = {}) {
  if (!hasServiceKey()) return [];
  let q = db().from('ledger_entries').select('*').order('occurred_at', { ascending: false }).limit(limit);
  if (from) q = q.gte('occurred_at', from);
  if (to) q = q.lte('occurred_at', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function setCategory(id, category) {
  if (!hasServiceKey()) throw new Error('service key required');
  const cat = String(category || '').trim().toLowerCase();
  if (!cat || cat.length > 40) throw new Error('invalid category');
  const { data, error } = await db().from('ledger_entries')
    .update({ category: cat }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Manual and recurring rows only — Stripe-sourced rows are the audit trail. */
async function deleteEntry(id) {
  if (!hasServiceKey()) throw new Error('service key required');
  const { data: row, error: readErr } = await db().from('ledger_entries')
    .select('id, source').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  if (!row) throw new Error('entry not found');
  if (row.source !== 'manual' && row.source !== 'recurring') {
    throw new Error('Stripe-sourced entries cannot be deleted');
  }
  const { error } = await db().from('ledger_entries').delete().eq('id', id);
  if (error) throw error;
  return true;
}

async function listRecurring() {
  if (!hasServiceKey()) return [];
  const { data, error } = await db().from('recurring_expenses').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

async function upsertRecurring({ id, vendor, category, amount_cents, currency, day_of_month, note } = {}, actor) {
  if (!hasServiceKey()) throw new Error('service key required');
  const who = String(vendor || '').trim();
  if (!who) throw new Error('vendor is required');
  const slug = String(id || who).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!slug) throw new Error('invalid id');
  const cents = Math.round(Number(amount_cents));
  if (!Number.isInteger(cents) || cents <= 0 || cents > 1e9) throw new Error('amount must be positive');
  const day = Math.round(Number(day_of_month || 1));
  if (day < 1 || day > 28) throw new Error('day of month must be 1-28');
  const row = {
    id: slug, vendor: who.slice(0, 200),
    category: String(category || 'general').trim().toLowerCase() || 'general',
    amount_cents: cents,
    currency: String(currency || 'cad').toLowerCase().slice(0, 8),
    day_of_month: day,
    note: note ? String(note).slice(0, 500) : null,
    active: true,
    created_by: actor || null
  };
  const { data, error } = await db().from('recurring_expenses')
    .upsert(row, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}

async function setRecurringActive(id, active) {
  if (!hasServiceKey()) throw new Error('service key required');
  const { data, error } = await db().from('recurring_expenses')
    .update({ active: Boolean(active) }).eq('id', String(id)).select().single();
  if (error) throw error;
  return data;
}

function torontoToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** Post this month's due recurring expenses. Idempotent; safe to call often. */
async function materializeRecurring() {
  if (!hasServiceKey()) return 0;
  const rows = recurringEntriesDue(await listRecurring(), torontoToday());
  const inserted = await recordStripeEntries(rows);
  if (inserted) console.log(`[accounting] materialized ${inserted} recurring expense(s)`);
  return inserted;
}

async function summary({ from, to } = {}) {
  if (!hasServiceKey()) return { by_currency: {}, count: 0, from, to };
  // Explicit limit: supabase-js silently caps unspecified selects at 1000.
  let q = db().from('ledger_entries')
    .select('direction, amount_cents, fee_cents, currency, occurred_at, category')
    .limit(10000);
  if (from) q = q.gte('occurred_at', from);
  if (to) q = q.lte('occurred_at', to);
  const { data, error } = await q;
  if (error) throw error;
  return Object.assign(computeSummary(data || []), { from: from || null, to: to || null });
}

/**
 * Fill the ledger from Stripe history (webhook rows only exist from deploy
 * time onward). Pages paid invoices + refunds since `since`; idempotent, so
 * re-running any time is safe. Backfilled refunds land 'uncategorized'
 * (refund objects don't carry the customer) — re-categorize in the panel.
 */
async function backfill({ since } = {}) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  if (!hasServiceKey()) throw new Error('service key required');
  let gte;
  if (since) {
    gte = Math.floor(Date.parse(since) / 1000);
    if (!Number.isFinite(gte)) throw new Error('invalid since date');
  }
  const index = await customerIndex();
  let invoices_seen = 0, refunds_seen = 0, inserted = 0;

  let after;
  for (let page = 0; page < 20; page++) {
    const res = await stripe.invoices.list(Object.assign(
      { status: 'paid', limit: 100 },
      gte ? { created: { gte } } : {},
      after ? { starting_after: after } : {}
    ));
    const rows = [];
    for (const inv of res.data) {
      invoices_seen++;
      const customerId = typeof inv.customer === 'string' ? inv.customer : (inv.customer && inv.customer.id) || null;
      const category = categorizeStripeIncome(customerId, index.sponsors, index.members);
      rows.push(ledgerEntryFromInvoice(inv, category, 'stripe_backfill'));
    }
    inserted += await recordStripeEntries(rows);
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }

  after = undefined;
  for (let page = 0; page < 20; page++) {
    const res = await stripe.refunds.list(Object.assign(
      { limit: 100 },
      gte ? { created: { gte } } : {},
      after ? { starting_after: after } : {}
    ));
    const rows = [];
    for (const r of res.data) {
      refunds_seen++;
      rows.push(ledgerEntryFromRefund(r, { charge: r.charge || null, source: 'stripe_backfill' }));
    }
    inserted += await recordStripeEntries(rows);
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }

  console.log(`[accounting] backfill: ${invoices_seen} invoices, ${refunds_seen} refunds, ${inserted} new ledger rows`);
  return { invoices_seen, refunds_seen, inserted };
}

module.exports = {
  // pure (tested)
  parseAmountToCents, categorizeStripeIncome, ledgerEntryFromInvoice,
  ledgerEntryFromRefund, ledgerEntriesFromRefundedCharge,
  recurringEntriesDue, computeSummary,
  // IO
  isConfigured, recordStripeEntries, categorizeCustomer, addManualExpense,
  listEntries, setCategory, deleteEntry,
  listRecurring, upsertRecurring, setRecurringActive, materializeRecurring,
  summary, backfill,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES
};
