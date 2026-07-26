// services/googleMaps.js — DayHop V2
// Wraps Google Places API (New) for worldwide place search + geocoding.
// Used to ground Grok's suggestions in real, verifiable venues instead of
// AI-generated guesses.

const axios = require('axios');

const PLACES_BASE = 'https://places.googleapis.com/v1';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function assertConfigured() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not set.');
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Geocode a free-text location ("Richmond Hill, ON" / "Lisbon, Portugal")
 * into lat/lng so we can bias place search around it.
 *
 * Cached 24h: the inputs are overwhelmingly the same handful of picker
 * city strings, and this used to pay one billable Geocoding call per
 * generate/browse-miss for what is effectively a static lookup table.
 * "Not found" is a stable answer and is cached too; transient failures
 * are evicted so they retry.
 */
const geoCache = new Map(); // normalized text -> { promise, expires }
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_CACHE_MAX = 500;

async function geocode(locationText) {
  assertConfigured();
  const key = String(locationText).trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;

  const promise = axios.get(GEOCODE_URL, {
    params: { address: locationText, key: process.env.GOOGLE_MAPS_API_KEY },
    timeout: 10000
  }).then(res => {
    const result = res.data?.results?.[0];
    if (!result) {
      const err = new Error(`Could not locate "${locationText}"`);
      err.code = 'GEOCODE_NOT_FOUND';
      throw err;
    }
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formatted_address: result.formatted_address
    };
  }).catch(err => {
    if (err.code !== 'GEOCODE_NOT_FOUND') geoCache.delete(key);
    throw err;
  });

  if (geoCache.size >= GEO_CACHE_MAX) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(key, { promise, expires: Date.now() + GEO_TTL_MS });
  return promise;
}

/**
 * Text-search Google Places (New API) for venues matching a query,
 * biased around a lat/lng. Returns a normalized, lightweight shape —
 * we deliberately don't pass the full Google payload downstream.
 */
// Text Search is the priciest call in the pipeline (Advanced-tier field
// mask, up to 7 calls per cold generate). Cached 6h on query + ~1 km coord
// grid; each hit hands back fresh clones so the candidate pipeline can
// stamp per-request fields without poisoning the cache.
const searchCache = new Map(); // key -> { promise, expires }
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_CACHE_MAX = 500;

async function searchPlaces({ query, lat, lng, radiusMeters = 15000, maxResults = 8 }) {
  assertConfigured();

  const coordKey = (lat != null && lng != null)
    ? `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}` : 'none';
  const key = `${String(query).trim().toLowerCase()}|${coordKey}|${radiusMeters}|${maxResults}`;
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return (await cached.promise).map(p => ({ ...p }));
  }

  const promise = fetchPlaces({ query, lat, lng, radiusMeters, maxResults }).catch(err => {
    searchCache.delete(key); // a failed fill must not stick for the TTL
    throw err;
  });
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { promise, expires: Date.now() + SEARCH_TTL_MS });
  return (await promise).map(p => ({ ...p }));
}

async function fetchPlaces({ query, lat, lng, radiusMeters, maxResults }) {
  const body = {
    textQuery: query,
    maxResultCount: maxResults
  };

  if (lat != null && lng != null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters }
    };
  }

  const res = await axios.post(`${PLACES_BASE}/places:searchText`, body, {
    timeout: 12000,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
        'places.types',
        'places.googleMapsUri',
        'places.photos',
        'places.businessStatus',
        'places.regularOpeningHours.weekdayDescriptions'
      ].join(',')
    }
  });

  const places = res.data?.places || [];
  return places.map(normalizePlace);
}

const PRICE_LEVEL_TO_TIER = {
  PRICE_LEVEL_FREE: 'free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$'
};

function humanizeTypes(types) {
  const skip = new Set(['point_of_interest', 'establishment']);
  return types
    .filter(t => !skip.has(t))
    .slice(0, 2)
    .map(t => t.replace(/_/g, ' '))
    .join(' · ');
}

function normalizePlace(p) {
  const types = p.types || [];
  const photoName = p.photos?.[0]?.name || null;
  return {
    place_id: p.id,
    title: p.displayName?.text || 'Unknown place',
    description: humanizeTypes(types),
    // Served through our /api/photo proxy so the API key stays server-side.
    image_url: photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null,
    address: p.formattedAddress || '',
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? 0,
    price_level: p.priceLevel || null,
    cost_tier: PRICE_LEVEL_TO_TIER[p.priceLevel] || null,
    types,
    maps_url: p.googleMapsUri || null,
    // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY — the candidate
    // pipeline drops non-operational places so we never recommend one.
    business_status: p.businessStatus || null,
    open_hours: p.regularOpeningHours?.weekdayDescriptions || null
  };
}

// Reverse geocode lat/lng into a friendly locality label ("Richmond Hill",
// postal prefix "L4C"). Cached on rounded coords — the frontend rounds to
// 3 decimals (~110 m) before sending, so keys are naturally coarse.
const reverseCache = new Map();
const REVERSE_TTL_MS = 24 * 60 * 60 * 1000;
const REVERSE_CACHE_MAX = 2000; // entries expire logically but were never deleted

