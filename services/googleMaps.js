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
 */
async function geocode(locationText) {
  assertConfigured();
  const res = await axios.get(GEOCODE_URL, {
    params: { address: locationText, key: process.env.GOOGLE_MAPS_API_KEY },
    timeout: 10000
  });
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
}

/**
 * Text-search Google Places (New API) for venues matching a query,
 * biased around a lat/lng. Returns a normalized, lightweight shape —
 * we deliberately don't pass the full Google payload downstream.
 */
async function searchPlaces({ query, lat, lng, radiusMeters = 15000, maxResults = 8 }) {
  assertConfigured();

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
        'places.regularOpeningHours.weekdayDescriptions'
      ].join(',')
    }
  });

  const places = res.data?.places || [];
  return places.map(normalizePlace);
}

function normalizePlace(p) {
  return {
    place_id: p.id,
    name: p.displayName?.text || 'Unknown place',
    address: p.formattedAddress || '',
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? 0,
    price_level: p.priceLevel || null,
    types: p.types || [],
    maps_url: p.googleMapsUri || null,
    open_hours: p.regularOpeningHours?.weekdayDescriptions || null
  };
}

module.exports = { geocode, searchPlaces };
