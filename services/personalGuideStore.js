// services/personalGuideStore.js — DayHop V2
// Where a personalized guide lives once it is built: one JSON record per
// Stripe checkout session, plus a small status row while it builds.
//
// Stored in public.api_cache under "pguide:<session id>" with a 10-year
// expiry, because that table already exists in production, is service-key
// only, and survives deploys; a new table would need a migration run by
// hand before the first sale. The pruning note in db/schema.sql deletes only
// rows expired for 30 days, which these never are. No service key (local
// dev, tests) → an in-memory map, same interface.

const db = require('./db/client');

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const mem = new Map();

const hasDb = () => db.status().service_key === true;
const guideKey = sid => `pguide:${sid}`;
const statusKey = sid => `pguide-status:${sid}`;

async function put(key, value) {
  if (!hasDb()) { mem.set(key, value); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key,
    payload: { v: value },
    expires_at: new Date(Date.now() + TEN_YEARS_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`personal guide store write failed: ${error.message}`);
}

async function get(key) {
  if (!hasDb()) return mem.has(key) ? mem.get(key) : null;
  const { data, error } = await db.getClient().from('api_cache').select('payload').eq('key', key).maybeSingle();
  if (error) throw new Error(`personal guide store read failed: ${error.message}`);
  return data && data.payload ? data.payload.v : null;
}

module.exports = {
  saveGuide: (sid, guide) => put(guideKey(sid), guide),
  getGuide: sid => get(guideKey(sid)),
  // { state: 'building' | 'ready' | 'failed', at, error?, emailed? }
  setStatus: (sid, status) => put(statusKey(sid), Object.assign({ at: new Date().toISOString() }, status)),
  getStatus: sid => get(statusKey(sid)),
  _mem: mem
};
