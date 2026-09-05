// services/apiCache.js — DayHop V2
// Shared, persistent, de-duplicating cache + daily spend guard for paid
// third-party calls (Google Maps today; any metered API tomorrow).
//
// Why this exists: every Maps cache used to be a per-process Map. Render
// restarts the process on every deploy and every free-tier spin-down, so
// the "6h/24h" caches were cold dozens of times a week and the same Text
// Searches (the default-pool warmer, the curated-catalog photo lookups)
// were bought again and again — a $100 Google bill for a few hundred users.
//
// Three layers, all fail-soft:
//   L1  in-memory Map — sub-millisecond, per process.
//   IF  in-flight map — N concurrent callers (N users landing on the same
//       feed at once) share ONE upstream request instead of N.
//   L2  public.api_cache in Supabase (service key) — survives restarts and
//       is shared by every instance. Missing table / no key → L1 only.
// Plus a stale-on-error fallback: when the upstream fails or the daily
// budget is exhausted, an expired entry (up to STALE_MAX_MS old) is served
// rather than nothing — a week-old venue list beats an empty shelf.
//
// Spend guard: every metered call is charged against MAPS_DAILY_BUDGET_USD
// (default $1/day nominal — 25 Enterprise searches, which keeps a month
// inside Google's free allowance; typical spend is far lower because nearly
// everything is a cache hit). Past the cap the call
// throws code BUDGET_EXCEEDED and callers degrade: feeds fall back to the
// catalog + other sources, cards fall back to stock photos. Counters
// persist in public.api_usage so a restart can't reset the meter.

const dbClient = require('./db/client');

const L1_MAX = 5000;
const STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const l1 = new Map();        // key -> { value, expires }
const inflight = new Map();  // key -> Promise<value>

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

// Warn once per failure kind so a missing table doesn't flood the log.
const warned = new Set();
function warnOnce(kind, err) {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.warn(`[api-cache] ${kind} failed (running without it): ${err.message}`);
}

function l1Set(key, entry) {
  if (l1.size >= L1_MAX) l1.delete(l1.keys().next().value);
  l1.set(key, entry);
}

async function readL2(key) {
  if (!hasServiceKey()) return null;
  try {
    const { data, error } = await dbClient.getClient()
      .from('api_cache').select('payload, expires_at').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data || !data.payload || !('v' in data.payload)) return null;
    return { value: data.payload.v, expires: Date.parse(data.expires_at) };
  } catch (err) {
    warnOnce('L2 read', err);
    return null;
  }
}

