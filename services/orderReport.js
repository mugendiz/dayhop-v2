// services/orderReport.js — DayHop V2
// The customer and orders report: every Stripe Checkout session (city guide
// purchases, Pro memberships, sponsor checkouts through payment links), with
// the date, the product, whether it was bought or only attempted, and the
// buyer's CITY. Never an email, a name, a phone number or a raw Stripe id.
//
// Why Stripe and not our own tables: a checkout that was opened and then
// abandoned exists nowhere else. Stripe keeps every session, complete or
// expired, so it is the one place where "attempted" is a fact rather than a
// guess. A sale made by a manually sent invoice is not a Checkout session
// and does not appear here; the accounting ledger has those.
//
// City, in order of trust:
//   1. the city this account most often browses or plans in on DayHop
//      (services/analytics.js userActivity, keyed by client_reference_id);
//   2. the city on the Stripe billing address, when Checkout collected one;
//   3. otherwise "Unknown", with the card country when Stripe has it.
//
// Each buyer gets a short pseudonymous code ("C-3f9a1c"): an HMAC of the
// Stripe customer, so the same person's three attempts and one purchase
// line up in the report without the report ever naming them. The key is
// the server's Stripe secret, so the code cannot be reversed from outside.

const crypto = require('crypto');
const cityGuides = require('./cityGuides');
const { torontoToday } = require('./spotlight');

const MAX_SESSIONS = 2000;

// Founder and team checkouts are test purchases, not customers (founder
// ask, Oct 19: "remove founder data"). A session is the founder's when its
// email is a DayHop admin, team member, operator inbox, a FOUNDER_EMAILS
// entry or any @dayhop.quest address, or when it was opened by an account
// analytics already marks internal (INTERNAL_OWNERS, internal IPs). The
// emails are compared here on the server and never written anywhere.
function isFounderSession(s, { emails = new Set(), owners = new Set() } = {}) {
  const seen = [s.customer_details && s.customer_details.email, s.customer_email]
    .filter(Boolean).map(e => String(e).trim().toLowerCase());
  if (seen.some(e => emails.has(e) || e.endsWith('@dayhop.quest'))) return true;
  return Boolean(s.client_reference_id && owners.has(String(s.client_reference_id)));
}

async function founderIdentity(users) {
  const emails = new Set();
  const add = e => { if (e) emails.add(String(e).trim().toLowerCase()); };
  String(process.env.ADMIN_EMAILS || '').split(',').forEach(add);
  String(process.env.FOUNDER_EMAILS || '').split(',').forEach(add);
  add(process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com');
  try { require('./entitlements').ADMIN_EMAILS.forEach(add); } catch { /* env list above still applies */ }
  try { (await require('./outreach').listTeam()).forEach(m => add(m.email)); } catch (err) {
    console.warn('[order-report] team list unavailable:', err.message);
  }
  emails.delete('');
  const owners = new Set((users || []).filter(u => u.internal).map(u => String(u.owner_key)));
  String(process.env.INTERNAL_OWNERS || '').split(',').map(x => x.trim()).filter(Boolean).forEach(o => owners.add(o));
  return { emails, owners };
}
const TORONTO_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
});

