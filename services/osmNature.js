// services/osmNature.js — DayHop V2
// The non-commercial outdoors layer: scenic lookouts, waterfalls, beaches,
// and nature reserves from OpenStreetMap via the Overpass API. Commercial
// place search under-indexes exactly these (nothing to sell), yet they're
// the heart of both R&R and Adventure days. Keyless; works anywhere on
// Earth, so it's gated on geo, not the GTA.
//
// OPERATIONAL NOTES (verified 2026-07-24):
// - overpass-api.de answers 406 to default client UAs — a descriptive
//   User-Agent with contact info is REQUIRED (their usage policy).
// - Form-encoded POST body ("data=<query>"); JSON via [out:json].
// - Ways/relations need "out center" for coordinates (el.center.lat/lon).
// - Be a good citizen: one small query, 24h cache, modest radius.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 20000;
const TTL_MS = 24 * 60 * 60 * 1000; // OSM nature features barely change
const FAIL_TTL_MS = 15 * 60 * 1000; // busy-server backoff before retrying
const CACHE_MAX = 100;

const client = axios.create({
  timeout: 25000,
  headers: {
    'User-Agent': 'DayHop/2.0 (GTA day-planner; contact zokaamazon@gmail.com)',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

const cache = new Map();
let warned = false;

// Only named features: an unnamed OSM node makes a useless recommendation.
// Nodes and ways only — relations make the query an order of magnitude
// heavier on a busy server, for marginal extra coverage.
function buildQuery(lat, lng) {
  const around = `around:${RADIUS_M},${lat},${lng}`;
  return `[out:json][timeout:20];(` +
    `node(${around})[tourism=viewpoint][name];` +
    `node(${around})[waterway=waterfall][name];` +
    `way(${around})[natural=beach][name];` +
    `way(${around})[leisure=nature_reserve][name];` +
    `node(${around})[leisure=nature_reserve][name];` +
    `);out center 60;`;
}

const KINDS = [
  { match: t => t.tourism === 'viewpoint', label: 'Scenic lookout', category: 'general',
    blurb: 'A mapped scenic lookout — open views and a natural pause point for the day.' },
  { match: t => t.waterway === 'waterfall', label: 'Waterfall', category: 'water',
    blurb: 'A waterfall spot mapped by the OpenStreetMap community — worth the walk in.' },
  { match: t => t.natural === 'beach', label: 'Beach', category: 'water',
    blurb: 'A public beach — open shoreline for a slow hour by the water.' },
  { match: t => t.leisure === 'nature_reserve', label: 'Nature reserve', category: 'general',
    blurb: 'A protected natural area — trails, birdlife, and quiet green space.' }
];

function normalizeElement(el) {
  const tags = el.tags || {};
  const kind = KINDS.find(k => k.match(tags));
  if (!kind || !tags.name) return null;
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lng = el.lon != null ? el.lon : (el.center && el.center.lon);
  if (lat == null || lng == null) return null;
  const desc = String(tags.description || '').trim();
  return {
    source: 'osm_nature',
    id: `osm-${el.type}-${el.id}`,
    title: tags.name,
    description: (desc || kind.blurb).slice(0, 220),
    category: kind.category,
    date: null,
    datetime: null,
    venue: `${kind.label} · OpenStreetMap`,
    address: null,
    lat, lng,
    price_from: null,
    currency: null,
    image_url: null,
    booking_url: null,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    rating: null
  };
}

const pending = new Map();

async function refreshSpots(key, lat, lng) {
  try {
    const res = await client.post(OVERPASS_URL, 'data=' + encodeURIComponent(buildQuery(lat, lng)));
    // A busy Overpass returns an HTML error page — sometimes with HTTP 200.
    // Never let that cache as a successful empty result for a whole day.
    if (!res.data || !Array.isArray(res.data.elements)) {
      throw new Error('non-JSON response (server busy)');
    }
    const seen = new Set();
    const items = [];
    for (const el of res.data.elements) {
      const c = normalizeElement(el);
      if (!c) continue;
      const nameKey = c.title.toLowerCase();
      if (seen.has(nameKey)) continue;
      seen.add(nameKey);
      items.push(c);
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), items });
  } catch (err) {
    if (!warned) { console.warn('[osm_nature] unavailable:', err.message); warned = true; }
    // Back off for a while instead of hitting a busy server on every browse.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), items: [], failed: true });
  }
}

/**
 * Named nature features near a point, deduped by name. Cached ~11 km /
 * 24 h so neighbours share an entry and Overpass sees us rarely.
 *
 * ZERO-LATENCY CONTRACT: never waits on the network. Answers from cache
 * immediately (empty on a cold key) and refreshes in the background — a
 * busy Overpass can therefore never slow a browse or plan request; its
 * results simply join the pool from the next request onward.
 */
function getNatureSpots({ lat, lng, limit = 10 } = {}) {
  if (lat == null || lng == null) return Promise.resolve([]);
  const key = `${Math.round(lat * 10) / 10},${Math.round(lng * 10) / 10}`;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < (hit.failed ? FAIL_TTL_MS : TTL_MS);
  if (!fresh && !pending.has(key)) {
    const p = refreshSpots(key, lat, lng).finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return Promise.resolve(hit ? hit.items.slice(0, limit) : []);
}

module.exports = { getNatureSpots };
