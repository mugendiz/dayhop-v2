// services/torontoOpenData.js — DayHop V2
// City of Toronto "Festivals & Events" calendar — the same feed toronto.ca's
// own event calendar reads. Free, no key.
//
// HARD-WON OPERATIONAL NOTES (verified 2026-07-08):
// - The CKAN "download" for this dataset serves a cached Akamai Access-Denied
//   page — useless. This c3api_data endpoint is the real feed.
// - The endpoint sits behind Akamai: requests need a browser-like User-Agent
//   and a toronto.ca Referer or they 403. `$filter` is ALWAYS 403 for
//   non-browser clients, so date filtering happens here in Node.
// - Even well-formed requests 403 intermittently under repeated calls (bot
//   scoring), hence: long TTL cache, in-flight promise sharing (stampede
//   guard), stale-on-error, and a skip-the-source failure mode.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const FEED_URL = 'https://secure.toronto.ca/c3api_data/v2/DataAccess.svc/festivals_events/events';
const HEADERS = {
  // Akamai recipe — do not "clean up": UA + Referer are what keep us at 200.
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Referer: 'https://www.toronto.ca/',
  Accept: 'application/json',
  'Cache-Control': 'no-cache'
};
const SELECT = [
  'id', 'short_name', 'short_description', 'event_image', 'event_locations',
  'featured_event', 'free_event', 'event_startdate', 'event_enddate',
  'event_expirydate', 'calendar_date', 'calendar_date_group'
].join(',');

const PAGE_SIZE = 250;
const MAX_ROWS = 500;
const TTL_MS = Number(process.env.TORONTO_EVENTS_TTL_MS) || 12 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;

const client = axios.create({ timeout: 5000 });

// Cache holds the in-flight promise (not just data) so N concurrent
// cold-cache generates share ONE upstream request instead of stampeding
// a WAF that's already suspicious of us.
const cache = { promise: null, data: null, fetchedAt: 0 };
let loggedSample = false;

// Feed dates are Toronto-local strings; compare as YYYY-MM-DD strings so the
// server's timezone never shifts an event across midnight.
function todayTorontoYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}
function addDaysYMD(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// event_locations / event_image shapes vary (sometimes JSON-encoded strings,
// sometimes arrays, sometimes absent) — parse defensively.
function coerceArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch { return []; }
  }
  return v ? [v] : [];
}

function parseLocation(row) {
  const locs = coerceArray(row.event_locations);
  const first = locs[0];
  if (!first) return { venue: null, address: null, lat: null, lng: null };
  if (typeof first === 'string') {
    const idx = first.indexOf(':');
    return idx > 0
      ? { venue: first.slice(0, idx).trim(), address: first.slice(idx + 1).trim(), lat: null, lng: null }
      : { venue: first.trim(), address: null, lat: null, lng: null };
  }
  return {
    venue: first.location_name || first.name || null,
    address: first.address || null,
    lat: first.coords && first.coords.lat != null ? Number(first.coords.lat) : (first.lat != null ? Number(first.lat) : null),
    lng: first.coords && first.coords.lng != null ? Number(first.coords.lng) : (first.lng != null ? Number(first.lng) : null)
  };
}

function parseImage(row) {
  const imgs = coerceArray(row.event_image);
  const first = imgs[0];
  if (!first) return null;
  const url = typeof first === 'string' ? first : (first.url || first.src || null);
  if (!url || !/^https?:\/\//i.test(String(url).replace(/^\/\//, 'https://'))) {
    // Relative paths are toronto.ca-hosted
    return url ? 'https://www.toronto.ca' + (String(url).startsWith('/') ? url : '/' + url) : null;
  }
  return String(url).replace(/^\/\//, 'https://');
}

function normalizeRow(row, dateYMD) {
  const loc = parseLocation(row);
  return {
    source: 'toronto_open_data',
    id: 'to-' + row.id,
    title: stripHtml(row.short_name) || 'Toronto event',
    description: stripHtml(row.short_description).slice(0, 220),
    date: dateYMD,
    venue: loc.venue,
    address: loc.address,
    lat: loc.lat,
    lng: loc.lng,
    price_from: null,
    currency: null,
    cost_tier: String(row.free_event).toLowerCase() === 'yes' ? 'free' : null,
    image_url: parseImage(row),
    booking_url: null,
    maps_url: null,
    rating: null,
    civic: true
  };
}

async function fetchAllRows() {
  const rows = [];
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE_SIZE) {
    const url = `${FEED_URL}?$format=application/json;odata.metadata=none&$count=false&$top=${PAGE_SIZE}&$skip=${skip}&$select=${SELECT}&$orderby=calendar_date_group%20desc`;
    const res = await client.get(url, { headers: HEADERS });
    const page = (res.data && (res.data.value || res.data)) || [];
    if (!Array.isArray(page) || page.length === 0) break;
    if (!loggedSample && page[0]) {
      // One-time shape log: pins the real event_locations/event_image encoding.
      console.log('[torontoOpenData] sample row:', JSON.stringify(page[0]).slice(0, 600));
      loggedSample = true;
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function toUpcomingEvents(rows) {
  const today = todayTorontoYMD();
  const horizon = addDaysYMD(today, WINDOW_DAYS);
  // One row per calendar occurrence — keep each event's nearest upcoming date.
  const byId = new Map();
  for (const row of rows) {
    const dateYMD = String(row.calendar_date_group || row.calendar_date || row.event_startdate || '').slice(0, 10);
    if (!dateYMD || dateYMD < today || dateYMD > horizon) continue;
    const existing = byId.get(row.id);
    if (!existing || dateYMD < existing.date) byId.set(row.id, normalizeRow(row, dateYMD));
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getUpcomingEvents({ limit = 20, keyword } = {}) {
  const fresh = cache.data && Date.now() - cache.fetchedAt < TTL_MS;
  if (!fresh) {
    if (!cache.promise) {
      cache.promise = fetchAllRows()
        .then(rows => {
          cache.data = toUpcomingEvents(rows);
          cache.fetchedAt = Date.now();
        })
        .catch(err => {
          console.warn('[torontoOpenData] fetch failed:', err.message, cache.data ? '(serving stale)' : '(no data)');
        })
        .finally(() => { cache.promise = null; });
    }
    await cache.promise;
  }
  let events = cache.data || []; // stale-on-error: last good data or nothing
  if (keyword) {
    const k = String(keyword).toLowerCase();
    events = events.filter(e =>
      e.title.toLowerCase().includes(k) || e.description.toLowerCase().includes(k)
    );
  }
  return events.slice(0, limit);
}

module.exports = { getUpcomingEvents };
