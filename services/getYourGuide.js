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
async function searchActivities({ lat, lng, query, limit = 8 }) {
  assertConfigured();

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

  const activities = res.data?.data?.activities || [];
  return activities.map(normalizeActivity);
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
    review_count: a.number_of_ratings || 0,
    price_from: a.price ? a.price.amount : null,
    currency: a.price ? a.price.currency : 'USD',
    duration: a.duration ? a.duration.text : null,
    image_url: a.pictures && a.pictures[0] ? a.pictures[0].url : null,
    booking_url: bookingUrl
  };
}

module.exports = { searchActivities };
