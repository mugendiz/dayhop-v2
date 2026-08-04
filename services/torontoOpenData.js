// services/torontoOpenData.js — DayHop V2
// City of Toronto "Festivals & Events" calendar — the same feed toronto.ca's
// own event calendar reads. Free, no key.
//
// HARD-WON OPERATIONAL NOTES (re-verified 2026-08-04):
// - The CKAN "download" for this dataset serves a cached Akamai Access-Denied
//   page — useless. This c3api_data endpoint is the real feed.
// - As of ~Aug 2026 Akamai fingerprints the TLS handshake itself: axios/curl
//   403 on EVERY request no matter the headers, while the same URL from real
//   Chrome (same IP) is 200. impit's Chrome impersonation passes; its
//   Firefox impersonation is 403 — the allowlist is literally Chrome-shaped.
//   So the fetch goes through impit, with plain axios as a fallback if the
//   native binding ever fails to load (fallback keeps the old header recipe
//   and will likely 403, but the source already fails soft).
// - Don't send a User-Agent override through impit: it supplies a UA that
//   matches its TLS fingerprint, and a mismatched UA re-trips the bot score.
// - `$filter` (403 for non-browser clients historically) WORKS through the
//   Chrome fingerprint — date fields are Edm.Date, so literals go unquoted:
//   `calendar_date_group ge 2026-08-04`. Quoted strings are a 400. The
//   server-side window matters: unfiltered, the feed orders desc and the
//   first 500 rows are the farthest-future occurrences (2027+), so the
//   old fetch-then-filter approach returned 0 upcoming events. Node-side
//   date filtering stays as a cheap safety net.
// - Even well-formed requests can 403 intermittently under repeated calls
//   (bot scoring), hence: long TTL cache, in-flight promise sharing
//   (stampede guard), stale-on-error, and a skip-the-source failure mode.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const FEED_URL = 'https://secure.toronto.ca/c3api_data/v2/DataAccess.svc/festivals_events/events';
const HEADERS = {
  Referer: 'https://www.toronto.ca/',
  Accept: 'application/json'
};

let impitClient; // lazy singleton — reused across fetches so the TLS session persists
function getImpit() {
  if (impitClient === undefined) {
    try {
      const { Impit } = require('impit');
      impitClient = new Impit({ browser: 'chrome', timeout: 5000 });
    } catch (err) {
      impitClient = null;
      console.warn('[torontoOpenData] impit unavailable (' + err.message + ') — falling back to axios (Akamai will likely 403)');
    }
  }
  return impitClient;
}
const SELECT = [
  'id', 'short_name', 'short_description', 'event_image', 'event_locations',
  'featured_event', 'free_event', 'event_startdate', 'event_enddate',
  'event_expirydate', 'calendar_date', 'calendar_date_group'
].join(',');

const PAGE_SIZE = 250;
const MAX_ROWS = 500;
const TTL_MS = Number(process.env.TORONTO_EVENTS_TTL_MS) || 12 * 60 * 60 * 1000;
// A failed fetch (all retries exhausted) shouldn't wait out the full 12h TTL
// before trying again, but also shouldn't retry on every request while
// Akamai's bot score is hot — this is the cooldown between failed attempts.
const NEGATIVE_TTL_MS = Number(process.env.TORONTO_EVENTS_NEGATIVE_TTL_MS) || 15 * 60 * 1000;
const WINDOW_DAYS = 60;

const client = axios.create({ timeout: 5000 });
const RETRY_DELAYS_MS = [400, 1200, 2800]; // 3 retries — Akamai's bot score is per-request, not sustained, so a few spaced attempts often clear a 403 that a single try wouldn't.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// One GET, impit-first: returns parsed JSON, throws with .status on non-2xx.
async function getJson(url) {
  const impit = getImpit();
  if (impit) {
    const res = await impit.fetch(url, { headers: HEADERS });
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  const res = await client.get(url, { headers: HEADERS });
  return res.data;
}

// Akamai can still 403 intermittently (see file header) — retrying is the
// only lever we have, so spend it here rather than surfacing a fetch
// failure to the caller.
async function getWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await getJson(url);
    } catch (err) {
      lastErr = err;
      const status = err.status || (err.response && err.response.status);
      const retryable = status === 403 || !status; // 403 (bot score) or network/timeout
      if (!retryable || attempt === RETRY_DELAYS_MS.length) throw err;
      console.warn(`[torontoOpenData] attempt ${attempt + 1} failed (${status || err.message}), retrying in ${RETRY_DELAYS_MS[attempt]}ms`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

// Cache holds the in-flight promise (not just data) so N concurrent
// cold-cache generates share ONE upstream request instead of stampeding
// a WAF that's already suspicious of us.
const cache = { promise: null, data: null, fetchedAt: 0, failedAt: 0 };
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
  // Current shape is {bin_id, ...} — the calendar serves these via
  // c3api_upload (browser-fetched by the client, so Akamai is happy).
  if (first.bin_id) return 'https://secure.toronto.ca/c3api_upload/retrieve/festivals_events/' + first.bin_id;
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
  const today = todayTorontoYMD();
  const horizon = addDaysYMD(today, WINDOW_DAYS);
  // Window server-side (Edm.Date literals — no quotes) and sort ascending so
  // the MAX_ROWS cap keeps the NEAREST occurrences, not the farthest.
  const filter = encodeURIComponent(`calendar_date_group ge ${today} and calendar_date_group le ${horizon}`);
  const rows = [];
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE_SIZE) {
    const url = `${FEED_URL}?$format=application/json;odata.metadata=none&$count=false&$top=${PAGE_SIZE}&$skip=${skip}&$select=${SELECT}&$orderby=calendar_date_group&$filter=${filter}`;
    const data = await getWithRetry(url);
    const page = (data && (data.value || data)) || [];
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
  // Skip the network entirely while a recent failure is on cooldown — Akamai
  // is already suspicious of us, and every request during a sustained block
  // just feeds the bot score, worse.
  const coolingDown = cache.failedAt && Date.now() - cache.failedAt < NEGATIVE_TTL_MS;
  if (!fresh && !coolingDown) {
    if (!cache.promise) {
      cache.promise = fetchAllRows()
        .then(rows => {
          cache.data = toUpcomingEvents(rows);
          cache.fetchedAt = Date.now();
          cache.failedAt = 0;
        })
        .catch(err => {
          cache.failedAt = Date.now();
          const cooldownMin = Math.round(NEGATIVE_TTL_MS / 60000);
          console.warn('[torontoOpenData] fetch failed:', err.message, cache.data ? `(serving stale, retry in ${cooldownMin}m)` : `(no data, retry in ${cooldownMin}m)`);
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
