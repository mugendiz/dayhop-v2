// services/googleMaps.js — DayHop V2
// Wraps Google Places API (New) for worldwide place search + geocoding.
// Used to ground Grok's suggestions in real, verifiable venues instead of
// AI-generated guesses.
//
// COST CONTRACT (read before touching any call below):
// Every metered request goes through services/apiCache — persistent
// (Supabase) + in-memory cache, in-flight de-duplication across concurrent
// users, and a daily USD budget. Nothing here may call Google directly
// without (a) a cache key coarse enough that two neighbours share it and
// (b) a spend() charge against the right SKU. The Sept 2026 $100 bill came
// from per-process caches that died on every deploy; see apiCache.js.

const axios = require('axios');
const apiCache = require('./apiCache');

const PLACES_BASE = 'https://places.googleapis.com/v1';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function assertConfigured() {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not set.');
    err.code = 'MAPS_NOT_CONFIGURED';
    throw err;
  }
}

// Coarse coordinate keys. Text search is a *bias* (not a restriction), so
// results are near-identical for anyone within a few km — a ~5 km cell
// (0.05°) lets a whole neighbourhood share one purchased search instead of
// the old ~1 km cells that made every user's driveway a fresh cache miss.
const grid = (lat, lng, step) => (lat != null && lng != null)
  ? `${(Math.round(Number(lat) / step) * step).toFixed(3)},${(Math.round(Number(lng) / step) * step).toFixed(3)}`
  : 'none';

/**
 * Geocode a free-text location ("Richmond Hill, ON" / "Lisbon, Portugal")
 * into lat/lng. A static lookup: cached 30 days. "Not found" is a stable
 * answer and is cached (as null) for 7 days; transient failures are not.
 */
async function geocode(locationText) {
  assertConfigured();
  const key = `maps:geo:${String(locationText).trim().toLowerCase()}`;
  const value = await apiCache.cached({
    key,
    ttlMs: 30 * DAY,
    fetch: async () => {
      apiCache.spend('geocode');
      const res = await axios.get(GEOCODE_URL, {
        params: { address: locationText, key: process.env.GOOGLE_MAPS_API_KEY },
        timeout: 10000
      });
      const result = res.data?.results?.[0];
      if (!result) return null; // stable miss — cache it, don't re-buy it
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted_address: result.formatted_address
      };
    }
  });
  if (!value) {
    const err = new Error(`Could not locate "${locationText}"`);
    err.code = 'GEOCODE_NOT_FOUND';
    throw err;
  }
  return { ...value };
}

/**
 * Autocomplete a partially-typed location ("niag" → "Niagara Falls, ON,
 * Canada") via Places Autocomplete (New). Biased (not restricted) around
 * lat/lng when provided. Cached 24h on prefix + ~50 km bias cell — the
 * same prefixes recur across users and days.
 */
async function autocompletePlaces({ input, lat, lng }) {
  assertConfigured();
  const key = `maps:auto:${String(input).trim().toLowerCase()}|${grid(lat, lng, 0.5)}`;
  const value = await apiCache.cached({
    key,
    ttlMs: DAY,
    fetch: async () => {
      apiCache.spend('autocomplete');
      const body = {
        input: String(input).slice(0, 120),
        // Geography only — cities, neighbourhoods, postal codes — never
        // businesses ("Lisbon Paving Co." must not answer "where?").
        includedPrimaryTypes: ['(regions)']
      };
      if (lat != null && lng != null) {
        body.locationBias = {
          circle: { center: { latitude: lat, longitude: lng }, radius: 50000 }
        };
      }
      const res = await axios.post(`${PLACES_BASE}/places:autocomplete`, body, {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY
        }
      });
      const suggestions = res.data?.suggestions || [];
      return suggestions
        .map(s => s.placePrediction)
        .filter(Boolean)
        .map(p => ({
          place_id: p.placeId || null,
          text: p.text?.text || '',
          main: p.structuredFormat?.mainText?.text || p.text?.text || '',
          secondary: p.structuredFormat?.secondaryText?.text || ''
        }))
        .filter(p => p.text);
    }
  });
  return value.map(p => ({ ...p }));
}

/**
 * Text-search Google Places (New API) for venues matching a query, biased
 * around a lat/lng. Returns a normalized, lightweight shape.
 *
 * The priciest call in the pipeline (Enterprise + Atmosphere field mask,
 * up to 7 per cold gather). Cached 3 days on query + ~5 km cell: venue
 * lists don't change hour to hour, and the default-pool warmer alone
 * re-buys 36 of these a day at a 24h TTL. Each hit hands back fresh
 * clones so the candidate pipeline can stamp per-request fields without
 * poisoning the cache.
 */
const SEARCH_TTL_MS = 7 * DAY;

async function searchPlaces({ query, lat, lng, radiusMeters = 15000, maxResults = 8 }) {
  assertConfigured();
  const key = `maps:search:${String(query).trim().toLowerCase()}|${grid(lat, lng, 0.05)}|${radiusMeters}|${maxResults}`;
  const places = await apiCache.cached({
    key,
    ttlMs: SEARCH_TTL_MS,
    fetch: () => fetchPlaces({ query, lat, lng, radiusMeters, maxResults })
  });
  return places.map(p => ({ ...p }));
}

