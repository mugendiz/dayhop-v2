// services/spotlight.js — DayHop V2
// The seasonal spotlight: what the discovery engine is promoting right now.
// While the FIFA World Cup 2026 is live, it's the tournament. The moment it
// wraps, the spotlight hands off — automatically, forever — to the NEXT
// Ontario statutory/bank holiday, and the engine promotes events around
// that long weekend instead. Pure date math, no network calls, so it's
// safe to read anywhere (config route, candidate gathering, Grok prompts,
// browse sections). All dates are Toronto-local YYYY-MM-DD strings, the
// same convention the event connectors use.

// Kept in sync with WORLD_CUP_ENDS in public/app.js (the client uses its
// copy only as an offline fallback until /api/config answers).
const WORLD_CUP_ENDS_MS = Date.parse('2026-07-20T08:00:00Z');

// ---------- Ontario holiday calendar ----------
// Statutory holidays plus the Civic Holiday (first Monday of August — a
// bank holiday, not technically statutory in Ontario, but the whole GTA
// treats it as a long weekend and events cluster around it).
// event_keyword feeds the event connectors' keyword narrowing; tags feed
// the relevance scorer's text matching.

function ontarioHolidays(year) {
  const easter = easterSunday(year);
  return [
    { id: 'new-years', name: "New Year's Day", emoji: '🎇', date: ymd(year, 1, 1), event_keyword: 'new year', tags: ['new year', 'nye', 'countdown', 'first day'] },
    { id: 'family-day', name: 'Family Day', emoji: '⛸️', date: nthWeekday(year, 2, 1, 3), event_keyword: 'family day', tags: ['family day', 'skating', 'winter festival'] },
    { id: 'good-friday', name: 'Easter', emoji: '🐣', date: addDays(easter, -2), event_keyword: 'easter', tags: ['easter', 'egg hunt', 'spring'] },
    { id: 'victoria-day', name: 'Victoria Day', emoji: '🎆', date: lastWeekdayBefore(year, 5, 25, 1), event_keyword: 'victoria day', tags: ['victoria day', 'fireworks', 'may long weekend'] },
    { id: 'canada-day', name: 'Canada Day', emoji: '🇨🇦', date: ymd(year, 7, 1), event_keyword: 'canada day', tags: ['canada day', 'fireworks', 'celebration'] },
    { id: 'civic-holiday', name: 'Civic Holiday', emoji: '🎡', date: nthWeekday(year, 8, 1, 1), event_keyword: 'civic holiday', tags: ['civic holiday', 'simcoe day', 'long weekend', 'festival'] },
    { id: 'labour-day', name: 'Labour Day', emoji: '🎪', date: nthWeekday(year, 9, 1, 1), event_keyword: 'labour day', tags: ['labour day', 'cne', 'end of summer', 'air show'] },
    { id: 'thanksgiving', name: 'Thanksgiving', emoji: '🍁', date: nthWeekday(year, 10, 1, 2), event_keyword: 'thanksgiving', tags: ['thanksgiving', 'fall fair', 'harvest', 'pumpkin'] },
    { id: 'christmas', name: 'Christmas', emoji: '🎄', date: ymd(year, 12, 25), event_keyword: 'christmas', tags: ['christmas', 'holiday market', 'lights', 'santa'] },
    { id: 'boxing-day', name: 'Boxing Day', emoji: '🎁', date: ymd(year, 12, 26), event_keyword: 'boxing day', tags: ['boxing day', 'holiday', 'winter'] }
  ];
}

