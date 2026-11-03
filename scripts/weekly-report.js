// scripts/weekly-report.js — the Monday numbers for the 30-day plan
// (Nov 4 to Dec 3, 2026): did outside people come, did any of them try to
// buy, did anyone pay, and is the list growing. Every line names its source
// and window (CLAUDE.md rule 2).
//
// Sources:
//   - public.events: outside visitors by first-touch source (meta.utm), and
//     checkout starts (guide_checkout_started, upgrade_started). Internal
//     traffic is dropped with the same rules as the admin dashboard
//     (analytics.internalSets: INTERNAL_OWNERS, INTERNAL_IPS, --exclude-ip).
//   - Stripe charges API: paid, unrefunded charges in the window.
//   - public.newsletter_subscribers: status counts now, plus confirmations
//     in the window.
//
// Usage: node scripts/weekly-report.js [--days 7] [--exclude-ip 1.2.3.4]
// Read-only: writes nothing, sends nothing.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { internalSets, isInternalEvent } = require('../services/analytics');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || dflt) : dflt;
}

const DAYS = Number(arg('days', 7)) || 7;
const now = Date.now();
const since = new Date(now - DAYS * 86400000);
const prevSince = new Date(now - 2 * DAYS * 86400000);
const day = d => d.toISOString().slice(0, 10);
const window = `${day(since)} to ${day(new Date(now))}`;
const PEOPLE = k => k && k !== 'anon' && k !== 'system' && !k.startsWith('sub-') && !k.startsWith('ip-');

function sourceOf(utm) {
  if (!utm) return 'no source';
  if (utm.utm_source) return String(utm.utm_source).toLowerCase();
  if (utm.referrer) return String(utm.referrer).replace(/^www\./, '').toLowerCase();
  return 'no source';
}

async function fetchEvents(db) {
  const rows = [];
  for (let from = 0; rows.length < 20000; from += 1000) {
    const { data, error } = await db.from('events')
      .select('type, owner_key, meta, created_at')
      .gte('created_at', prevSince.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`events read failed: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function trafficBlock(events, start, end) {
  const inWin = events.filter(e => { const t = new Date(e.created_at); return t >= start && t < end; });
  const firstTouch = new Map(); // owner -> source of its first event carrying utm
  const owners = new Set();
  for (const e of inWin) {
    if (!PEOPLE(e.owner_key)) continue;
    owners.add(e.owner_key);
    const utm = e.meta && e.meta.utm;
    if (!firstTouch.has(e.owner_key) && utm) firstTouch.set(e.owner_key, sourceOf(utm));
  }
  const bySource = new Map();
  for (const o of owners) {
    const s = firstTouch.get(o) || 'no source';
    bySource.set(s, (bySource.get(s) || 0) + 1);
  }
  const count = type => inWin.filter(e => e.type === type).length;
  const bots = new Map();
  for (const e of inWin) if (e.type === 'crawler_view') { const b = (e.meta && e.meta.bot) || '?'; bots.set(b, (bots.get(b) || 0) + 1); }
  return {
    crawlers: [...bots.entries()].sort((a, b) => b[1] - a[1]),
    people: owners.size,
    bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
    guideCheckouts: count('guide_checkout_started'),
    proCheckouts: count('upgrade_started'),
    subscribes: count('newsletter_subscribe'),
    venueClicks: count('booking_click') + count('maps_click')
  };
}

async function stripeSales() {
  if (!process.env.STRIPE_SECRET_KEY) return { note: 'STRIPE_SECRET_KEY not set, sales not read' };
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const paid = [];
  for await (const c of stripe.charges.list({ created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 })) {
    if (c.paid && c.status === 'succeeded' && !c.refunded) paid.push(c);
  }
  const byCur = {};
  for (const c of paid) byCur[c.currency] = (byCur[c.currency] || 0) + c.amount;
  return { count: paid.length, totals: Object.entries(byCur).map(([cur, cents]) => `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`) };
}

async function subscribers(db) {
  const { data, error } = await db.from('newsletter_subscribers').select('status, confirmed_at');
  if (error) throw new Error(`subscribers read failed: ${error.message}`);
  const by = s => data.filter(r => r.status === s).length;
  return {
    subscribed: by('subscribed'), pending: by('pending'), unsubscribed: by('unsubscribed'),
    confirmedInWindow: data.filter(r => r.confirmed_at && new Date(r.confirmed_at) >= since).length
  };
}

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const events = await fetchEvents(db);
  const sets = internalSets(events, { meIp: arg('exclude-ip', null) });
  const outside = events.filter(e => !isInternalEvent(e, sets));
  const cur = trafficBlock(outside, since, new Date(now));
  const prev = trafficBlock(outside, prevSince, since);
  const [sales, subs] = await Promise.all([stripeSales(), subscribers(db)]);

  const out = [];
  out.push(`# DayHop weekly report, ${window}`);
  out.push('');
  out.push(`Queried ${new Date(now).toISOString()}. Internal traffic excluded (INTERNAL_OWNERS, INTERNAL_IPS${arg('exclude-ip', null) ? ', --exclude-ip' : ''}).`);
  out.push('');
  out.push(`## Outside people (public.events, distinct visitor IDs, last ${DAYS}d vs the ${DAYS}d before)`);
  out.push(`- ${cur.people} people (previous ${DAYS}d: ${prev.people})`);
  for (const [s, n] of cur.bySource) out.push(`  - ${s}: ${n}`);
  out.push(`- Venue clicks (booking_click + maps_click): ${cur.venueClicks} (previous: ${prev.venueClicks})`);
  out.push(`- Crawler page reads (crawler_view): ${cur.crawlers.length ? cur.crawlers.map(([b, n]) => `${b} ${n}`).join(', ') : 'none'}`);
  out.push('');
  out.push(`## Checkout starts (public.events, last ${DAYS}d)`);
  out.push(`- Guide checkouts started: ${cur.guideCheckouts} (previous: ${prev.guideCheckouts})`);
  out.push(`- Pro checkouts started: ${cur.proCheckouts} (previous: ${prev.proCheckouts})`);
  out.push('');
  out.push(`## Paid sales (Stripe charges API, paid and unrefunded, ${window})`);
  out.push(sales.note ? `- ${sales.note}` : `- ${sales.count} paid${sales.totals.length ? `: ${sales.totals.join(', ')}` : ''}`);
  out.push('');
  out.push('## Newsletter (public.newsletter_subscribers, read now)');
  out.push(`- ${subs.subscribed} confirmed, ${subs.pending} pending, ${subs.unsubscribed} unsubscribed`);
  out.push(`- Confirmed in the last ${DAYS}d: ${subs.confirmedInWindow}; subscribe events from outside people: ${cur.subscribes}`);
  out.push('');
  out.push('## Plan targets by Dec 3, 2026: 2 paid guides, 40 confirmed subscribers');
  console.log(out.join('\n'));
}

main().catch(err => { console.error('[weekly-report]', err.message); process.exit(1); });
