// services/viator.js — DayHop V2
// Viator Partner API — bookable tours/activities/experiences worldwide.
// Every result carries an affiliate-tagged booking URL; this is DayHop's
// primary revenue path (commission on booked activities).

const axios = require('axios');

// Production by default; set VIATOR_API_URL to the sandbox base
// (https://api.sandbox.viator.com/partner) when using a sandbox key.
const BASE_URL = process.env.VIATOR_API_URL || 'https://api.viator.com/partner';

function assertConfigured() {
  if (!process.env.VIATOR_API_KEY) {
    const err = new Error('VIATOR_API_KEY is not set.');
    err.code = 'VIATOR_NOT_CONFIGURED';
    throw err;
  }
}

const client = axios.create({ timeout: 12000 });

function headers() {
  return {
    'exp-api-key': process.env.VIATOR_API_KEY,
    Accept: 'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json'
  };
}

// The /destinations endpoint returns Viator's ENTIRE destination catalog
// (thousands of entries, multi-MB) and its contents essentially never
// change — cache the list per process so name→id resolution costs one
// download a day instead of one per generate/browse request.
let destinationsCache = null; // { index, expires } | in-flight Promise
const DESTINATIONS_TTL_MS = 24 * 60 * 60 * 1000;

// Name→id lookups used to linear-scan the raw multi-MB array twice per
// request with a toLowerCase() per entry — synchronously blocking the event
// loop. Build the lowercase index once per catalog download instead.
function buildDestinationIndex(destinations) {
  const exact = new Map(); // lowercased name -> destinationId
  const names = [];        // [{ lower, id }] for the substring fallback
  for (const d of destinations) {
    if (!d.name) continue;
    const lower = d.name.toLowerCase();
    if (!exact.has(lower)) exact.set(lower, d.destinationId);
    names.push({ lower, id: d.destinationId });
  }
  return { exact, names };
}

async function fetchDestinations() {
  if (destinationsCache && typeof destinationsCache.then === 'function') return destinationsCache;
  if (destinationsCache && destinationsCache.expires > Date.now()) return destinationsCache.index;
  const inflight = client.get(`${BASE_URL}/destinations`, { headers: headers() })
    .then(res => {
      const index = buildDestinationIndex(res.data?.destinations || []);
      destinationsCache = { index, expires: Date.now() + DESTINATIONS_TTL_MS };
      return index;
    })
    .catch(err => {
      destinationsCache = null; // failed fill must not stick
      throw err;
    });
  destinationsCache = inflight;
  return inflight;
}

async function resolveDestinationId(destinationName) {
  assertConfigured();
  const { exact, names } = await fetchDestinations();
  const needle = String(destinationName).toLowerCase();
  let id = exact.get(needle);
  if (id == null) {
    const hit = names.find(n => n.lower.includes(needle));
    if (hit) id = hit.id;
  }
  if (id == null) {
    const err = new Error(`No Viator destination match for "${destinationName}"`);
    err.code = 'VIATOR_DEST_NOT_FOUND';
    throw err;
  }
  return id;
}

// Product search results move slowly (top-rated tours for a destination) but
// were re-fetched on every generate/browse-miss/surprise press — the only
// connector call under the destinations cache that had no cache of its own.
const SEARCH_TTL_MS = 30 * 60 * 1000;
const SEARCH_CACHE_MAX = 100;
const searchCache = new Map(); // key -> { at, products } | { at, promise }

async function searchActivities({ destinationId, topX = 8, tags = [] }) {
  assertConfigured();

  const key = `${destinationId}|${topX}|${[...tags].sort().join(',')}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) {
    return hit.promise ? hit.promise : hit.products;
  }

  const body = {
    filtering: { destination: destinationId, tags },
    pagination: { start: 1, count: topX },
    sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    currency: 'USD'
  };

  const promise = client.post(`${BASE_URL}/products/search`, body, { headers: headers() })
    .then(res => {
      const products = (res.data?.products || []).map(normalizeProduct);
      searchCache.set(key, { at: Date.now(), products });
      return products;
    })
    .catch(err => {
      searchCache.delete(key); // failed fill must not stick
      throw err;
    });
  if (searchCache.size >= SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { at: Date.now(), promise });
  return promise;
}

let warnedNoPid = false;
function normalizeProduct(p) {
  // Affiliate tagging only works with a real PID — an empty pid= param
  // just looks broken and books commission to nobody. Without one the
  // product URL still goes out (a direct product page always beats a
  // search feed), it simply isn't tagged.
  const pid = process.env.VIATOR_AFFILIATE_PID || '';
  if (!pid && !warnedNoPid) {
    warnedNoPid = true;
    console.warn('[viator] VIATOR_AFFILIATE_PID is not set — booking links earn no commission.');
  }
  const bookingUrl = p.productUrl
    ? (pid
      ? `${p.productUrl}${p.productUrl.includes('?') ? '&' : '?'}pid=${pid}&mcid=42383`
      : p.productUrl)
    : null;

  return {
    source: 'viator',
    product_code: p.productCode,
    title: p.title,
    description: (p.description || '').slice(0, 220),
    rating: p.reviews && p.reviews.combinedAverageRating != null ? p.reviews.combinedAverageRating : null,
    // rating_count is the field the quality gate and ranker read; without it
    // rated products passed the gate on a review sample that was never checked.
    rating_count: p.reviews ? (p.reviews.totalReviews || 0) : 0,
    review_count: p.reviews ? (p.reviews.totalReviews || 0) : 0,
    price_from: p.pricing && p.pricing.summary ? p.pricing.summary.fromPrice : null,
    currency: p.pricing ? (p.pricing.currency || 'USD') : 'USD',
    duration: p.duration && p.duration.fixedDurationInMinutes
      ? Math.round(p.duration.fixedDurationInMinutes / 60) + 'h'
      : null,
    image_url: (p.images && p.images[0] && p.images[0].variants
      ? (p.images[0].variants.find(v => v.width >= 480) || p.images[0].variants[0])
      : null
    ) ? (p.images[0].variants.find(v => v.width >= 480) || p.images[0].variants[0]).url : null,
    booking_url: bookingUrl
  };
}

module.exports = { resolveDestinationId, searchActivities };