// Anonymous Gregorian computus (Meeus/Jones/Butcher) — Easter Sunday.
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Date-string arithmetic at UTC noon so DST can never shift the day.
function toUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function addDays(dateStr, days) {
  const dt = toUtc(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekday(dateStr) { return toUtc(dateStr).getUTCDay(); } // 0=Sun..6=Sat

// nth <weekday> of a month, e.g. Family Day = 3rd Monday of February.
function nthWeekday(year, month, wday, n) {
  const first = weekday(ymd(year, month, 1));
  const day = 1 + ((wday - first + 7) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}

// Last <weekday> strictly before a date, e.g. Victoria Day = last Monday
// before May 25.
function lastWeekdayBefore(year, month, day, wday) {
  let d = ymd(year, month, day);
  do { d = addDays(d, -1); } while (weekday(d) !== wday);
  return d;
}

// Reused formatters — Intl.DateTimeFormat construction is expensive and
// these run on every candidate gather, Grok prompt build, and config read.
const TORONTO_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
const RANGE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC', month: 'short', day: 'numeric'
});

function torontoToday(now = new Date()) {
  return TORONTO_DAY_FMT.format(now);
}

// The promo window around a holiday — the long weekend when there is one.
// Monday holidays pull in the Saturday+Sunday before; Friday holidays run
// through Easter/holiday Monday; weekend holidays cover both weekend days.
function holidayWindow(dateStr) {
  switch (weekday(dateStr)) {
    case 1: return { start: addDays(dateStr, -2), end: dateStr };      // Mon
    case 5: return { start: dateStr, end: addDays(dateStr, 3) };       // Fri
    case 6: return { start: dateStr, end: addDays(dateStr, 1) };       // Sat
    case 0: return { start: addDays(dateStr, -1), end: dateStr };      // Sun
    default: return { start: dateStr, end: dateStr };                  // midweek
  }
}

// "Aug 1–3" / "Dec 25" — for eyebrows and prompts.
function formatRange(window) {
  const fmt = d => RANGE_FMT.format(toUtc(d));
  if (window.start === window.end) return fmt(window.start);
  const sameMonth = window.start.slice(0, 7) === window.end.slice(0, 7);
  return sameMonth
    ? `${fmt(window.start)}–${window.end.split('-')[2].replace(/^0/, '')}`
    : `${fmt(window.start)} – ${fmt(window.end)}`;
}

// Next holiday whose promo window hasn't fully passed — so on the Sunday of
// a Monday long weekend the spotlight is still that weekend, not the next.
function nextHoliday(todayStr) {
  const year = Number(todayStr.slice(0, 4));
  const all = [...ontarioHolidays(year), ...ontarioHolidays(year + 1)];
  return all.find(h => holidayWindow(h.date).end >= todayStr) || null;
}

// getSpotlight is pure date math but runs several times per request (candidate
// gather, twice per Grok prompt, config, relevance) — memoize by Toronto day.
// The World Cup boundary is a mid-day instant, so it joins the key too.
let spotlightMemo = { key: null, value: null };

function getSpotlight(now = new Date()) {
  const key = `${now.getTime() < WORLD_CUP_ENDS_MS}|${torontoToday(now)}`;
  if (spotlightMemo.key === key) return spotlightMemo.value;
  const value = computeSpotlight(now);
  spotlightMemo = { key, value };
  return value;
}

function computeSpotlight(now = new Date()) {
  if (now.getTime() < WORLD_CUP_ENDS_MS) {
    return {
      kind: 'worldcup',
      id: 'worldcup-2026',
      name: 'World Cup 2026',
      emoji: '⚽',
      eyebrow: 'World Cup 2026',
      collection_title: 'World Cup watch parties near you',
      event_keyword: 'world cup',
      tags: ['world cup', 'soccer', 'watch party', 'fan fest']
    };
  }
  const today = torontoToday(now);
  const h = nextHoliday(today);
  if (!h) return null; // unreachable — the calendar always has a next entry
  const window = holidayWindow(h.date);
  const long_weekend = window.start !== window.end;
  const range = formatRange(window);
  const days_away = Math.round((toUtc(h.date) - toUtc(today)) / 86400000);
  const label = `${h.name}${long_weekend ? ' long weekend' : ''}`;
  return {
    kind: 'holiday',
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    date: h.date,
    window,
    days_away: Math.max(0, days_away),
    long_weekend,
    range,
    eyebrow: `${label} · ${range}`,
    collection_title: `${h.emoji} ${label} near you`,
    event_keyword: h.event_keyword,
    tags: h.tags,
    // One sentence for the Grok prompts — what to lean into and when.
    prompt_hint: `The ${label} (${range}) is coming up — when it fits the request, favour special events, festivals, markets, and fireworks happening around it, and mention the date.`
  };
}

// Is a dated candidate inside the spotlight's promo window (±1 day so
// eve-of and day-after events still count)? String compare is safe on
// YYYY-MM-DD.
function isAroundSpotlight(spotlight, dateStr) {
  if (!spotlight || spotlight.kind !== 'holiday' || !dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= addDays(spotlight.window.start, -1) && d <= addDays(spotlight.window.end, 1);
}

// How far ahead the event connectors should fetch so the spotlight window
// is always covered (never less than their 30-day default).
function eventDaysAhead(spotlight, now = new Date()) {
  if (!spotlight || spotlight.kind !== 'holiday') return 30;
  const days = Math.ceil((toUtc(spotlight.window.end) - toUtc(torontoToday(now))) / 86400000);
  return Math.max(30, days + 2);
}

module.exports = {
  getSpotlight,
  isAroundSpotlight,
  eventDaysAhead,
  ontarioHolidays, // exported for tests/debugging
  easterSunday,
  // Pure date-math helpers, reused by the "date aware" picker (candidates.js)
  // to parse/format the user's requested planning date/range.
  torontoToday,
  addDays,
  formatRange
};
