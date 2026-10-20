#!/usr/bin/env node
// scripts/migrate-photo-keys.js — one-time, re-runnable, no Google calls.
// Card photos moved from per-photo cache keys ("maps:photo-uri:<name>|800")
// to per-place keys ("maps:photo-place:<placeId>|800", googleMaps.js). This
// copies every already-paid image URI from the old keys to the new ones, so
// the switch does not re-buy ~340 places on its first day. The newest
// resolve per place wins; a place that already has a new key is left alone.
// Each copied row expires 30 days after the resolve it came from.
//
//   node scripts/migrate-photo-keys.js          (dry run: counts only)
//   node scripts/migrate-photo-keys.js --write

require('dotenv').config();
const db = require('../services/db/client');

const DAY = 24 * 60 * 60 * 1000;
const write = process.argv.includes('--write');

(async () => {
  const sb = db.getClient();
  const old = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('api_cache').select('key, payload, updated_at')
      .like('key', 'maps:photo-uri:%').range(from, from + 999);
    if (error) throw error;
    old.push(...data);
    if (data.length < 1000) break;
  }
  const best = new Map(); // new key -> { uri, at }
  for (const r of old) {
    const m = r.key.match(/^maps:photo-uri:places\/([^/]+)\/photos\/[^|]+\|(\d+)$/);
    const uri = r.payload && r.payload.v;
    if (!m || typeof uri !== 'string' || !uri.startsWith('https://')) continue;
    const at = Date.parse(r.updated_at);
    if (Date.now() - at > 30 * DAY) continue; // too old to promise 30 more days on
    const key = `maps:photo-place:${m[1]}|${m[2]}`;
    if (!best.has(key) || best.get(key).at < at) best.set(key, { uri, at });
  }
  const keys = [...best.keys()];
  const exists = new Set();
  for (let i = 0; i < keys.length; i += 40) {
    const { data, error } = await sb.from('api_cache').select('key').in('key', keys.slice(i, i + 40));
    if (error) throw error;
    data.forEach(r => exists.add(r.key));
  }
  const rows = keys.filter(k => !exists.has(k)).map(k => ({
    key: k,
    payload: { v: best.get(k).uri },
    expires_at: new Date(best.get(k).at + 30 * DAY).toISOString(),
    updated_at: new Date().toISOString()
  }));
  console.log(`old photo rows ${old.length} → ${best.size} places; ${exists.size} already migrated; ${rows.length} to write`);
  if (!write) { console.log('dry run: pass --write to copy them'); return; }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('api_cache').upsert(rows.slice(i, i + 200), { onConflict: 'key' });
    if (error) throw error;
  }
  console.log(`wrote ${rows.length}`);
})().catch(err => { console.error(err.message); process.exit(1); });