function torontoStamp(unixSeconds) {
  const p = Object.fromEntries(TORONTO_TIME.formatToParts(new Date(unixSeconds * 1000)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

function productFor(s) {
  const meta = s.metadata || {};
  if (meta.guide) {
    if (meta.guide === cityGuides.BUNDLE.slug) return { product: cityGuides.BUNDLE.title, kind: 'City guide bundle' };
    const g = cityGuides.bySlug(meta.guide);
    return { product: g ? g.title : `City guide (${meta.guide})`, kind: 'City guide' };
  }
  const items = s.line_items && Array.isArray(s.line_items.data) ? s.line_items.data : [];
  // A Checkout line item's description is the product name (Stripe's
  // expansion depth stops short of price.product from a session list).
  const names = items.map(i => i.description).filter(Boolean);
  if (s.mode === 'subscription') {
    return { product: names[0] || 'DayHop Pro membership', kind: /spotlight|sponsor|partner|featured/i.test(names.join(' ')) ? 'Sponsorship' : 'Membership' };
  }
  return { product: names.join(' + ') || 'One-time purchase', kind: 'Other' };
}

/**
 * Bought, trial, free with a code, or only attempted. Stripe's own words
 * underneath: status complete/expired/open, payment_status paid/unpaid/
 * no_payment_required.
 */
function outcomeFor(s) {
  if (s.status === 'complete') {
    if (s.payment_status === 'paid') return { outcome: 'Purchased', acquired: true };
    if (s.payment_status === 'no_payment_required') {
      return s.mode === 'subscription'
        ? { outcome: 'Free trial started', acquired: true }
        : { outcome: 'Acquired free (100% promo code)', acquired: true };
    }
    return { outcome: 'Completed, payment pending', acquired: false };
  }
  if (s.status === 'expired') return { outcome: 'Attempted, abandoned at checkout', acquired: false };
  return { outcome: 'Attempted, checkout still open', acquired: false };
}

function money(cents, currency) {
  if (cents == null) return '';
  return `${(cents / 100).toFixed(2)} ${String(currency || '').toUpperCase()}`.trim();
}

/**
 * One report row from one Checkout session. Pure. The only identifying
 * input it reads is used for the pseudonymous code and the city lookup,
 * and neither ever reaches the row.
 */
function shapeSession(s, { cityForOwner = () => null, refKey = 'dayhop' } = {}) {
  const { date, time } = torontoStamp(s.created);
  const { product, kind } = productFor(s);
  const { outcome, acquired } = outcomeFor(s);
  const details = s.customer_details || {};
  const address = details.address || {};
  const owner = s.client_reference_id || null;
  const fromActivity = owner ? cityForOwner(owner) : null;
  const city = fromActivity || address.city || null;
  const who = s.customer || details.email || owner || s.id;
  const discount = s.total_details && s.total_details.amount_discount ? s.total_details.amount_discount : 0;
  return {
    date, time,
    customer: 'C-' + crypto.createHmac('sha256', String(refKey)).update(String(who)).digest('hex').slice(0, 6),
    city: city || 'Unknown',
    country: address.country || null,
    city_source: fromActivity ? 'DayHop activity' : address.city ? 'Stripe billing address' : 'none',
    signed_in: Boolean(owner),
    product, kind, outcome, acquired,
    // An abandoned checkout still has a total; label it so it never reads
    // as money received. Revenue in summarize() counts acquired rows only.
    amount: acquired || !s.amount_total ? money(s.amount_total, s.currency) : `${money(s.amount_total, s.currency)} (unpaid)`,
    discount: discount ? money(discount, s.currency) : '',
    source: (s.metadata && (s.metadata.src || s.metadata.utm_source)) || ''
  };
}

function summarize(rows) {
  const byProduct = new Map();
  for (const r of rows) {
    const p = byProduct.get(r.product) || { product: r.product, acquired: 0, attempted_only: 0, revenue_cents: 0, currency: '' };
    if (r.acquired) p.acquired++; else p.attempted_only++;
    const m = /^([\d.]+) ([A-Z]+)$/.exec(r.amount || '');
    if (r.acquired && m) { p.revenue_cents += Math.round(Number(m[1]) * 100); p.currency = m[2]; }
    byProduct.set(r.product, p);
  }
  const people = new Set(rows.map(r => r.customer));
  const buyers = new Set(rows.filter(r => r.acquired).map(r => r.customer));
  const cities = new Map();
  for (const r of rows) cities.set(r.city, (cities.get(r.city) || 0) + 1);
  return {
    orders: rows.length,
    acquired: rows.filter(r => r.acquired).length,
    attempted_only: rows.filter(r => !r.acquired).length,
    people: people.size,
    people_who_acquired: buyers.size,
    by_product: [...byProduct.values()].map(p => Object.assign(p, { revenue: money(p.revenue_cents, p.currency) })),
    by_city: [...cities.entries()].sort((a, b) => b[1] - a[1]).map(([city, orders]) => ({ city, orders }))
  };
}

const COLUMNS = ['date', 'time', 'customer', 'city', 'country', 'city_source', 'signed_in', 'product', 'kind', 'outcome', 'amount', 'discount', 'source'];
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows) {
  return [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

/**
 * The report. `since` is a Toronto date (YYYY-MM-DD); default is everything
 * Stripe holds. Test-mode sessions are left out unless includeTest.
 */
async function buildOrderReport({ since = null, includeTest = false, includeFounder = false } = {}) {
  const billing = require('./billing');
  if (!billing.isConfigured()) throw Object.assign(new Error('Stripe is not configured'), { code: 'NOT_CONFIGURED' });
  const stripe = billing.getStripe();

  // City by account, from DayHop's own activity rollup.
  const cityByOwner = new Map();
  let users = [];
  try {
    ({ users } = await require('./analytics').userActivity(5000));
    for (const u of users) if (u.top_city) cityByOwner.set(u.owner_key, u.top_city);
  } catch (err) {
    console.warn('[order-report] activity cities unavailable:', err.message);
  }
  const founder = await founderIdentity(users);

  const params = { limit: 100, expand: ['data.line_items'] };
  // Midnight Toronto standard time; in summer this starts an hour early,
  // which only ever includes an extra hour, never drops one.
  if (since) params.created = { gte: Math.floor(Date.parse(`${since}T05:00:00Z`) / 1000) };
  const sessions = [];
  let founderExcluded = 0;
  let scanned = 0;
  for await (const s of stripe.checkout.sessions.list(params)) {
    if (++scanned > MAX_SESSIONS) break;
    if (!includeTest && s.livemode === false) continue;
    if (!includeFounder && isFounderSession(s, founder)) { founderExcluded++; continue; }
    sessions.push(s);
  }

  const refKey = process.env.STRIPE_SECRET_KEY || 'dayhop';
  const rows = sessions
    .map(s => shapeSession(s, { cityForOwner: id => cityByOwner.get(id) || null, refKey }))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return { generated_on: torontoToday(), since, rows, summary: summarize(rows), founder_excluded: founderExcluded, truncated: scanned > MAX_SESSIONS };
}

/** Plain-text summary for the email body and quick reading on a phone. */
function formatSummary(report) {
  const s = report.summary;
  const lines = [`DayHop customers and orders, ${report.since ? `since ${report.since}` : 'all time'} (generated ${report.generated_on})`, ''];
  lines.push(`${s.orders} checkouts by ${s.people} people: ${s.acquired} acquired, ${s.attempted_only} attempted but not completed.`);
  lines.push(`${s.people_who_acquired} of ${s.people} people ended up with something.`);
  lines.push(`Founder and team checkouts removed: ${report.founder_excluded || 0}.`, '');
  lines.push('BY PRODUCT');
  for (const p of s.by_product) lines.push(`  ${p.product}: ${p.acquired} acquired${p.revenue ? ` (${p.revenue})` : ''}, ${p.attempted_only} attempted`);
  lines.push('', 'BY CITY');
  for (const c of s.by_city) lines.push(`  ${c.city}: ${c.orders}`);
  lines.push('', 'EVERY CHECKOUT, NEWEST FIRST (no emails or names; C- codes are anonymous and stable per person)');
  for (const r of report.rows) {
    lines.push(`  ${r.date} ${r.time}  ${r.customer}  ${r.city}${r.country ? ` (${r.country})` : ''}  ${r.product}  ${r.outcome}${r.amount ? `  ${r.amount}` : ''}${r.discount ? `, ${r.discount} off` : ''}`);
  }
  if (report.truncated) lines.push('', 'Stopped at 2000 checkouts; narrow the date to see older ones.');
  lines.push('', 'The PDF and CSV attached have the same rows.');
  return lines.join('\n');
}

module.exports = { buildOrderReport, shapeSession, summarize, toCsv, formatSummary, isFounderSession, COLUMNS };
