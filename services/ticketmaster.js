// services/ticketmaster.js — DayHop V2
// Ticketmaster Discovery API v2 — concerts, sports, shows near a point.
// Free tier: 5,000 calls/day, 5 req/sec — one call per generate keeps us
// far under both. Docs: developer.ticketmaster.com (Discovery API v2).
//
// SHARED CANDIDATE SHAPE (all event/POI connectors normalize to this;
// referenced by eventbrite.js, torontoOpenData.js, yorkOpenData.js):
// {
//   source:       string   — connector name, e.g. 'ticketmaster'
//   id:           string   — globally unique via source prefix ('tm-', 'eb-',
//                            'to-', 'york-', 'cur-', 'comm-')
//   title:        string
//   description:  string   — ≤220 chars
//   category?:    string
//   date?:        string   — 'YYYY-MM-DD' local
//   datetime?:    string   — ISO when known
//   venue?:       string
//   address?:     string
//   lat?, lng?:   number|null
//   price_from?:  number|null
//   currency?:    string|null
//   image_url?:   string|null
//   booking_url?: string|null
//   maps_url?:    string|null
//   rating?:      number|null
// }
// Connectors NEVER throw from their search fn: any failure logs one warn
// and resolves to []. Hard 5s timeout so a hung upstream can't stall the
// parallel candidate gather.

const axios = require('axios');

const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const client = axios.create({ timeout: 5000 });

// Minimal geohash encoder — Discovery's `latlong` param is deprecated in
// favor of `geoPoint`, which takes a geohash. Precision 9 ≈ 5m cell.
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function toGeohash(lat, lng, precision = 9) {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += GEOHASH_BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

// Discovery rejects timestamps with milliseconds — 'YYYY-MM-DDTHH:mm:ssZ' only.
function isoNoMs(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function widestWideImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const wide = images.filter(i => i.ratio === '16_9');
  const pool = wide.length ? wide : images;
  return pool.reduce((best, i) => ((i.width || 0) > (best.width || 0) ? i : best), pool[0]).url || null;
}

function normalizeEvent(ev) {
  const venue = ev._embedded && ev._embedded.venues && ev._embedded.venues[0];
  const loc = venue && venue.location;
  const price = Array.isArray(ev.priceRanges) ? ev.priceRanges[0] : null;
  return {
    source: 'ticketmaster',
    id: 'tm-' + ev.id,
    title: ev.name,
    description: String(ev.info || ev.pleaseNote || (ev.classifications && ev.classifications[0] && ev.classifications[0].segment ? ev.classifications[0].segment.name + ' event' : '') || '').slice(0, 220),
    date: ev.dates && ev.dates.start ? ev.dates.start.localDate || null : null,
    datetime: ev.dates && ev.dates.start ? ev.dates.start.dateTime || null : null,
    venue: venue ? venue.name || null : null,
    address: venue
      ? [venue.address && venue.address.line1, venue.city && venue.city.name].filter(Boolean).join(', ') || null
      : null,
    lat: loc && loc.latitude != null ? Number(loc.latitude) : null,
    lng: loc && loc.longitude != null ? Number(loc.longitude) : null,
    price_from: price && price.min != null ? price.min : null,
    currency: price ? price.currency || 'CAD' : null,
    image_url: widestWideImage(ev.images),
    booking_url: ev.url || null,
    rating: null
  };
}

// Discovery returns one row per performance; collapse repeats of the same
// event (same name + venue) keeping the nearest upcoming date.
function collapsePerformances(events) {
  const byKey = new Map();
  for (const ev of events) {
    const key = `${(ev.title || '').toLowerCase()}|${(ev.venue || '').toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || (ev.date && existing.date && ev.date < existing.date)) byKey.set(key, ev);
  }
  return [...byKey.values()];
}

// 15 min result cache — every other event connector has one, and this call
// used to fire on every generate, browse miss, and Surprise press. The key
// grids location to a ~5 km geohash cell so neighbouring callers share.
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map(); // key -> { at, events }

let warned = false;
async function searchEvents({ lat, lng, keyword, radiusKm = 40, limit = 20, daysAhead = 30 } = {}) {
  if (!process.env.TICKETMASTER_API_KEY) return [];
  if (lat == null || lng == null) return [];
  const cacheKey = `${toGeohash(lat, lng, 5)}|${keyword || ''}|${radiusKm}|${limit}|${daysAhead}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;
  try {
    const now = new Date();
    const end = new Date(now.getTime() + daysAhead * 86400000);
    const params = {
      apikey: process.env.TICKETMASTER_API_KEY,
      geoPoint: toGeohash(lat, lng),
      radius: String(radiusKm),
      unit: 'km',
      startDateTime: isoNoMs(now),
      endDateTime: isoNoMs(end),
      size: String(Math.min(limit * 3, 60)), // over-fetch: performance rows collapse
      sort: 'date,asc'
    };
    if (keyword) params.keyword = keyword;
    const res = await client.get(BASE_URL, { params });
    const events = (res.data && res.data._embedded && res.data._embedded.events) || [];
    const out = collapsePerformances(events.map(normalizeEvent)).slice(0, limit);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { at: Date.now(), events: out });
    return out;
  } catch (err) {
    if (!warned) { console.warn('[ticketmaster] unavailable:', err.message); warned = true; }
    return [];
  }
}

module.exports = { searchEvents, toGeohash };