function writeL2(key, value, expires) {
  if (!hasServiceKey()) return;
  dbClient.getClient()
    .from('api_cache')
    .upsert({
      key,
      payload: { v: value },
      expires_at: new Date(expires).toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' })
    .then(({ error }) => { if (error) warnOnce('L2 write', error); })
    .catch(err => warnOnce('L2 write', err));
}

/**
 * cached({ key, ttlMs, fetch }) → value
 * - fresh L1 hit → returned immediately
 * - concurrent identical keys → one fetch, shared promise
 * - L1 miss → L2 lookup → fetch on miss → written to both layers
 * - fetch error → stale entry (≤ STALE_MAX_MS) if any, else rethrow
 * Values must be JSON-serializable (they cross into jsonb).
 */
async function cached({ key, ttlMs, fetch }) {
  const now = Date.now();
  const hit = l1.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    const l2 = await readL2(key);
    if (l2 && l2.expires > Date.now()) {
      l1Set(key, l2);
      return l2.value;
    }
    try {
      const value = await fetch();
      const expires = Date.now() + ttlMs;
      l1Set(key, { value, expires });
      writeL2(key, value, expires);
      return value;
    } catch (err) {
      const stale = [hit, l2].find(e => e && Date.now() - e.expires < STALE_MAX_MS);
      if (stale) {
        console.warn(`[api-cache] serving stale "${key.slice(0, 60)}" after: ${err.message}`);
        return stale.value;
      }
      throw err;
    }
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

// ---------- daily spend guard ----------
// USD per call by SKU (Google Maps Platform list prices, Mar 2025 model,
// 0–100k tier). Free monthly allowances (1k Enterprise / 5k Pro / 10k
// Essentials) are deliberately NOT credited — the guard is a ceiling, and
// counting every call is the conservative side to err on.
const COST_USD = {
  text_search_ent_atm: 0.040,   // Text Search, Enterprise + Atmosphere mask
  text_search_pro: 0.032,       // Text Search, photos-only (Pro) mask
  place_details_ent_atm: 0.025, // Place Details with editorialSummary
  place_photo: 0.007,
  geocode: 0.005,
  autocomplete: 0.00283
};

const TORONTO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
const budgetUsd = () => {
  const n = Number(process.env.MAPS_DAILY_BUDGET_USD);
  // Default $1/day nominal = 25 Enterprise searches/day = 750/month, inside
  // Google's 1,000 free allowance for that SKU — so the typical real bill
  // is $0 and the worst case is a few dollars.
  return Number.isFinite(n) && n >= 0 ? n : 1;
};
// Photo resolves ($0.007) get their own reserved slice so a stored, already
// paid-for photo ref always renders even after searches ($0.040) and
// speculative photo lookups ($0.032) have drained the main pot. Sept 5 2026:
// the shared pot is why mobile tiles showed "mostly placeholders" — the
// cheap resolves ran after the page painted and always lost the race.
const photoBudgetUsd = () => {
  const n = Number(process.env.PHOTO_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 0.35; // ≈ 50 fresh photos/day, 7-day cached
};

// Three buckets: 'live' (user-triggered, governed by the USD cap), 'photo'
// (place_photo resolves, governed by their own small cap) and 'index' (the
// scheduled venue-index refresh — services/venueIndex.js — exempt from the
// cap because it has its own row cap, but still counted and persisted under
// provider google_maps_index so /health shows the real total).
let usage = { day: TORONTO_DAY.format(new Date()), calls: {}, usd: 0, photoUsd: 0, blocked: 0, index: {}, loaded: false };
const persistTimers = new Map(); // `${provider}|${sku}` -> timeout
const PROVIDER = { live: 'google_maps', index: 'google_maps_index' };

function rollDay() {
  const today = TORONTO_DAY.format(new Date());
  if (usage.day !== today) {
    usage = { day: today, calls: {}, usd: 0, photoUsd: 0, blocked: 0, index: {}, loaded: true };
  }
}

// Restore today's counters after a restart (the whole point of persisting).
// Takes the max of DB vs. memory per SKU so a slow load never under-counts.
async function loadUsage() {
  if (!hasServiceKey()) { usage.loaded = true; return; }
  try {
    const { data, error } = await dbClient.getClient()
      .from('api_usage').select('provider, sku, calls').eq('day', usage.day);
    if (error) throw error;
    rollDay();
    for (const row of data || []) {
      if (row.provider === PROVIDER.index) {
        usage.index[row.sku] = Math.max(usage.index[row.sku] || 0, row.calls);
        continue;
      }
      const have = usage.calls[row.sku] || 0;
      if (row.calls > have) {
        const delta = (row.calls - have) * (COST_USD[row.sku] || 0);
        if (row.sku === 'place_photo') usage.photoUsd += delta; else usage.usd += delta;
        usage.calls[row.sku] = row.calls;
      }
    }
  } catch (err) {
    warnOnce('usage load', err);
  }
  usage.loaded = true;
}

function persistUsage(sku, bucket = 'live') {
  const provider = PROVIDER[bucket] || PROVIDER.live;
  const timerKey = `${provider}|${sku}`;
  if (!hasServiceKey() || persistTimers.has(timerKey)) return;
  // Coalesce bursts: one upsert per (provider, SKU) per 5 s at most.
  persistTimers.set(timerKey, setTimeout(() => {
    persistTimers.delete(timerKey);
    const day = usage.day;
    const calls = (bucket === 'index' ? usage.index[sku] : usage.calls[sku]) || 0;
    dbClient.getClient()
      .from('api_usage')
      .upsert({
        day, provider, sku, calls,
        usd: Number((calls * (COST_USD[sku] || 0)).toFixed(4)),
        updated_at: new Date().toISOString()
      }, { onConflict: 'day,provider,sku' })
      .then(({ error }) => { if (error) warnOnce('usage write', error); })
      .catch(err => warnOnce('usage write', err));
  }, 5000).unref());
}

/**
 * Charge one upstream call against today's budget. Throws BUDGET_EXCEEDED
 * (never records the call) when the cap would be crossed. { bucket: 'index' }
 * counts the call without applying the cap (the index refresh caps rows).
 */
function spend(sku, { bucket = 'live' } = {}) {
  rollDay();
  const cost = COST_USD[sku];
  if (cost == null) throw new Error(`apiCache.spend: unknown SKU "${sku}"`);
  if (bucket === 'index') {
    usage.index[sku] = (usage.index[sku] || 0) + 1;
    persistUsage(sku, 'index');
    return;
  }
  if (bucket === 'photo') {
    const pcap = photoBudgetUsd();
    if (usage.photoUsd + cost > pcap) {
      const err = new Error(`Daily photo budget ($${pcap}) exhausted`);
      err.code = 'BUDGET_EXCEEDED';
      throw err;
    }
    usage.photoUsd += cost;
    usage.calls[sku] = (usage.calls[sku] || 0) + 1;
    persistUsage(sku);
    return;
  }
  const cap = budgetUsd();
  if (usage.usd + cost > cap) {
    usage.blocked++;
    if (usage.blocked === 1) {
      console.warn(`[api-cache] daily Maps budget reached ($${cap.toFixed(2)}, ${usage.day}) — metered calls blocked until midnight Toronto; cached/stale data still serves`);
    }
    const err = new Error(`Daily Maps budget ($${cap}) exhausted`);
    err.code = 'BUDGET_EXCEEDED';
    throw err;
  }
  usage.usd += cost;
  usage.calls[sku] = (usage.calls[sku] || 0) + 1;
  persistUsage(sku);
}

function usageStatus() {
  rollDay();
  return {
    day: usage.day,
    budget_usd: budgetUsd(),
    spent_usd: Number(usage.usd.toFixed(3)),
    // Reserved photo slice (place_photo resolves), separate from the main pot.
    photo_budget_usd: photoBudgetUsd(),
    photo_spent_usd: Number(usage.photoUsd.toFixed(3)),
    calls: { ...usage.calls },
    blocked: usage.blocked,
    // Scheduled venue-index refresh calls today (not under the cap).
    index_calls: { ...usage.index },
    l1_entries: l1.size,
    l2: hasServiceKey()
  };
}

// Test hooks — not for production callers.
function _reset() {
  l1.clear(); inflight.clear();
  usage = { day: TORONTO_DAY.format(new Date()), calls: {}, usd: 0, photoUsd: 0, blocked: 0, index: {}, loaded: true };
}

module.exports = { cached, spend, usageStatus, loadUsage, COST_USD, _reset };
