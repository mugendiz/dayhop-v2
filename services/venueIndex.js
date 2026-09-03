// services/venueIndex.js — DayHop V2
// The pre-bought venue index: Google Places results for a FIXED query
// vocabulary (data/feedPrompts.js + data/themes.js) × a FIXED geography
// (data/venueCells.js), stored in public.venue_index and refreshed on a
// 30-day cycle (Google Maps Platform terms allow caching Places content for
// up to 30 days; place IDs indefinitely).
//
// Why: this is what makes the Maps bill scale with geography instead of
// users. Browse, Surprise me, the warmer and corridor radar read the index
// and never call Google. Free-text prompts read their theme queries from it
// too; only a prompt that matches NO theme buys one live search (budget-
// guarded in services/apiCache.js). The whole belt is ~860 rows; refreshed
// over 30 days that is ~29 Enterprise searches a day, inside the 1,000 free.
//
// Fail-soft: no service key or no rows → lookup() returns null and callers
// take the old live path (still cached + budget-capped).

const dbClient = require('./db/client');
const { CELLS } = require('../data/venueCells');
const { THEMES } = require('../data/themes');
const P = require('../data/feedPrompts');
const { haversineKm } = require('./relevance');

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RELOAD_MS = 60 * 60 * 1000;
const norm = s => String(s || '').trim().toLowerCase();

// The vocabulary, normalized. Order matters for refresh priority: feed
// prompts first (every browse pays them), then dining/refuge/corridor, then
// theme queries.
const VOCABULARY = [...new Set([
  ...Object.values(P.MODE_PROMPTS),
  P.DINING_QUERY, P.INDOOR_REFUGE_QUERY, P.CORRIDOR_QUERY,
  ...Object.values(P.SURPRISE_PROMPTS).flat(),
  ...THEMES.flatMap(t => t.placesQueries || [])
].map(norm))];
const VOCAB_SET = new Set(VOCABULARY);

const rows = new Map(); // `${cellId}|${query}` -> { places, fetched_at }
let loaded = false;
let loadedAt = 0;
let loading = null;

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

const key = (cellId, q) => `${cellId}|${norm(q)}`;

async function load() {
  if (loading) return loading;
  loading = (async () => {
    if (!hasServiceKey()) { loaded = true; loadedAt = Date.now(); return; }
    try {
      const client = dbClient.getClient();
      let from = 0;
      const fresh = new Map();
      for (;;) {
        const { data, error } = await client.from('venue_index')
          .select('cell, query, places, fetched_at').range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) fresh.set(key(r.cell, r.query), { places: r.places || [], fetched_at: r.fetched_at });
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      rows.clear();
      for (const [k, v] of fresh) rows.set(k, v);
      loaded = true;
      loadedAt = Date.now();
      console.log(`[venue-index] loaded ${rows.size} rows (${CELLS.length} cells × ${VOCABULARY.length} queries = ${CELLS.length * VOCABULARY.length} possible)`);
    } catch (err) {
      console.warn('[venue-index] load failed (live searches will be used):', err.message);
      loaded = true; // don't retry on every request; the hourly reload will
      loadedAt = Date.now();
    }
  })();
  try { await loading; } finally { loading = null; }
}

function ensureFresh() {
  if (!loaded || Date.now() - loadedAt > RELOAD_MS) load().catch(() => {});
}

function inVocabulary(q) {
  return VOCAB_SET.has(norm(q));
}

// Cells whose coverage circle reaches the point (nearest first).
function cellsNear(lat, lng, radiusKm = 0) {
  if (lat == null || lng == null) return [];
  const pt = { lat: Number(lat), lng: Number(lng) };
  return CELLS
    .map(c => ({ cell: c, d: haversineKm(pt, c) }))
    .filter(x => x.d <= radiusKm + x.cell.radiusKm)
    .sort((a, b) => a.d - b.d)
    .map(x => x.cell);
}

function covers(lat, lng) {
  return cellsNear(lat, lng, 0).length > 0;
}

/**
 * lookup({ queries, lat, lng, radiusKm }) →
 *   { byQuery: { [query]: places[] | null }, cells: [ids] }  or  null
 * null = the point is outside the indexed belt OR nothing is indexed there
 * yet — the caller falls back to live searches. byQuery[q] is null when q is
 * not in the vocabulary (a free-text prompt) — the caller decides whether
 * that is worth one live search. Places are fresh clones, deduped by
 * place_id across the covering cells, and kept within radiusKm (+5 km
 * slack: bias circles are soft) of the point.
 */
