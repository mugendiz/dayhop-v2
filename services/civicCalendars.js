// services/civicCalendars.js — DayHop V2
// GTA municipal event calendars on the GHD Digital (eSolutions) iCreate
// platform — markets, library programs, concerts-in-the-park, neighbourhood
// gatherings that no commercial aggregator indexes. Keyless.
//
// HARD-WON OPERATIONAL NOTES (verified 2026-07-19):
// - The public endpoint is the calendar page's own list fragment:
//     GET https://calendar.<town>.ca/<calendar>/_List
//         ?StartDate=M/D/YYYY&EndDate=M/D/YYYY&Keywords=&EventFilter=
//   It returns an HTML fragment (no JSON/RSS/iCal export exists on this
//   platform). Page is 0-indexed and page 0 (~18 rows) is plenty.
// - Requests need a browser-like User-Agent — Durham's edge answers 502 to
//   plain client UAs.
// - Two markup skins exist (Durham: card-wrapper; Richmond Hill/Oshawa:
//   calendar-list-info), but both anchor every event as
//     <a href=".../Detail/YYYY-MM-DD-HHMM-Slug" aria-label="View TITLE on DATE">
//   so parsing keys off that shared shape; skin extras (venue, description)
//   are best-effort per chunk.
// Candidate shape: see the JSDoc block in services/ticketmaster.js.

const axios = require('axios');

// "Label|https://calendar.town.ca/calendarName" pairs, semicolon-separated.
// The label doubles as the address so ranking/geo can tell towns apart.
// Towns verified live on the iCreate platform 2026-07-24 (each returned
// events from /default/_List): Aurora, Milton, Burlington, Caledon.
// Probed and NOT on this platform (skip; don't re-add): Vaughan, Markham,
// Newmarket, Whitby, Oakville, Mississauga, Brampton, Georgina, Clarington
// (no calendar.<town>.ca DNS), Ajax (times out), Pickering (308 loop).
const DEFAULT_FEEDS =
  'Richmond Hill|https://calendar.richmondhill.ca/default;' +
  'Durham Region|https://calendar.durham.ca/tourismevents;' +
  'Oshawa|https://calendar.oshawa.ca/default;' +
  'Aurora|https://calendar.aurora.ca/default;' +
  'Milton|https://calendar.milton.ca/default;' +
  'Burlington|https://calendar.burlington.ca/default;' +
  'Caledon|https://calendar.caledon.ca/default';

const WINDOW_DAYS = 45;
const TTL_MS = 6 * 60 * 60 * 1000;

const client = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'text/html'
  }
});

const cache = { promise: null, data: null, fetchedAt: 0 };
let warned = false;

function feeds() {
  return String(process.env.CIVIC_CALENDAR_FEEDS || DEFAULT_FEEDS)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const [label, url] = pair.split('|').map(p => p.trim());
      return label && url && /^https:\/\//.test(url) ? { label, url: url.replace(/\/$/, '') } : null;
    })
    .filter(Boolean);
}

function todayTorontoYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}
function addDaysYMD(ymdStr, days) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function toListDate(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return `${m}/${d}/${y}`; // the platform's picker posts en-US M/D/YYYY
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function clean(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Every skin anchors events as href="…/Detail/YYYY-MM-DD-HHMM-Slug". Titles:
// Durham/Richmond Hill put aria-label="View TITLE on WHEN" on the anchor;
// Oshawa's meta-title anchor has none, so its inner text is the fallback.
// Anchors with an empty Detail path (they do occur) carry no destination
// worth sending users to — skipped by requiring the dated slug.
const EVENT_RE = /<a[^>]+href="([^"]*\/Detail\/(\d{4}-\d{2}-\d{2})-(\d{4})[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi;
const ARIA_TITLE_RE = /aria-label="View ([^"]+?) on [^"]*"/i;

function fmtTime(hhmm) {
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(2, 4);
  if (!Number.isFinite(h) || h > 23) return null;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
}

function parseFeed(html, feed, today, endDate) {
  const events = [];
  let m;
  EVENT_RE.lastIndex = 0;
  const matches = [];
  while ((m = EVENT_RE.exec(html)) !== null) matches.push({ m, index: m.index });
  matches.forEach(({ m: match, index }, i) => {
    const [, href, date, hhmm, attrs, inner] = match;
    if (date < today || date > endDate) return;
    // Skin extras live between this anchor and the next one.
    const chunk = html.slice(index, matches[i + 1] ? matches[i + 1].index : index + 4000);
    const venueM = chunk.match(/card-location[^>]*>([^<]+)</i);
    const descM = chunk.match(/card-description[^>]*>([\s\S]{0,400}?)<\/p>/i);
    const ariaM = attrs.match(ARIA_TITLE_RE);
    const title = clean(ariaM ? ariaM[1] : (chunk.match(/card-title[^>]*>([^<]+)</i) || [])[1] || inner);
    if (!title) return;
    const time = fmtTime(hhmm);
    const description = descM
      ? clean(descM[1]).slice(0, 220)
      : `${title} — ${date}${time ? ' at ' + time : ''}, from the ${feed.label} community events calendar.`;
    events.push({
      source: 'civic_calendars',
      id: 'civ-' + new URL(feed.url).hostname.split('.')[1] + '-' + date + '-' + hhmm + '-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
      title,
      description,
      category: 'community',
      date,
      datetime: null,
      venue: venueM ? clean(venueM[1]) : null,
      address: feed.label,
      lat: null,
      lng: null,
      price_from: null,
      currency: null,
      image_url: null,
      booking_url: new URL(href, feed.url).href,
      rating: null,
      civic: true
    });
  });
  // Recurring programs list one row per occurrence — keep the nearest.
  const byKey = new Map();
  for (const ev of events) {
    const key = `${ev.title.toLowerCase()}|${(ev.venue || '').toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, ev);
  }
  return [...byKey.values()];
}

async function fetchAllFeeds() {
  const today = todayTorontoYMD();
  const endDate = addDaysYMD(today, WINDOW_DAYS);
  const results = await Promise.allSettled(
    feeds().map(feed =>
      client.get(`${feed.url}/_List`, {
        params: { StartDate: toListDate(today), EndDate: toListDate(endDate), Keywords: '', EventFilter: '' }
      }).then(res => parseFeed(String(res.data || ''), feed, today, endDate))
    )
  );
  const perFeed = [];
  for (const r of results) {
    if (r.status === 'fulfilled') perFeed.push(r.value);
    else if (!warned) { console.warn('[civic-calendars] feed failed:', r.reason && r.reason.message); warned = true; }
  }
  // Round-robin so one town's busy calendar can't crowd out the others once
  // the source cap slices; each feed is already chronological, so the merge
  // stays roughly nearest-first without a global sort undoing the balance.
  const merged = [];
  for (let i = 0; perFeed.some(list => i < list.length); i++) {
    for (const list of perFeed) if (i < list.length) merged.push(list[i]);
  }
  return merged;
}

async function searchEvents({ limit = 10 } = {}) {
  const fresh = cache.data && Date.now() - cache.fetchedAt < TTL_MS;
  if (!fresh && !cache.promise) {
    cache.promise = fetchAllFeeds()
      .then(events => {
        cache.data = events;
        cache.fetchedAt = Date.now();
        return events;
      })
      .catch(err => {
        if (!warned) { console.warn('[civic-calendars] unavailable:', err.message); warned = true; }
        return cache.data || [];
      })
      .finally(() => { cache.promise = null; });
  }
  const events = fresh ? cache.data : await (cache.promise || Promise.resolve(cache.data || []));
  return (events || []).slice(0, limit);
}

module.exports = { searchEvents };