async function reverseGeocode({ lat, lng }) {
  assertConfigured();
  const key = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const cached = reverseCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const res = await axios.get(GEOCODE_URL, {
    params: {
      latlng: `${lat},${lng}`,
      result_type: 'locality|neighborhood|postal_code',
      key: process.env.GOOGLE_MAPS_API_KEY
    },
    timeout: 8000
  });

  const results = res.data?.results || [];
  if (!results.length) {
    const err = new Error('No reverse-geocode match for that location');
    err.code = 'REVERSE_NOT_FOUND';
    throw err;
  }

  let city = null;
  let neighborhood = null;
  let postalPrefix = null;
  for (const result of results) {
    for (const comp of result.address_components || []) {
      if (!city && comp.types.includes('locality')) city = comp.long_name;
      if (!neighborhood && comp.types.includes('neighborhood')) neighborhood = comp.long_name;
      if (!postalPrefix && comp.types.includes('postal_code')) {
        postalPrefix = comp.long_name.replace(/\s/g, '').slice(0, 3).toUpperCase();
      }
    }
  }
  if (!city) city = neighborhood;
  if (!city) {
    const err = new Error('No locality in reverse-geocode result');
    err.code = 'REVERSE_NOT_FOUND';
    throw err;
  }

  const label = [neighborhood && neighborhood !== city ? neighborhood : null, city, postalPrefix]
    .filter(Boolean).join(' · ');
  const value = { city, label };
  if (reverseCache.size >= REVERSE_CACHE_MAX) {
    reverseCache.delete(reverseCache.keys().next().value);
  }
  reverseCache.set(key, { value, expires: Date.now() + REVERSE_TTL_MS });
  return value;
}

/**
 * Full place lookup for the detail panel: extra photos, Google's editorial
 * summary, live open-now status, hours, and rating depth. Normalized like
 * searchPlaces — photos ride through the /api/photo proxy.
 */
async function getPlaceDetails(placeId) {
  assertConfigured();
  const res = await axios.get(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    timeout: 10000,
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'id',
        'displayName',
        'editorialSummary',
        'rating',
        'userRatingCount',
        'websiteUri',
        'googleMapsUri',
        'photos',
        'currentOpeningHours.openNow',
        'regularOpeningHours.weekdayDescriptions'
      ].join(',')
    }
  });

  const p = res.data || {};
  return {
    place_id: p.id || placeId,
    title: p.displayName?.text || null,
    editorial_summary: p.editorialSummary?.text || null,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? 0,
    website: p.websiteUri || null,
    maps_url: p.googleMapsUri || null,
    open_now: p.currentOpeningHours?.openNow ?? null,
    open_hours: p.regularOpeningHours?.weekdayDescriptions || null,
    photos: (p.photos || []).slice(0, 6)
      .map(ph => ph.name ? `/api/photo?name=${encodeURIComponent(ph.name)}` : null)
      .filter(Boolean)
  };
}

// Find a real venue photo for an idea that arrived without one (curated
// catalog, open-data events). Photos-only field mask + single result keeps
// this the cheapest possible Text Search; results (including misses) are
// cached by query so the static catalog converges on zero API calls.
const photoSearchCache = new Map();
const PHOTO_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const PHOTO_SEARCH_CACHE_MAX = 2000;

async function findPhotoUrl({ query, lat, lng }) {
  assertConfigured();
  const key = String(query).trim().toLowerCase();
  const cached = photoSearchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;

  const body = { textQuery: query, maxResultCount: 1 };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 30000 }
    };
  }

  const res = await axios.post(`${PLACES_BASE}/places:searchText`, body, {
    timeout: 7000,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.photos'
    }
  });

  const photoName = res.data?.places?.[0]?.photos?.[0]?.name || null;
  const url = photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null;
  if (photoSearchCache.size >= PHOTO_SEARCH_CACHE_MAX) {
    photoSearchCache.delete(photoSearchCache.keys().next().value);
  }
  photoSearchCache.set(key, { url, expires: Date.now() + PHOTO_SEARCH_TTL_MS });
  return url;
}

// Resolve a Places photo resource name ("places/…/photos/…") to its
// image URI. Cached in-memory so repeat card renders don't re-hit Google.
const photoUriCache = new Map();
const PHOTO_TTL_MS = 12 * 60 * 60 * 1000;
const PHOTO_URI_CACHE_MAX = 2000;

async function getPhotoUri(photoName, { maxWidthPx = 800 } = {}) {
  assertConfigured();
  const cached = photoUriCache.get(photoName);
  if (cached && cached.expires > Date.now()) return cached.uri;

  const res = await axios.get(`${PLACES_BASE}/${photoName}/media`, {
    params: { maxWidthPx, skipHttpRedirect: true, key: process.env.GOOGLE_MAPS_API_KEY },
    timeout: 8000
  });
  const uri = res.data?.photoUri;
  if (!uri) {
    const err = new Error('Places returned no photoUri');
    err.code = 'PHOTO_NOT_FOUND';
    throw err;
  }
  if (photoUriCache.size >= PHOTO_URI_CACHE_MAX) {
    photoUriCache.delete(photoUriCache.keys().next().value);
  }
  photoUriCache.set(photoName, { uri, expires: Date.now() + PHOTO_TTL_MS });
  return uri;
}

module.exports = { geocode, searchPlaces, getPlaceDetails, getPhotoUri, findPhotoUrl, reverseGeocode };
