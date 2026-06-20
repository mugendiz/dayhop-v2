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

async function resolveDestinationId(destinationName) {
  assertConfigured();
  const res = await client.get(`${BASE_URL}/destinations`, { headers: headers() });
  const destinations = res.data?.destinations || [];
  const match = destinations.find(
    d => d.name?.toLowerCase() === destinationName.toLowerCase()
  ) || destinations.find(
    d => d.name?.toLowerCase().includes(destinationName.toLowerCase())
  );
  if (!match) {
    const err = new Error(`No Viator destination match for "${destinationName}"`);
    err.code = 'VIATOR_DEST_NOT_FOUND';
    throw err;
  }
  return match.destinationId;
}

async function searchActivities({ destinationId, topX = 8, tags = [] }) {
  assertConfigured();

  const body = {
    filtering: { destination: destinationId, tags },
    pagination: { start: 1, count: topX },
    sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    currency: 'USD'
  };

  const res = await client.post(`${BASE_URL}/products/search`, body, { headers: headers() });
  const products = res.data?.products || [];
  return products.map(normalizeProduct);
}

function normalizeProduct(p) {
  const partnerCampaignValue = process.env.VIATOR_AFFILIATE_PID || '';
  const bookingUrl = p.productUrl
    ? `${p.productUrl}${p.productUrl.includes('?') ? '&' : '?'}pid=${partnerCampaignValue}&mcid=42383`
    : null;

  return {
    source: 'viator',
    product_code: p.productCode,
    title: p.title,
    description: (p.description || '').slice(0, 220),
    rating: p.reviews && p.reviews.combinedAverageRating != null ? p.reviews.combinedAverageRating : null,
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
