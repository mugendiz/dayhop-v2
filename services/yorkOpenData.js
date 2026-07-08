// services/yorkOpenData.js — DayHop V2
// York Region civic POIs — EXPERIMENTAL, off by default (YORK_OPEN_DATA_ENABLED).
// York Region publishes NO events/festivals dataset on its ArcGIS open-data hub
// (verified 2026-07-08: hub search returns only historical maps + traffic
// disruptions; the "Event Listing" hub document 404s). Until one exists, York
// event coverage comes from curated + community submissions. This connector
// surfaces City of Markham parks (open data GeoJSON) as civic POIs for
// park-flavored prompts — it overlaps Google Places, hence default-off.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const MARKHAM_PARKS_URL =
  'https://opendata.arcgis.com/api/v3/datasets/d6d3ca08120741798181e187650defc0_0/downloads/data?format=geojson&spatialRefId=4326';
const TTL_MS = 24 * 60 * 60 * 1000;

const client = axios.create({ timeout: 5000 });
const cache = { promise: null, data: null, fetchedAt: 0 };

function centroid(geometry) {
  // Average of the outer ring — good enough to pin a park on a map.
  try {
    const ring = geometry.type === 'MultiPolygon'
      ? geometry.coordinates[0][0]
      : geometry.coordinates[0];
    let lat = 0, lng = 0;
    for (const [x, y] of ring) { lng += x; lat += y; }
    return { lat: lat / ring.length, lng: lng / ring.length };
  } catch {
    return { lat: null, lng: null };
  }
}

function normalizeFeature(f, i) {
  const props = f.properties || {};
  const { lat, lng } = f.geometry ? centroid(f.geometry) : { lat: null, lng: null };
  return {
    source: 'york_open_data',
    id: 'york-' + (props.GLOBALID || props.OBJECTID || i),
    title: props.PARK_NAME || props.NAME || 'Markham park',
    description: ('Municipal park' + (props.USE_TYPE ? ` — ${props.USE_TYPE}` : '') + ' (City of Markham open data)').slice(0, 220),
    venue: null,
    address: null,
    lat,
    lng,
    price_from: null,
    currency: null,
    cost_tier: 'free',
    image_url: null,
    booking_url: null,
    maps_url: lat != null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
    rating: null,
    civic: true
  };
}

let warned = false;
async function getCivicPlaces({ limit = 12, keyword } = {}) {
  if (process.env.YORK_OPEN_DATA_ENABLED !== 'true') return [];

  const fresh = cache.data && Date.now() - cache.fetchedAt < TTL_MS;
  if (!fresh) {
    if (!cache.promise) {
      cache.promise = client.get(MARKHAM_PARKS_URL)
        .then(res => {
          const features = (res.data && res.data.features) || [];
          cache.data = features.map(normalizeFeature).filter(p => p.lat != null);
          cache.fetchedAt = Date.now();
        })
        .catch(err => {
          if (!warned) { console.warn('[yorkOpenData] unavailable:', err.message); warned = true; }
        })
        .finally(() => { cache.promise = null; });
    }
    await cache.promise;
  }
  let places = cache.data || [];
  if (keyword) {
    const k = String(keyword).toLowerCase();
    places = places.filter(p => p.title.toLowerCase().includes(k));
  }
  return places.slice(0, limit);
}

module.exports = { getCivicPlaces };
