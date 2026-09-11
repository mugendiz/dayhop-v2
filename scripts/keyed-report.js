// scripts/keyed-report.js — Friday check-day report for keyed ads.
// Hopkins rule: every channel links with its own key; the report reads
// conversions per key, never impressions. Sources:
//   - events.meta.src / meta.utm  (guide_checkout_started, newsletter_*,
//     signup, prompt_generated landing keys)
//   - ledger income rows whose Stripe metadata carries src (guide sales)
// Usage: node scripts/keyed-report.js [--since 2026-09-04] [--key zv] [--views views.json] [--taps]
//   views.json maps a key to the views its posts earned in the window, e.g.
//   {"ig": 4200, "tiktok": 3100}. The report then prints human taps per 1,000
//   views for Gate 1 (under 3: change the destination; 5 or more: hold).
//   --taps also lists every tap with its user agent and verdict.
//
// Taps are anonymous (routes/go.js), so internal-owner exclusion cannot reach
// them. Audit of Sep 5-11: of 37 taps, Meta's link-preview crawler made 14,
// our own curl checks 10, and scanner-style browsers or crawler echoes 8. A caption or
// DM containing a link triggers a burst of facebookexternalhit fetches plus a
// few browser-looking follow-ups within seconds. `human_taps` drops all of
// those; gate math uses human taps only.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || true) : dflt;
}

const BOT_UA = /bot|crawl|spider|facebookexternalhit|meta-externalagent|preview|curl|wget|python|node-fetch|axios|headless|scanner|^$/i;
const OLD_FIREFOX = /Firefox\/([0-9]+)\./; // scanners fake ancient Firefox builds
const CRAWLER_ECHO_MS = 10 * 1000;         // browser-looking fetches right after a crawler burst
const QA_KEY = /^c-test/;                  // creator-link rollout checks, not people

function tapVerdict(tap, lastCrawlerAt) {
  const ua = String((tap.meta && tap.meta.ua) || '');
  if (BOT_UA.test(ua)) return 'crawler';
  const ff = ua.match(OLD_FIREFOX);
  if (ff && Number(ff[1]) < 100) return 'crawler';
  const t = Date.parse(tap.created_at);
  if (lastCrawlerAt != null && t - lastCrawlerAt <= CRAWLER_ECHO_MS) return 'crawler-echo';
  return 'human';
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const since = String(arg('since', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)));
  const keyPrefix = String(arg('key', ''));
  const viewsFile = arg('views', null);
  const listTaps = process.argv.includes('--taps');
  const views = viewsFile ? JSON.parse(require('fs').readFileSync(String(viewsFile), 'utf8')) : {};
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
  const row = k => { if (!rows.has(k)) rows.set(k, { key: k, sessions: new Set(), taps: 0, humanTaps: 0, checkouts: 0, subs: 0, signups: 0, prompts: 0 }); return rows.get(k); };
  const lastCrawler = new Map(); // key -> ms of the latest crawler fetch
  const tapLog = [];
  for (const e of events) {
    if (internal.has(e.owner_key)) continue;
    const m = e.meta && typeof e.meta === 'object' ? e.meta : {};
    const utm = m.utm || {};
    const key = m.src || (utm.utm_campaign ? `${utm.utm_source || '?'}/${utm.utm_campaign}` : null) || (m.landing_src) || null;
    if (!key) continue;
    if (QA_KEY.test(String(key))) continue;
    if (keyPrefix && !String(key).startsWith(keyPrefix)) continue;
    const r = row(String(key));
    // Bio/story taps (routes/go.js) are anonymous — count them, don't let
    // the shared 'anon' owner inflate people.
    if (e.type === 'link_click') {
      const verdict = tapVerdict(e, lastCrawler.get(r.key));
      if (verdict !== 'human') lastCrawler.set(r.key, Date.parse(e.created_at));
      r.taps++;
      if (verdict === 'human') r.humanTaps++;
      if (listTaps) tapLog.push({ at: e.created_at, key: r.key, page: m.page || '', verdict, ua: String(m.ua || '').slice(0, 80) });
      continue;
    }
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

  const per1k = (taps, v) => (v ? (taps / v * 1000).toFixed(1) : '');
  const blank = k => ({ key: k, taps: 0, human_taps: 0, views: views[k] || '', human_per_1k: '', people: 0, checkouts: 0, sales_usd: '0.00', newsletter: 0, signups: 0, prompts: 0 });
  const out = [...rows.values()].map(r => ({
    key: r.key, taps: r.taps, human_taps: r.humanTaps, views: views[r.key] || '', human_per_1k: per1k(r.humanTaps, views[r.key]),
    people: r.sessions.size, checkouts: r.checkouts, sales_usd: ((salesByKey[r.key] || 0) / 100).toFixed(2),
    newsletter: r.subs, signups: r.signups, prompts: r.prompts
  }));
  for (const k of Object.keys(salesByKey)) if (!rows.has(k)) out.push(Object.assign(blank(k), { sales_usd: (salesByKey[k] / 100).toFixed(2) }));
  out.sort((a, b) => Number(b.sales_usd) - Number(a.sales_usd) || b.checkouts - a.checkouts || b.human_taps - a.human_taps || b.people - a.people);
  console.log(`Keyed conversions since ${since}${keyPrefix ? ` (keys starting "${keyPrefix}")` : ''}, internal owners excluded, crawler taps shown but not counted as human:`);
  if (!out.length) console.log('  (no keyed traffic yet)');
  else console.table(out);
  if (listTaps && tapLog.length) console.table(tapLog);
}

main().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
