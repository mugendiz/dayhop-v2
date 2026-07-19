// services/seeker.js — DayHop V2
// Seeker Events API (seeker.io) — hyperlocal community events: farmers
// markets, gallery openings, pop-ups, neighbourhood gatherings the national
// aggregators don't index. ACCESS IS REQUEST-ONLY: no public docs exist, so
// request API access at seeker.io/events/events-api and set both
// SEEKER_API_URL (base URL from their onboarding) and SEEKER_API_KEY.
// Silent no-op until then.
//
// UNVERIFIED CONTRACT (2026-07-19): endpoint path, param names, and auth
// header below are a conventional-REST guess pending onboarding docs; the
// response FIELD names come from their published API page (title,
// description, start/end ISO 8601, venue name/address, lat/lng, organizer,
// categories, image URL, ticket URL, event id). Expect to adjust
// normalizeEvent() once real credentials arrive.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const client = axios.create({ timeout: 5000 });
let warned = false;

function normalizeEvent(e) {
  const start = e.start || e.start_datetime || e.start_time || null;
  return {
    source: 'seeker',
    id: 'skr-' + (e.id || e.event_id || Math.random().toString(36).slice(2)),
    title: e.title || 'Untitled event',
    description: String(e.description || '').slice(0, 220),
    category: Array.isArray(e.categories) ? String(e.categories[0] || '') : (e.category || null),
    date: start ? String(start).slice(0, 10) : null,
    datetime: start || null,
    venue: (e.venue && (e.venue.name || e.venue)) || e.venue_name || null,
    address: (e.venue && e.venue.address) || e.address || null,
    lat: e.lat != null ? Number(e.lat) : (e.venue && e.venue.lat != null ? Number(e.venue.lat) : null),
    lng: e.lng != null ? Number(e.lng) : (e.venue && e.venue.lng != null ? Number(e.venue.lng) : null),
    price_from: null,
    currency: null,
    image_url: e.image_url || e.image || null,
    booking_url: e.ticket_url || e.registration_url || e.url || null,
    rating: null
  };
}

async function searchEvents({ lat, lng, city, limit = 10, daysAhead = 45 } = {}) {
  const baseUrl = String(process.env.SEEKER_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.SEEKER_API_KEY;
  if (!baseUrl || !apiKey) return []; // expected-absent: stay silent

  try {
    const now = new Date();
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const res = await client.get(`${baseUrl}/events`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        lat, lng, city: city || undefined,
        start_date: now.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        limit
      }
    });
    const rows = Array.isArray(res.data) ? res.data : (res.data && (res.data.events || res.data.results)) || [];
    return rows.map(normalizeEvent).slice(0, limit);
  } catch (err) {
    if (!warned) { console.warn('[seeker] unavailable:', err.message); warned = true; }
    return [];
  }
}

module.exports = { searchEvents };
