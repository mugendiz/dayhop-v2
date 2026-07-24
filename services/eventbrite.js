// services/eventbrite.js — DayHop V2
// Eventbrite — ORGANIZER-SCOPED ONLY. Eventbrite removed its public Event
// Search API on 2020-02-20; what still works (verified 2026-07-08) is
// GET /v3/organizers/{id}/events/ for any PUBLIC organizer — same params and
// event shape as the org-member endpoint. NOTE: /organizations/{id}/events/
// 404s for orgs your token isn't a member of — don't "fix" this back to it.
// This connector pulls live events from a curated list of GTA organizer ids
// (EVENTBRITE_ORG_IDS, comma-separated — the number at the end of an
// eventbrite.ca/o/... page URL) and is a silent no-op until that list is
// populated. Do NOT re-add public search — it no longer exists; scraping
// event pages is off-limits.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const BASE_URL = 'https://www.eventbriteapi.com/v3';
const client = axios.create({ timeout: 5000 });

// Starter set of PUBLIC GTA organizer ids (verified live on eventbrite.ca
// 2026-07-24), used when EVENTBRITE_ORG_IDS is unset. Env overrides —
// growing this list is pure config. Note the connector still needs
// EVENTBRITE_PRIVATE_TOKEN to make any calls at all.
const DEFAULT_ORG_IDS = [
  '105342665751',  // Evergreen Brickworks Events
  '8121178075',    // Evergreen (org-wide)
  '11951813124',   // Toronto Events
  '121182382014'   // Toronto Creative Events
].join(',');

function orgIds() {
  return String(process.env.EVENTBRITE_ORG_IDS || DEFAULT_ORG_IDS)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeEvent(e) {
  const venue = e.venue || null;
  return {
    source: 'eventbrite',
    id: 'eb-' + e.id,
    title: e.name && e.name.text ? e.name.text : 'Untitled event',
    description: String((e.summary || (e.description && e.description.text) || '')).slice(0, 220),
    date: e.start && e.start.local ? e.start.local.slice(0, 10) : null,
    datetime: e.start ? e.start.utc || null : null,
    venue: venue ? venue.name || null : null,
    address: venue && venue.address ? venue.address.localized_address_display || null : null,
    lat: venue && venue.latitude != null ? Number(venue.latitude) : null,
    lng: venue && venue.longitude != null ? Number(venue.longitude) : null,
    price_from: null, // ticket classes need a second call per event; skip
    currency: null,
    image_url: e.logo && e.logo.original ? e.logo.original.url : (e.logo ? e.logo.url : null),
    booking_url: e.url || null,
    rating: null
  };
}

let warned = false;
async function searchEvents({ limit = 20 } = {}) {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
  const orgs = orgIds();
  if (!token || orgs.length === 0) return []; // expected-absent: stay silent

  try {
    const results = await Promise.allSettled(
      orgs.map(orgId =>
        client.get(`${BASE_URL}/organizers/${orgId}/events/`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { status: 'live', order_by: 'start_asc', expand: 'venue' }
        })
      )
    );
    const events = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        events.push(...((r.value.data && r.value.data.events) || []).map(normalizeEvent));
      } else if (!warned) {
        console.warn('[eventbrite] org fetch failed:', r.reason && r.reason.message);
        warned = true;
      }
    }
    events.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
    // Recurring events list one row per occurrence — keep the nearest date so
    // repeats don't crowd out variety within the limit.
    const byKey = new Map();
    for (const ev of events) {
      const key = `${(ev.title || '').toLowerCase()}|${(ev.venue || '').toLowerCase()}`;
      if (!byKey.has(key)) byKey.set(key, ev);
    }
    return [...byKey.values()].slice(0, limit);
  } catch (err) {
    if (!warned) { console.warn('[eventbrite] unavailable:', err.message); warned = true; }
    return [];
  }
}

module.exports = { searchEvents };