function lookup({ queries, lat, lng, radiusKm = 20 }) {
  ensureFresh();
  if (!loaded || rows.size === 0) return null;
  const near = cellsNear(lat, lng, radiusKm);
  if (!near.length) return null;
  const pt = { lat: Number(lat), lng: Number(lng) };
  const byQuery = {};
  let any = false;
  for (const q of queries || []) {
    if (!inVocabulary(q)) { byQuery[q] = null; continue; }
    const seen = new Set();
    const out = [];
    let hit = false;
    for (const cell of near) {
      const r = rows.get(key(cell.id, q));
      if (!r) continue;
      hit = true;
      for (const p of r.places || []) {
        if (!p || !p.place_id || seen.has(p.place_id)) continue;
        seen.add(p.place_id);
        if (p.lat != null && p.lng != null && haversineKm(pt, p) > radiusKm + 5) continue;
        out.push({ ...p });
      }
    }
    // A vocabulary query with no indexed row anywhere nearby is reported as
    // null too, so the caller can buy it live (and the refresh will fill it).
    byQuery[q] = hit ? out : null;
    if (hit) any = true;
  }
  return any ? { byQuery, cells: near.map(c => c.id) } : null;
}

// ---------- refresh ----------
// Rows missing or older than MAX_AGE_MS, most urgent first: missing rows in
// core cells, then missing elsewhere, then oldest. Each fetched row is one
// metered Enterprise search charged to the 'index' bucket (exempt from the
// per-user daily USD guard; capped by maxCalls here instead).
function staleTargets({ cellIds = null, now = Date.now() } = {}) {
  const targets = [];
  for (const cell of CELLS) {
    if (cellIds && !cellIds.includes(cell.id)) continue;
    for (const q of VOCABULARY) {
      const r = rows.get(key(cell.id, q));
      const age = r ? now - Date.parse(r.fetched_at) : Infinity;
      if (age > MAX_AGE_MS) targets.push({ cell, query: q, age, missing: !r });
    }
  }
  return targets.sort((a, b) => {
    if (a.missing !== b.missing) return a.missing ? -1 : 1;
    if (a.missing) {
      const core = Number(Boolean(b.cell.core)) - Number(Boolean(a.cell.core));
      if (core) return core;
    }
    return b.age - a.age;
  });
}

async function refreshStale({ maxCalls = 30, cellIds = null, onRow = null } = {}) {
  const maps = require('./googleMaps');
  if (!loaded) await load();
  const targets = staleTargets({ cellIds });
  const todo = targets.slice(0, Math.max(0, maxCalls));
  let fetched = 0, failed = 0;
  for (const t of todo) {
    try {
      const places = await maps.searchPlacesFresh({
        query: t.query, lat: t.cell.lat, lng: t.cell.lng,
        radiusMeters: t.cell.radiusKm * 1000, maxResults: 20, bucket: 'index'
      });
      const fetched_at = new Date().toISOString();
      rows.set(key(t.cell.id, t.query), { places, fetched_at });
      if (hasServiceKey()) {
        const { error } = await dbClient.getClient().from('venue_index')
          .upsert({ cell: t.cell.id, query: t.query, places, fetched_at }, { onConflict: 'cell,query' });
        if (error) throw error;
      }
      fetched++;
      if (onRow) onRow({ cell: t.cell.id, query: t.query, count: places.length });
    } catch (err) {
      failed++;
      console.warn(`[venue-index] refresh "${t.query}" @ ${t.cell.id} failed: ${err.message}`);
      if (err.code === 'MAPS_NOT_CONFIGURED' || err.code === 'BUDGET_EXCEEDED') break;
    }
  }
  return { fetched, failed, remaining: targets.length - fetched, total: CELLS.length * VOCABULARY.length };
}

function status() {
  const now = Date.now();
  let stale = 0;
  for (const r of rows.values()) if (now - Date.parse(r.fetched_at) > MAX_AGE_MS) stale++;
  const total = CELLS.length * VOCABULARY.length;
  return {
    loaded, rows: rows.size, total, stale,
    coverage_pct: total ? Math.round(100 * rows.size / total) : 0,
    cells: CELLS.length, vocabulary: VOCABULARY.length,
    l2: hasServiceKey()
  };
}

// Test hook.
function _setRows(entries) {
  rows.clear();
  for (const e of entries) rows.set(key(e.cell, e.query), { places: e.places, fetched_at: e.fetched_at || new Date().toISOString() });
  loaded = true; loadedAt = Date.now();
}

module.exports = { load, lookup, covers, inVocabulary, cellsNear, refreshStale, staleTargets, status, VOCABULARY, MAX_AGE_MS, _setRows };