/**
 * Uncached text search for the venue index (services/venueIndex.js), which
 * keeps its own 30-day store. Charged to the 'index' bucket: counted, but
 * not under the per-user daily USD cap (the refresh caps rows instead).
 */
async function searchPlacesFresh({ query, lat, lng, radiusMeters = 20000, maxResults = 20, bucket = 'index' }) {
  assertConfigured();
  return fetchPlaces({ query, lat, lng, radiusMeters, maxResults, bucket });
}

async function fetchPlaces({ query, lat, lng, radiusMeters, maxResults, bucket = 'live' }) {
  apiCache.spend('text_search_ent_atm', { bucket });
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
        'places.websiteUri',
        'places.photos',
        'places.businessStatus',
        'places.regularOpeningHours.weekdayDescriptions',
        // Patio truth for the bar/restaurant outdoor-space gate
        // (candidates.js). NOTE: this field bills Text Search at the
        // Enterprise + Atmosphere SKU ($40/1k vs $35/1k Enterprise) —
        // dropping it is the next lever if the Maps bill needs trimming.
        'places.outdoorSeating'
      ].join(',')
    }
  });

  const places = res.data?.places || [];
  return places.map(normalizePlace);
}

/**
 * Identity-only text search on the Pro SKU ($32/1k, 5,000 free a month vs
 * 1,000 for the Enterprise mask above): id, name, address, location,
 * open/closed status, photo. For lookups that only need to know WHICH
 * place and WHETHER it is open — the autopilot's closed-tag veto, the
 * detail panel's "find the place_id first" step. No rating, hours, price,
 * website or patio fields (those are what make the full search Enterprise).
 * Cached 14 days: identity does not drift.
 */
async function searchPlacesLite({ query, lat, lng, radiusMeters = 30000, maxResults = 3 }) {
  assertConfigured();
  const key = `maps:search-lite:${String(query).trim().toLowerCase()}|${grid(lat, lng, 0.05)}|${maxResults}`;
  const places = await apiCache.cached({
    key,
    ttlMs: 14 * DAY,
    fetch: async () => {
      apiCache.spend('text_search_pro');
      const body = { textQuery: query, maxResultCount: maxResults };
      if (lat != null && lng != null) {
        body.locationBias = {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters }
        };
      }
      const res = await axios.post(`${PLACES_BASE}/places:searchText`, body, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': [
            'places.id', 'places.displayName', 'places.formattedAddress',
            'places.location', 'places.types', 'places.googleMapsUri',
            'places.photos', 'places.businessStatus'
          ].join(',')
        }
      });
      return (res.data?.places || []).map(normalizePlace);
    }
  });
  return places.map(p => ({ ...p }));
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

// Google place types → DayHop categories. Places results dominate the pool
// (~36 of 60) yet used to carry NO category, so the R&R/Adventure category
// boost was a no-op for them and mode ranking hung on a single regex.
// Ordered: the most specific/telling read of a place wins (a brewery that is
// also tagged restaurant reads as patios, a water park never reads as park).
const TYPE_CATEGORIES = [
  ['adventures', ['adventure_sports_center', 'amusement_park', 'go_kart_track', 'ski_resort',
    'sports_activity_location', 'roller_coaster', 'off_roading_area', 'cycling_park', 'skateboard_park']],
  ['water', ['water_park', 'swimming_pool', 'beach', 'marina', 'boat_rental', 'kayaking_area']],
  ['kids', ['playground', 'zoo', 'aquarium', 'amusement_center', 'bowling_alley',
    'childrens_camp', 'wildlife_park', 'petting_zoo']],
  ['culture', ['museum', 'art_gallery', 'performing_arts_theater', 'historical_landmark',
    'cultural_center', 'movie_theater', 'planetarium', 'auditorium', 'observation_deck']],
  ['patios', ['bar', 'pub', 'night_club', 'winery', 'brewery', 'wine_bar', 'bar_and_grill']],
  ['food', ['restaurant', 'cafe', 'coffee_shop', 'bakery', 'ice_cream_shop', 'dessert_shop',
    'food_court', 'market', 'tea_house', 'brunch_restaurant', 'pizza_restaurant']],
  ['general', ['park', 'national_park', 'state_park', 'hiking_area', 'botanical_garden',
    'garden', 'campground', 'picnic_ground', 'visitor_center', 'natural_feature']]
];

function inferCategory(types) {
  if (!types || !types.length) return null;
  const have = new Set(types);
  for (const [category, list] of TYPE_CATEGORIES) {
    if (list.some(t => have.has(t))) return category;
  }
  return null;
}

