// services/getYourGuide.js — DayHop V2
// GetYourGuide Partner API — secondary bookable-activity source, used
// alongside Viator to widen coverage and let DayHop pick the better-rated
// or better-priced option per slot. Affiliate-tagged booking links.

const axios = require('axios');

const BASE_URL = 'https://api.getyourguide.com';

function assertConfigured() {
  if (!process.env.GETYOURGUIDE_API_KEY) {
    const err = new Error('GETYOURGUIDE_API_KEY is not set.');
    err.code = 'GYG_NOT_CONFIGURED';
    throw err;
  }
}

const client = axios.create({ timeout: 12000 });

function headers() {
  return {
    'X-ACCESS-TOKEN': process.env.GETYOURGUIDE_API_KEY,
    Accept: 'application/json'
  };
}

/**
 * Search activities near a lat/lng (GetYourGuide supports geo search
 * directly, unlike Viator's destination-ID model).
 */
// 30 min result cache keyed on a ~1 km coord grid + query — top-rated
// activities for a spot move slowly, but this used to be a fresh 12 s-budget
// network call on every generate, browse miss, and Surprise press.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map(); // key -> { at, activities }

async function searchActivities({ lat, lng, query, limit = 8 }) {
  assertConfigured();

  const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}|${query || ''}|${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.activities;

  const res = await client.get(`${BASE_URL}/activities`, {
    headers: headers(),
    params: {
      cnt: 'ALL',
      lang: 'en',
      currency: 'USD',
      lat,
      lng,
      radius: 20,
      q: query,
      limit,
      sort_by: 'rating'
    }
  });

  const activities = (res.data?.data?.activities || []).map(normalizeActivity);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: Date.now(), activities });
  return activities;
}

function normalizeActivity(a) {
  const partnerId = process.env.GETYOURGUIDE_PARTNER_ID || '';
  const bookingUrl = a.deep_link
    ? `${a.deep_link}${a.deep_link.includes('?') ? '&' : '?'}partner_id=${partnerId}`
    : null;

  return {
    source: 'getyourguide',
    activity_id: a.id,
    title: a.title,
    description: (a.abstract || '').slice(0, 220),
    rating: a.rating || null,
    // rating_count is the field the quality gate and ranker read.
    rating_count: a.number_of_ratings || 0,
    review_count: a.number_of_ratings || 0,
    price_from: a.price ? a.price.amount : null,
    currency: a.price ? a.price.currency : 'USD',
    duration: a.duration ? a.duration.text : null,
    image_url: a.pictures && a.pictures[0] ? a.pictures[0].url : null,
    booking_url: bookingUrl
  };
}

module.exports = { searchActivities };
