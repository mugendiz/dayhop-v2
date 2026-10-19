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

function isFounderEmail(email, { emails = new Set() } = {}) {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && (emails.has(e) || e.endsWith('@dayhop.quest'));
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

function personCode(who, refKey = 'dayhop') {
  return 'C-' + crypto.createHmac('sha256', String(refKey)).update(String(who)).digest('hex').slice(0, 6);
}

const ymdOf = iso => (iso ? torontoStamp(Date.parse(iso) / 1000).date : '');
const ymdOfUnix = sec => (sec ? torontoStamp(sec).date : '');

/**
 * One newsletter subscriber as a report row: when they signed up, confirmed
 * and unsubscribed, never who. Pure.
 */
function shapeSubscriber(r, { cityForOwner = () => null, cityForCode = () => null, refKey = 'dayhop' } = {}) {
  const customer = personCode(String(r.email || '').trim().toLowerCase() || r.token || r.created_at, refKey);
  const city = (r.owner_id && cityForOwner(r.owner_id)) || cityForCode(customer) || 'Unknown';
  const status = r.status === 'unsubscribed' ? 'Unsubscribed' : r.status === 'subscribed' ? 'Subscribed' : 'Signed up, never confirmed';
  return {
    customer, city,
    signed_up: ymdOf(r.created_at),
    confirmed: ymdOf(r.confirmed_at),
    unsubscribed: ymdOf(r.unsubscribed_at),
    status,
    source: r.consent_source || ''
  };
}

/**
 * One Stripe subscription (customer expanded) as a report row: started,
 * trial end, cancelled on, ends. A cancellation at period end counts as an
 * unsubscribe on the day it was requested. Pure.
 */
function shapeMembership(sub, { cityForCode = () => null, refKey = 'dayhop' } = {}) {
  const cust = sub.customer && typeof sub.customer === 'object' ? sub.customer : {};
  const email = String(cust.email || '').trim().toLowerCase();
  const customer = personCode(email || cust.id || sub.customer || sub.id, refKey);
  const addressCity = cust.address && cust.address.city;
  const cancelled = sub.canceled_at || null;
  const endsAt = sub.ended_at || sub.cancel_at || (sub.cancel_at_period_end ? sub.current_period_end : null);
  let status;
  if (sub.status === 'canceled' || sub.ended_at) status = 'Ended';
  else if (cancelled || sub.cancel_at_period_end) status = 'Cancelled, runs to its end date';
  else if (sub.status === 'trialing') status = 'On free trial';
  else if (sub.status === 'active') status = 'Active';
  else status = String(sub.status || 'Unknown').replace(/_/g, ' ');
  return {
    customer,
    city: cityForCode(customer) || addressCity || 'Unknown',
    started: ymdOfUnix(sub.start_date || sub.created),
    trial_ends: ymdOfUnix(sub.trial_end),
    cancelled: ymdOfUnix(cancelled),
    ends: ymdOfUnix(endsAt),
    status
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "January 1, 2026 to October 19, 2026", or "All time to October 19, 2026". */
function periodLabel(since, today) {
  const nice = ymd => `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}, ${ymd.slice(0, 4)}`;
  return `${since ? nice(since) : 'All time'} to ${nice(today)}`;
}

/** Month by month: checkouts, newsletter and memberships side by side. */
function byMonth({ orders = [], newsletter = [], memberships = [], since = null, today }) {
  const months = new Map();
  const bump = (ymd, key, n = 1) => {
    if (!ymd || (since && ymd < since) || ymd > today) return;
    const m = ymd.slice(0, 7);
    const row = months.get(m) || { month: m, acquired: 0, attempted: 0, revenue_cents: 0, currency: '', signups: 0, unsubscribes: 0, memberships_started: 0, memberships_cancelled: 0 };
    row[key] += n;
    months.set(m, row);
  };
  for (const r of orders) {
    bump(r.date, r.acquired ? 'acquired' : 'attempted');
    const m = /^([\d.]+) ([A-Z]+)$/.exec(r.amount || '');
    if (r.acquired && m) { bump(r.date, 'revenue_cents', Math.round(Number(m[1]) * 100)); const row = months.get(r.date.slice(0, 7)); if (row) row.currency = m[2]; }
  }
  for (const r of newsletter) { bump(r.signed_up, 'signups'); bump(r.unsubscribed, 'unsubscribes'); }
  for (const r of memberships) { bump(r.started, 'memberships_started'); bump(r.cancelled, 'memberships_cancelled'); }
  // Every month of the period appears, empty ones included, so a quiet
  // month reads as zero rather than as missing.
  if (since) {
    for (let y = Number(since.slice(0, 4)), mo = Number(since.slice(5, 7)); `${y}-${String(mo).padStart(2, '0')}` <= today.slice(0, 7); mo === 12 ? (y++, mo = 1) : mo++) {
      const key = `${y}-${String(mo).padStart(2, '0')}`;
      if (!months.has(key)) months.set(key, { month: key, acquired: 0, attempted: 0, revenue_cents: 0, currency: '', signups: 0, unsubscribes: 0, memberships_started: 0, memberships_cancelled: 0 });
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(r => Object.assign(r, {
    label: `${MONTHS[Number(r.month.slice(5, 7)) - 1].slice(0, 3)} ${r.month.slice(0, 4)}`,
    revenue: r.revenue_cents ? money(r.revenue_cents, r.currency) : ''
  }));
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
  // Email first (lower-cased), so the same person carries the same code in
  // the checkout, newsletter and membership sections.
  const email = String(details.email || s.customer_email || '').trim().toLowerCase();
  const who = email || s.customer || owner || s.id;
  const discount = s.total_details && s.total_details.amount_discount ? s.total_details.amount_discount : 0;
  return {
    date, time,
    customer: personCode(who, refKey),
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
  const cityForOwner = id => cityByOwner.get(id) || null;
  const rows = sessions
    .map(s => shapeSession(s, { cityForOwner, refKey }))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  // A person's city from their checkouts, for the sections that have none.
  const cityByCode = new Map();
  for (const r of rows) if (r.city !== 'Unknown' && !cityByCode.has(r.customer)) cityByCode.set(r.customer, r.city);
  const cityForCode = code => cityByCode.get(code) || null;
  const today = torontoToday();
  const inWindow = (...dates) => dates.some(d => d && (!since || d >= since));

  // Newsletter: signups, confirmations and unsubscribes in the period.
  let newsletter = [];
  try {
    const subs = await require('./newsletter').exportRows();
    newsletter = subs
      .filter(r => includeFounder || !(isFounderEmail(r.email, founder) || (r.owner_id && founder.owners.has(String(r.owner_id)))))
      .map(r => shapeSubscriber(r, { cityForOwner, cityForCode, refKey }))
      .filter(r => inWindow(r.signed_up, r.confirmed, r.unsubscribed))
      .sort((a, b) => (b.unsubscribed || b.confirmed || b.signed_up).localeCompare(a.unsubscribed || a.confirmed || a.signed_up));
  } catch (err) {
    console.warn('[order-report] newsletter section unavailable:', err.message);
  }

  // Memberships: starts and cancellations (an unsubscribe from Pro).
  const memberships = [];
  try {
    let seen = 0;
    for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) {
      if (++seen > MAX_SESSIONS) break;
      if (!includeTest && sub.livemode === false) continue;
      const email = sub.customer && typeof sub.customer === 'object' ? sub.customer.email : null;
      if (!includeFounder && isFounderEmail(email, founder)) { founderExcluded++; continue; }
      const row = shapeMembership(sub, { cityForCode, refKey });
      if (inWindow(row.started, row.cancelled, row.ends)) memberships.push(row);
    }
    memberships.sort((a, b) => (b.cancelled || b.started).localeCompare(a.cancelled || a.started));
  } catch (err) {
    console.warn('[order-report] membership section unavailable:', err.message);
  }

  const summary = summarize(rows);
  const count = (list, key) => list.filter(r => r[key] && (!since || r[key] >= since)).length;
  summary.newsletter = {
    signed_up: count(newsletter, 'signed_up'),
    confirmed: count(newsletter, 'confirmed'),
    unsubscribed: count(newsletter, 'unsubscribed'),
    subscribed_now: newsletter.filter(r => r.status === 'Subscribed').length
  };
  summary.memberships = {
    started: count(memberships, 'started'),
    cancelled: count(memberships, 'cancelled'),
    active_now: memberships.filter(r => r.status === 'Active' || r.status === 'On free trial').length
  };
  summary.by_month = byMonth({ orders: rows, newsletter, memberships, since, today });
  return {
    generated_on: today, since, period: periodLabel(since, today),
    rows, newsletter, memberships, summary,
    founder_excluded: founderExcluded, truncated: scanned > MAX_SESSIONS
  };
}

/** Plain-text summary for the email body and quick reading on a phone. */
function formatSummary(report) {
  const s = report.summary;
  const nl = s.newsletter || {};
  const mem = s.memberships || {};
  const lines = [`DayHop user report, ${report.period || (report.since ? `since ${report.since}` : 'all time')} (generated ${report.generated_on})`, ''];
  lines.push(`Checkouts: ${s.orders} by ${s.people} people. ${s.acquired} acquired, ${s.attempted_only} attempted but not completed.`);
  lines.push(`Newsletter: ${nl.signed_up || 0} signed up, ${nl.confirmed || 0} confirmed, ${nl.unsubscribed || 0} unsubscribed.`);
  lines.push(`Memberships: ${mem.started || 0} started, ${mem.cancelled || 0} cancelled.`);
  lines.push(`Founder and team data removed: ${report.founder_excluded || 0} records.`, '');
  if ((s.by_month || []).length) {
    lines.push('MONTH BY MONTH (acquired / attempted / revenue / newsletter signups / unsubscribes / memberships started / cancelled)');
    for (const m of s.by_month) lines.push(`  ${m.label}: ${m.acquired} / ${m.attempted} / ${m.revenue || '0'} / ${m.signups} / ${m.unsubscribes} / ${m.memberships_started} / ${m.memberships_cancelled}`);
    lines.push('');
  }
  lines.push('BY PRODUCT');
  for (const p of s.by_product) lines.push(`  ${p.product}: ${p.acquired} acquired${p.revenue ? ` (${p.revenue})` : ''}, ${p.attempted_only} attempted`);
  lines.push('', 'BY CITY');
  for (const c of s.by_city) lines.push(`  ${c.city}: ${c.orders}`);
  lines.push('', 'EVERY CHECKOUT, NEWEST FIRST (no emails or names; C- codes are anonymous and stable per person)');
  for (const r of report.rows) {
    lines.push(`  ${r.date} ${r.time}  ${r.customer}  ${r.city}${r.country ? ` (${r.country})` : ''}  ${r.product}  ${r.outcome}${r.amount ? `  ${r.amount}` : ''}${r.discount ? `, ${r.discount} off` : ''}`);
  }
  if ((report.newsletter || []).length) {
    lines.push('', 'NEWSLETTER (signed up / confirmed / unsubscribed)');
    for (const r of report.newsletter) lines.push(`  ${r.customer}  ${r.city}  ${r.signed_up} / ${r.confirmed || 'never'} / ${r.unsubscribed || 'still subscribed'}  ${r.status}`);
  }
  if ((report.memberships || []).length) {
    lines.push('', 'MEMBERSHIPS (started / cancelled / ends)');
    for (const r of report.memberships) lines.push(`  ${r.customer}  ${r.city}  ${r.started} / ${r.cancelled || 'not cancelled'} / ${r.ends || 'open'}  ${r.status}`);
  }
  if (report.truncated) lines.push('', 'Stopped at 2000 checkouts; narrow the date to see older ones.');
  lines.push('', 'The PDF and CSVs attached have the same rows.');
  return lines.join('\n');
}

const NEWSLETTER_COLUMNS = ['customer', 'city', 'signed_up', 'confirmed', 'unsubscribed', 'status', 'source'];
const MEMBERSHIP_COLUMNS = ['customer', 'city', 'started', 'trial_ends', 'cancelled', 'ends', 'status'];
const csvOf = (cols, rows) => [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

// ---------- delivery ----------
// A file the phone can open. The admin panel fetched the PDF with an auth
// header and handed the browser a blob, which mobile browsers save as a
// nameless file nothing will open (founder, Oct 19: "its a js file cant
// open it"). Instead the panel asks for a signed link, valid for ten
// minutes, and simply navigates to it: the server answers with a real
// application/pdf and a .pdf filename, which every phone opens natively.
const LINK_TTL_MS = 10 * 60 * 1000;
function linkSecret() {
  const s = process.env.DIGEST_TRACK_SECRET || process.env.ADMIN_KEY || process.env.STRIPE_SECRET_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('No signing secret configured for report links.');
  return 'dayhop-dev-only';
}
const linkSig = (format, since, exp) =>
  crypto.createHmac('sha256', linkSecret()).update(`orders|${format}|${since || ''}|${exp}`).digest('hex').slice(0, 32);

function signFileLink({ format = 'pdf', since = null, now = Date.now() } = {}) {
  const exp = now + LINK_TTL_MS;
  const q = new URLSearchParams({ format, exp: String(exp), sig: linkSig(format, since, exp) });
  if (since) q.set('since', since);
  return `/api/admin/reports/orders/file?${q.toString()}`;
}

function verifyFileLink(query, now = Date.now()) {
  const format = query.format === 'csv' ? 'csv' : query.format === 'pdf' ? 'pdf' : null;
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(query.since || '')) ? query.since : null;
  const exp = Number(query.exp);
  if (!format || !Number.isFinite(exp) || exp < now) return null;
  const want = linkSig(format, since, exp);
  const got = String(query.sig || '');
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  return { format, since };
}

/** The once-a-day guard key for an emailed report of a given range. */
const reportGuardKey = since => `system-orders-${since || 'all'}`;

/** Email the report (summary text + PDF + CSVs) to the operator inbox. */
async function emailReport({ since = null } = {}) {
  const report = await buildOrderReport({ since });
  const pdf = await require('./orderReportPdf').buildOrderReportPdf(report);
  const text = formatSummary(report);
  const nl = report.summary.newsletter || {};
  const res = await require('./email').sendEmail({
    to: process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com',
    subject: `DayHop user report, ${report.period}: ${report.summary.acquired} acquired, ${report.summary.attempted_only} attempted, ${nl.unsubscribed || 0} unsubscribed`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    attachments: [
      { filename: `dayhop-user-report-${report.generated_on}.pdf`, content: pdf },
      { filename: `dayhop-checkouts-${report.generated_on}.csv`, content: Buffer.from(toCsv(report.rows), 'utf8') },
      { filename: `dayhop-newsletter-${report.generated_on}.csv`, content: Buffer.from(csvOf(NEWSLETTER_COLUMNS, report.newsletter || []), 'utf8') },
      { filename: `dayhop-memberships-${report.generated_on}.csv`, content: Buffer.from(csvOf(MEMBERSHIP_COLUMNS, report.memberships || []), 'utf8') }
    ]
  });
  if (res.sent) require('./analytics').recordEvent({ type: 'orders_report_emailed', ownerKey: reportGuardKey(since), meta: { orders: report.summary.orders } });
  return Object.assign({ orders: report.summary.orders }, res);
}

module.exports = {
  buildOrderReport, shapeSession, shapeSubscriber, shapeMembership, byMonth, periodLabel,
  summarize, toCsv, formatSummary, isFounderSession, isFounderEmail, personCode, COLUMNS,
  NEWSLETTER_COLUMNS, MEMBERSHIP_COLUMNS,
  signFileLink, verifyFileLink, emailReport, reportGuardKey, LINK_TTL_MS
};
