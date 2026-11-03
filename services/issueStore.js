// services/issueStore.js — DayHop V2
// Snapshots of sent newsletter issues, so every issue has a stable public
// web page (/weekend/<date>, /talk-of-the-town/<date>) that shows exactly
// what subscribers got, long after the live feed has moved on.
//
// Same storage as the personalized guides (services/personalGuideStore.js):
// public.api_cache rows with a 10-year expiry, keys "issue:<kind>:<date>"
// plus "issue:<kind>:latest". No service key (local dev, tests) → memory.

const db = require('./db/client');

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const KINDS = new Set(['weekend', 'tott']);
const mem = new Map();
const hasDb = () => db.status().service_key === true;

async function put(key, value) {
  if (!hasDb()) { mem.set(key, value); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key, payload: { v: value },
    expires_at: new Date(Date.now() + TEN_YEARS_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`issue store write failed: ${error.message}`);
}

async function get(key) {
  if (!hasDb()) return mem.has(key) ? mem.get(key) : null;
  const { data, error } = await db.getClient().from('api_cache').select('payload').eq('key', key).maybeSingle();
  if (error) throw new Error(`issue store read failed: ${error.message}`);
  return data && data.payload ? data.payload.v : null;
}

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Only what the page renders: never subscriber data, tokens or tracking ids.
function snapshotOf(kind, date, d) {
  const keep = ['title', 'description', 'category', 'venue', 'location', 'date', 'date_end', 'datetime', 'cost_tier',
    'good_for_ages', 'image_url', 'image_credit', 'booking_url', 'maps_url', 'hook', 'best_for', 'standout', 'worth_trip'];
  return {
    kind, date,
    subject: d.subject,
    weekendLabel: d.weekendLabel || null,
    hubName: d.hubName || null,
    city: d.city || null,
    weather: d.weather ? { description: d.weather.description, temp_c: d.weather.temp_c, is_rainy: d.weather.is_rainy, is_extreme_cold: d.weather.is_extreme_cold, is_extreme_heat: d.weather.is_extreme_heat } : null,
    picks: (d.picks || []).map(p => Object.fromEntries(keep.filter(k => p[k] != null).map(k => [k, p[k]])))
  };
}

// The first save of a date wins: a same-day re-send (after a partial
// failure) reuses this snapshot, so the page and every email of that issue
// show the same picks, hooks and standout.
async function saveIssue(kind, date, d) {
  if (!KINDS.has(kind) || !isDate(date)) throw new Error(`bad issue key ${kind}/${date}`);
  const existing = await get(`issue:${kind}:${date}`);
  if (existing) return existing;
  const snap = snapshotOf(kind, date, d);
  await put(`issue:${kind}:${date}`, snap);
  const latest = await get(`issue:${kind}:latest`).catch(() => null);
  if (!latest || latest < date) await put(`issue:${kind}:latest`, date);
  // Date index for the sitemap and llms.txt (newest first).
  const index = await get(`issue:${kind}:index`).catch(() => null);
  const dates = [...new Set([date, ...(Array.isArray(index) ? index : [])])].filter(isDate).sort().reverse();
  await put(`issue:${kind}:index`, dates);
  return snap;
}

async function getIssue(kind, date) {
  if (!KINDS.has(kind) || !isDate(date)) return null;
  return get(`issue:${kind}:${date}`);
}

async function latestDate(kind) {
  if (!KINDS.has(kind)) return null;
  return get(`issue:${kind}:latest`);
}

/** Every published date of a kind, newest first. Never throws. */
async function listDates(kind) {
  if (!KINDS.has(kind)) return [];
  const index = await get(`issue:${kind}:index`).catch(() => null);
  return Array.isArray(index) ? index.filter(isDate) : [];
}

module.exports = { saveIssue, getIssue, latestDate, listDates, snapshotOf, isDate, _mem: mem };
