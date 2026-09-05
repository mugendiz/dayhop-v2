// scripts/keyed-report.js — Friday check-day report for keyed ads.
// Hopkins rule: every channel links with its own key; the report reads
// conversions per key, never impressions. Sources:
//   - events.meta.src / meta.utm  (guide_checkout_started, newsletter_*,
//     signup, prompt_generated landing keys)
//   - ledger income rows whose Stripe metadata carries src (guide sales)
// Usage: node scripts/keyed-report.js [--since 2026-09-04] [--key zv]
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || true) : dflt;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const since = String(arg('since', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)));
  const keyPrefix = String(arg('key', ''));
  const internal = new Set((process.env.INTERNAL_OWNERS || '').split(',').map(s => s.trim()).filter(Boolean));

  const events = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('events').select('type, owner_key, meta, created_at')
      .gte('created_at', `${since}T00:00:00Z`).order('created_at').range(from, from + 999);
    if (error) throw error;
    events.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const rows = new Map(); // key -> counts
  const row = k => { if (!rows.has(k)) rows.set(k, { key: k, sessions: new Set(), taps: 0, checkouts: 0, subs: 0, signups: 0, prompts: 0 }); return rows.get(k); };
  for (const e of events) {
    if (internal.has(e.owner_key)) continue;
    const m = e.meta && typeof e.meta === 'object' ? e.meta : {};
    const utm = m.utm || {};
    const key = m.src || (utm.utm_campaign ? `${utm.utm_source || '?'}/${utm.utm_campaign}` : null) || (m.landing_src) || null;
    if (!key) continue;
    if (keyPrefix && !String(key).startsWith(keyPrefix)) continue;
    const r = row(String(key));
    // Bio/story taps (routes/go.js) are anonymous — count them, don't let
    // the shared 'anon' owner inflate people.
    if (e.type === 'link_click') { r.taps++; continue; }
    r.sessions.add(e.owner_key);
    if (e.type === 'guide_checkout_started') r.checkouts++;
    if (e.type === 'newsletter_subscribe' || e.type === 'newsletter_confirmed') r.subs++;
    if (e.type === 'signup') r.signups++;
    if (e.type === 'prompt_generated') r.prompts++;
  }

  // Guide sales with src in Stripe metadata (ledger meta) since the date.
  const { data: sales, error: e2 } = await sb.from('ledger_entries')
    .select('amount_cents, currency, occurred_at, meta, description')
    .eq('direction', 'income').gte('occurred_at', `${since}T00:00:00Z`);
  if (e2) throw e2;
  const salesByKey = {};
  for (const s of sales || []) {
    const k = (s.meta && (s.meta.src || (s.meta.metadata && s.meta.metadata.src))) || null;
    if (!k) continue;
    if (keyPrefix && !String(k).startsWith(keyPrefix)) continue;
    salesByKey[k] = (salesByKey[k] || 0) + s.amount_cents;
  }

  const out = [...rows.values()].map(r => ({
    key: r.key, taps: r.taps, people: r.sessions.size, checkouts: r.checkouts, sales_usd: ((salesByKey[r.key] || 0) / 100).toFixed(2),
    newsletter: r.subs, signups: r.signups, prompts: r.prompts
  }));
  for (const k of Object.keys(salesByKey)) if (!rows.has(k)) out.push({ key: k, taps: 0, people: 0, checkouts: 0, sales_usd: (salesByKey[k] / 100).toFixed(2), newsletter: 0, signups: 0, prompts: 0 });
  out.sort((a, b) => Number(b.sales_usd) - Number(a.sales_usd) || b.checkouts - a.checkouts || b.people - a.people);
  console.log(`Keyed conversions since ${since}${keyPrefix ? ` (keys starting "${keyPrefix}")` : ''}, internal owners excluded:`);
  if (!out.length) console.log('  (no keyed traffic yet)');
  else console.table(out);
}

main().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
