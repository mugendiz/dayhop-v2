// services/attractionsOntario.js — DayHop V2
// Attractions Ontario event listings — member-submitted festivals and events
// across Ontario's tourism regions. No official API, but the site's WordPress
// REST surface is public and keyless (verified 2026-07-19):
//   GET attractionsontario.ca/wp-json/wp/v2/ajde_events
//     ?event_type=332           — region term: Greater Toronto & Hamilton
//     &_embed=wp:featuredmedia  — one round trip for the event image
// The EventON plugin's own REST route (/eventon/v1/data) is a stub that
// answers {"html":"test"} — don't "upgrade" to it. Event start dates are NOT
// in the REST payload (EventON keeps them in unexposed postmeta), so they're
// parsed from the listing prose; events with no parseable current/future
// date are dropped rather than shown stale.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

// Region term ids from GET /wp-json/wp/v2/event_type:
// 332 greater-toronto-hamilton (the GTA gate in candidates.js implies this).
const BASE_URL = 'https://attractionsontario.ca/wp-json/wp/v2/ajde_events';
const REGION_GTA = 332;
const FETCH_ROWS = 30;
const TTL_MS = 6 * 60 * 60 * 1000;

const client = axios.create({ timeout: 5000 });

const cache = { promise: null, data: null, fetchedAt: 0 };
let warned = false;

function todayTorontoYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// WP renders titles/content with numeric + a handful of named entities.
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
// "July 1 – September 30, 2026", "Sept 5 to 7, 2026" — start and end.
const RANGE_RE = new RegExp(
  `\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–—]|to|through|until)\\s*(?:${MONTH_RE}\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})`, 'gi');
// "Sunday, September 20, 2026" / "September 20 2026"
const SINGLE_RE = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})`, 'gi');

function ymd(y, m, d) {
  if (!m || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function monthNum(name) {
  return MONTHS[String(name || '').slice(0, 3).toLowerCase()] || 0;
}

// Best event date from listing prose: today if an ongoing range covers it,
// else the earliest future mention; null when everything mentioned is past.
function extractEventDate(text, today) {
  const intervals = [];
  let m;
  RANGE_RE.lastIndex = 0;
  while ((m = RANGE_RE.exec(text)) !== null) {
    const [, m1, d1, m2, d2, year] = m;
    const start = ymd(year, monthNum(m1), Number(d1));
    const end = ymd(year, monthNum(m2 || m1), Number(d2));
    if (start && end && start <= end) intervals.push([start, end]);
  }
  SINGLE_RE.lastIndex = 0;
  while ((m = SINGLE_RE.exec(text)) !== null) {
    const [, mon, day, year] = m;
    const d = ymd(year, monthNum(mon), Number(day));
    if (d) intervals.push([d, d]);
  }
  if (!intervals.length) return { date: null, mentioned: false };
  for (const [start, end] of intervals) {
    if (start <= today && today <= end) return { date: today, mentioned: true };
  }
  const future = intervals.map(i => i[0]).filter(d => d > today).sort();
  return { date: future[0] || null, mentioned: true };
}

// Listings usually open with the venue on its own line ("Sharon Museum and
// Gardens<br/>…"). Take it only when it reads like a name, not a sentence.
function extractVenue(contentHtml) {
  const first = stripHtml(String(contentHtml || '').split(/<br\s*\/?>|<\/p>/i)[0]);
  if (first.length >= 3 && first.length <= 60 && !/[.!?]$/.test(first) &&
      !/\bjoin|visit|welcome\b/i.test(first) && !/\d/.test(first) && !/\b[ap]m\b/i.test(first)) {
    return first;
  }
  return null;
}

function normalizeEvent(e, today) {
  const contentHtml = (e.content && e.content.rendered) || '';
  const text = stripHtml(contentHtml);
  const { date } = extractEventDate(text, today);
  if (!date) return null; // past or undated — never surface stale events
  const media = e._embedded && e._embedded['wp:featuredmedia'];
  return {
    source: 'attractions_ontario',
    id: 'ao-' + e.id,
    title: decodeEntities((e.title && e.title.rendered) || 'Untitled event'),
    description: text.slice(0, 220),
    category: 'events',
    date,
    datetime: null,
    venue: extractVenue(contentHtml),
    address: null,
    lat: null,
    lng: null,
    price_from: null,
    currency: null,
    image_url: (media && media[0] && media[0].source_url) || null,
    booking_url: e.link || null,
    rating: null
  };
}

async function fetchRegionEvents() {
  const res = await client.get(BASE_URL, {
    params: {
      event_type: REGION_GTA,
      per_page: FETCH_ROWS,
      orderby: 'modified',
      order: 'desc',
      _embed: 'wp:featuredmedia'
    }
  });
  const today = todayTorontoYMD();
  const events = (Array.isArray(res.data) ? res.data : [])
    .map(e => normalizeEvent(e, today))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

async function searchEvents({ limit = 10 } = {}) {
  const fresh = cache.data && Date.now() - cache.fetchedAt < TTL_MS;
  if (!fresh && !cache.promise) {
    cache.promise = fetchRegionEvents()
      .then(events => {
        cache.data = events;
        cache.fetchedAt = Date.now();
        return events;
      })
      .catch(err => {
        if (!warned) { console.warn('[attractions-ontario] unavailable:', err.message); warned = true; }
        return cache.data || []; // stale-on-error beats an empty shelf
      })
      .finally(() => { cache.promise = null; });
  }
  const events = fresh ? cache.data : await (cache.promise || Promise.resolve(cache.data || []));
  return (events || []).slice(0, limit);
}

module.exports = { searchEvents };