function normalizePlace(p) {
  const types = p.types || [];
  const photoName = p.photos?.[0]?.name || null;
  return {
    place_id: p.id,
    title: p.displayName?.text || 'Unknown place',
    description: humanizeTypes(types),
    category: inferCategory(types),
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
    // The venue's own site (Google's listing link) — the booking fallback
    // when no direct partner product link exists.
    website: p.websiteUri || null,
    // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY — the candidate
    // pipeline drops non-operational places so we never recommend one.
    business_status: p.businessStatus || null,
    // true/false when Google knows, null when it doesn't — the candidate
    // pipeline's outdoor-space gate treats null as "no patio evidence".
    outdoor_seating: p.outdoorSeating ?? null,
    open_hours: p.regularOpeningHours?.weekdayDescriptions || null
  };
}

/**
 * Reverse geocode lat/lng into a friendly locality label ("Richmond Hill",
 * postal prefix "L4C"). Keyed on a ~1 km cell (a town name doesn't change
 * inside a kilometre) and cached 30 days. "No locality" is cached as null.
 */
async function reverseGeocode({ lat, lng }) {
  assertConfigured();
  const key = `maps:rev:${grid(lat, lng, 0.01)}`;
  const value = await apiCache.cached({
    key,
    ttlMs: 30 * DAY,
    fetch: async () => {
      apiCache.spend('geocode');
      const res = await axios.get(GEOCODE_URL, {
        params: {
          latlng: `${lat},${lng}`,
          result_type: 'locality|neighborhood|postal_code',
          key: process.env.GOOGLE_MAPS_API_KEY
        },
        timeout: 8000
      });

      let city = null;
      let neighborhood = null;
      let postalPrefix = null;
      for (const result of res.data?.results || []) {
        for (const comp of result.address_components || []) {
          if (!city && comp.types.includes('locality')) city = comp.long_name;
          if (!neighborhood && comp.types.includes('neighborhood')) neighborhood = comp.long_name;
          if (!postalPrefix && comp.types.includes('postal_code')) {
            postalPrefix = comp.long_name.replace(/\s/g, '').slice(0, 3).toUpperCase();
          }
        }
      }
      if (!city) city = neighborhood;
      if (!city) return null;
      const label = [neighborhood && neighborhood !== city ? neighborhood : null, city, postalPrefix]
        .filter(Boolean).join(' · ');
      return { city, label };
    }
  });
  if (!value) {
    const err = new Error('No reverse-geocode match for that location');
    err.code = 'REVERSE_NOT_FOUND';
    throw err;
  }
  return { ...value };
}

/**
 * Full place lookup for the detail panel: extra photos, Google's editorial
 * summary, live open-now status, hours, and rating depth. Cached 24h (the
 * detail route persists the merged payload for 24h as well; this layer
 * additionally de-duplicates concurrent viewers of the same place).
 */
async function getPlaceDetails(placeId) {
  assertConfigured();
  const value = await apiCache.cached({
    key: `maps:details:${placeId}`,
    ttlMs: DAY,
    fetch: async () => {
      apiCache.spend('place_details_ent_atm');
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
  });
  return { ...value, photos: [...(value.photos || [])] };
}

/**
 * Find a real venue photo for an idea that arrived without one (curated
 * catalog, open-data events). Photos-only field mask + single result is
 * the Pro SKU ($32/1k — NOT cheap). Cached 14 days by venue query, misses
 * included, so a venue is looked up about twice a month across ALL users
 * and restarts. The curated catalog should never reach here at all —
 * scripts/photo-catalog.js bakes its photos into data/catalogPhotos.json.
 */
async function findPhotoUrl({ query, lat, lng }) {
  assertConfigured();
  const key = `maps:photo-search:${String(query).trim().toLowerCase()}`;
  return apiCache.cached({
    key,
    ttlMs: 14 * DAY,
    fetch: async () => {
      apiCache.spend('text_search_pro');
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
      return photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null;
    }
  });
}

/**
 * Resolve a Places photo resource name ("places/…/photos/…") to its image
 * URI. Google's photo URIs are long-lived; cached 7 days so a card image
 * is bought once per week across all viewers, not once per process.
 */
async function getPhotoUri(photoName, { maxWidthPx = 800 } = {}) {
  assertConfigured();
  const value = await apiCache.cached({
    key: `maps:photo-uri:${photoName}|${maxWidthPx}`,
    ttlMs: 7 * DAY,
    fetch: async () => {
      apiCache.spend('place_photo', { bucket: 'photo' });
      const res = await axios.get(`${PLACES_BASE}/${photoName}/media`, {
        params: { maxWidthPx, skipHttpRedirect: true, key: process.env.GOOGLE_MAPS_API_KEY },
        timeout: 8000
      });
      return res.data?.photoUri || null;
    }
  });
  if (!value) {
    const err = new Error('Places returned no photoUri');
    err.code = 'PHOTO_NOT_FOUND';
    throw err;
  }
  return value;
}

module.exports = {
  geocode, searchPlaces, searchPlacesLite, searchPlacesFresh, getPlaceDetails, getPhotoUri, findPhotoUrl, reverseGeocode, autocompletePlaces,
  usageStatus: apiCache.usageStatus
};
