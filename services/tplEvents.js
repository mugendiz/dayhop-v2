// services/tplEvents.js — DayHop V2
// Toronto Public Library branch programs & events, via the City of Toronto
// open-data mirror of TPL's events feed. Free, keyless, ~7k rows.
//
// OPERATIONAL NOTES (verified 2026-07-24):
// - Dataset "library-branch-programs-and-events-feed" on the CKAN portal is
//   state: active (the portal UI mislabels it retired) and refreshed
//   regularly (rows carried same-month LastUpdatedOn stamps).
// - TPL's own tpl.ca WordPress REST API is auth-locked (401) and the legacy
//   torontopubliclibrary.ca RSS endpoints 301 to nowhere — this mirror is
//   the only open programmatic route.
// - Row shape: EventID (BiblioCommons id), Title, StartTime/EndTime (local
//   ISO), StartDateLocal (YYYY-MM-DD), LocationName (branch), Audiences,
//   Languages, EventTypes, IsRecurring/IsFull/RegistrationClosed ("True"/
//   "false" STRINGS, casing varies), Status ('ACTIVE'), FeaturedImageUrl.
// - Public event page: https://tpl.bibliocommons.com/events/<EventID>
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

const FEED_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fb343332-03cd-40b9-a1c8-c03a4a85ca1e/resource/aa5e1425-77f4-4cb4-a8ea-eb5ce7d4f34c/download/tpl-events-feed.json';
const WINDOW_DAYS = 45;
const TTL_MS = 6 * 60 * 60 * 1000; // the mirror refreshes daily-ish; 6h is plenty

const client = axios.create({ timeout: 15000 });
const cache = { promise: null, data: null, fetchedAt: 0 };
let warned = false;

function todayTorontoYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

function addDaysYMD(ymdStr, days) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function truthy(v) {
  return String(v).toLowerCase() === 'true';
}

function isKidsy(audiences) {
  return /child|kids|family|baby|babies|preschool|toddler|teen/i.test(String(audiences || ''));
}

function normalizeEvent(row) {
  const branch = String(row.LocationName || '').trim();
  const types = String(row.EventTypes || '').trim();
  const audiences = String(row.Audiences || '').trim();
  const bits = [];
  if (types) bits.push(types.toLowerCase());
  bits.push(`free library program at the ${branch || 'Toronto Public Library'} branch`);
  if (audiences) bits.push(`for ${audiences.toLowerCase()}`);
  return {
    source: 'tpl_events',
    id: 'tpl-' + row.EventID,
    title: String(row.Title || 'Library program').trim(),
    description: bits.join(' — ').slice(0, 220),
    category: isKidsy(audiences) ? 'kids' : 'culture',
    date: row.StartDateLocal || null,
    datetime: row.StartTime || null,
    venue: branch ? `Toronto Public Library — ${branch} Branch` : 'Toronto Public Library',
    address: branch ? `${branch} Library, Toronto` : 'Toronto',
    lat: null,
    lng: null,
    price_from: null,
    currency: null,
    image_url: row.FeaturedImageUrl || null,
    booking_url: `https://tpl.bibliocommons.com/events/${row.EventID}`,
    rating: null
  };
}

async function fetchFeed() {
  if (cache.data && Date.now() - cache.fetchedAt < TTL_MS) return cache.data;
  if (cache.promise) return cache.promise;
  cache.promise = client.get(FEED_URL)
    .then(res => {
      const rows = Array.isArray(res.data) ? res.data : [];
      cache.data = rows;
      cache.fetchedAt = Date.now();
      return rows;
    })
    .finally(() => { cache.promise = null; });
  return cache.promise;
}

/**
 * Upcoming TPL programs, soonest first. Recurring series are collapsed to
 * their nearest occurrence so weekly clubs don't crowd out variety.
 */
async function getUpcomingEvents({ limit = 8 } = {}) {
  try {
    const rows = await fetchFeed();
    const start = todayTorontoYMD();
    const end = addDaysYMD(start, WINDOW_DAYS);

    const upcoming = rows.filter(r =>
      String(r.Status || '').toUpperCase() === 'ACTIVE' &&
      !truthy(r.IsFull) && !truthy(r.RegistrationIsFull) &&
      r.StartDateLocal && r.StartDateLocal >= start && r.StartDateLocal <= end
    );
    upcoming.sort((a, b) => String(a.StartTime || '').localeCompare(String(b.StartTime || '')));

    // One row per (title, branch) — the feed lists every occurrence.
    const byKey = new Map();
    for (const r of upcoming) {
      const key = `${String(r.Title || '').toLowerCase()}|${String(r.LocationName || '').toLowerCase()}`;
      if (!byKey.has(key)) byKey.set(key, r);
    }
    return [...byKey.values()].slice(0, limit).map(normalizeEvent);
  } catch (err) {
    if (!warned) { console.warn('[tpl_events] unavailable:', err.message); warned = true; }
    return [];
  }
}

module.exports = { getUpcomingEvents };
