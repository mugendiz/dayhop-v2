// services/personalGuide.js — DayHop V2
// The personalized trip guide ($20): a buyer names an Ontario place and
// their dates, and gets a keepsake PDF built for exactly that trip.
//
// What it holds, and where each part comes from (every entry is a real,
// linked listing; nothing is written by a language model, so nothing can
// be invented):
//   history         Wikipedia, quoted and credited (services/wikiHistory)
//   must-sees       DayHop's curated catalog near the place, plus the
//                   best-rated places Google knows there
//   during your trip / this month
//                   events from the DayHop feed sources and Ticketmaster,
//                   split into "on your dates" and "also this month"
//   parks, trails, food, culture, family, active
//                   the regular DayHop feed pool for that place and window
//                   (services/candidates.gatherCandidates), both modes
//   biking, hiking routes, campgrounds, RV sites, dump stations, highway
//   service centres
//                   OpenStreetMap (services/osmTravel)
//   scenic drives and day trips
//                   the curated catalog (worth_trip, scenic drive tags)
//   day plans       assembled from the above, nearest stops together
//
// The guide is assembled ONCE after payment, stored as JSON
// (services/personalGuideStore), and the PDF is rendered from that record
// on every download, so a re-download months later is the same keepsake.
// Copy on the order page says plainly that it is built from live sources,
// not field-checked like the six city guides.

const { ONTARIO_PLACES } = require('../data/ontarioPlaces');
const curatedCatalog = require('../data/curatedCatalog');
const { MODE_PROMPTS, seasonalPrompt, DINING_QUERY } = require('../data/feedPrompts');
const { isCatalogSeasonEligible } = require('../data/seasons');

let catalogCoords = {};
try { catalogCoords = require('../data/catalogCoords.json'); } catch (e) { /* geocoded file missing */ }

const PRICE_CENTS = 2000;
// Five weeks: people stay with family, relocate, or take a whole break.
// Day plans still cover the first five days; a Grok-written edition plans
// week by week for the whole stay.
const MAX_TRIP_DAYS = 35;
const MAX_LEAD_DAYS = 365;
const mapsSearch = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function torontoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}
function monthBounds(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ymd.slice(0, 7)}-01`, end: `${ymd.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

// ---------- the order ----------

function findPlace(city) {
  const s = String(city || '').trim().toLowerCase();
  if (!s) return null;
  return ONTARIO_PLACES.find(p => p.name.toLowerCase() === s) || null;
}

/**
 * Validate what the order page sends. → { ok: true, order } | { ok: false, error, message }
 * Ontario places only (the list the "Where?" picker already uses), trips of
 * 1 to 14 days, starting today or within the next 12 months.
 */
function validateOrder(body, today = torontoToday()) {
  const b = body || {};
  const place = findPlace(b.city);
  if (!place) return { ok: false, error: 'UNKNOWN_PLACE', message: 'Pick an Ontario city or town from the list.' };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const start = String(b.start || '');
  const end = String(b.end || b.start || '');
  if (!dateRe.test(start) || !dateRe.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return { ok: false, error: 'BAD_DATES', message: 'Choose the dates of your trip.' };
  }
  if (start < today) return { ok: false, error: 'PAST_DATES', message: 'Your trip has to start today or later.' };
  if (daysBetween(today, start) > MAX_LEAD_DAYS) return { ok: false, error: 'TOO_FAR', message: 'Trips can start up to 12 months from today.' };
  if (end < start) return { ok: false, error: 'BAD_DATES', message: 'The last day comes after the first.' };
  if (daysBetween(start, end) + 1 > MAX_TRIP_DAYS) return { ok: false, error: 'TOO_LONG', message: `Trips can be up to ${MAX_TRIP_DAYS} days.` };
  const name = String(b.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  // "Tell us about your crew": who is coming and what they love, in their
  // own words. Stripe metadata values cap at 500 characters, so 400 here.
  const notes = String(b.notes || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  return { ok: true, order: { city: place.name, region: place.region, start, end, name: name || null, notes: notes || null } };
}

// ---------- sorting the feed into chapters ----------

const RE = {
  nature: /\b(park|trail|hik(e|ing)|conservation|lookout|viewpoint|escarpment|bluffs|gorge|ravine|falls|waterfall|boardwalk|forest|arboretum|botanical|garden|nature|beach|lake|marsh|island|wildlife)\b/i,
  food: /\b(restaurant|caf[eé]|coffee|bakery|brunch|bistro|eatery|diner|pub|brewery|winery|patio|dessert|ice cream|market|food)\b/i,
  culture: /\b(museum|gallery|historic|heritage|fort|theatre|theater|church|cathedral|library|art|cultural|architecture|tour)\b/i,
  family: /\b(kid|children|family|playground|zoo|farm|aquarium|science|splash|petting)\b/i,
  active: /\b(climb|zipline|kayak|canoe|paddle|ski|skat|bike|cycling|go-?kart|axe|escape room|trampoline|golf|rafting|tubing|snowshoe)\b/i
};

function textOf(c) {
  return `${c.title || ''} ${c.description || ''} ${c.category || ''} ${(c.tags || []).join(' ')} ${(c.types || []).join(' ')}`;
}

function chapterOf(c) {
  if (c.date) return 'event';
  const t = textOf(c);
  if (c.source === 'osm_nature' || c.category === 'nature') return 'nature';
  if (c.category === 'food' || c.category === 'patios' || RE.food.test(t)) return 'food';
  if (c.category === 'kids' || RE.family.test(t)) return 'family';
  if (c.category === 'culture' || RE.culture.test(t)) return 'culture';
  if (c.category === 'adventures' || RE.active.test(t)) return 'active';
  if (RE.nature.test(t)) return 'nature';
  return 'more';
}

// One feed candidate → one guide entry. Only fields the PDF prints, so the
// stored record stays small and carries no third-party image URLs.
// Event sources send UTC instants ("2026-11-07T00:05:00Z" is a 7:05 pm
// puck drop in Kingston); print the local clock time the buyer will see.
function localTime(datetime) {
  if (!datetime) return null;
  const s = String(datetime);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return /T(\d\d:\d\d)/.test(s) ? s.match(/T(\d\d:\d\d)/)[1] : null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(t)).replace(/\s?a\.m\./i, ' am').replace(/\s?p\.m\./i, ' pm');
}

function entryOf(c, city) {
  const where = c.venue && !/OpenStreetMap/.test(c.venue) ? c.venue : (c.address || null);
  return {
    title: String(c.title || '').slice(0, 120),
    what: String(c.description || '').replace(/\s+/g, ' ').slice(0, 260),
    where: where ? String(where).slice(0, 140) : null,
    date: c.date || null,
    end: c.end_date || c.date_end || null,
    time: localTime(c.datetime),
    place_id: c.place_id || null,
    km: c.distance_km != null ? Math.round(c.distance_km * 10) / 10 : null,
    rating: c.rating != null ? Number(c.rating) : null,
    reviews: c.rating_count || null,
    cost: c.cost_tier || null,
    url: c.booking_url || c.url || c.website || null,
    maps: c.maps_url || mapsSearch(`${c.title}, ${where || city}, Ontario`),
    source: c.source || null,
    lat: c.lat != null ? c.lat : null,
    lng: c.lng != null ? c.lng : null
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(c => {
    // "Rock Dunder Nature Reserve - Rideau Waterway Land Trust" and "Rock Dunder
    // Nature Reserve" are one place listed twice: compare the name before a dash.
    const base = String(c.title || '').split(/\s[-–—|]\s/)[0];
    const k = `${base.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${c.date || ''}`;
    if (!k.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- the catalog: must-sees, drives, day trips ----------

function haversineKm(a, b) {
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function catalogNear(center, month, catalog = curatedCatalog, coords = catalogCoords) {
  return catalog
    .filter(e => isCatalogSeasonEligible(e.seasonal, month))
    .map(e => {
      const c = e.lat != null ? e : coords[e.id];
      if (!c || c.lat == null) return null;
      return { e, km: Math.round(haversineKm(center, c) * 10) / 10, lat: c.lat, lng: c.lng };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
}

function catalogEntry({ e, km, lat, lng }) {
  return {
    title: e.title, what: e.description, where: `${e.venue}, ${e.location}`,
    km, cost: e.cost_tier, ages: e.good_for_ages,
    url: e.booking_url || null, maps: e.maps_url, source: 'dayhop_catalog', lat, lng
  };
}

// ---------- day plans ----------
// Greedy and honest: each day takes one outdoor stop, one culture or family
// stop, a place to eat, and the evening's event when there is one on that
// date, nearest to the day's first stop. A suggestion, not a schedule.
const DAY_PLAN_KM = 35;

function planDays(order, chapters) {
  const n = Math.min(daysBetween(order.start, order.end) + 1, 5);
  const used = new Set();
  const take = (list, near) => {
    // A day plan is a day in town: nothing more than DAY_PLAN_KM out (an
    // early build sent dinner to a farm 118 km from Kingston).
    const pool = (list || []).filter(x => !used.has(x.title) && (x.km == null || x.km <= DAY_PLAN_KM));
    if (!pool.length) return null;
    const pick = near && near.lat != null
      ? pool.slice().sort((a, b) => (a.lat == null ? 1e9 : haversineKm(near, a)) - (b.lat == null ? 1e9 : haversineKm(near, b)))[0]
      : pool[0];
    used.add(pick.title);
    return pick;
  };
  const days = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(order.start, i);
    const morning = take(chapters.nature) || take(chapters.mustSee);
    const midday = take(chapters.culture, morning) || take(chapters.family, morning) || take(chapters.mustSee, morning);
    const meal = take(chapters.food, midday || morning);
    const evening = (chapters.eventsTrip || []).find(e => !used.has(e.title) && e.date <= date && (e.end || e.date) >= date) || null;
    if (evening) used.add(evening.title);
    const stops = [
      morning && { when: 'Morning', ...morning },
      midday && { when: 'Midday', ...midday },
      meal && { when: 'Eat', ...meal },
      evening && { when: 'Evening', ...evening }
    ].filter(Boolean);
    if (stops.length) days.push({ date, stops });
  }
  return days;
}

// ---------- assembly ----------

const defaultDeps = () => ({
  geocode: q => require('./googleMaps').geocode(q),
  gather: (...args) => require('./candidates').gatherCandidates(...args),
  events: opts => require('./ticketmaster').searchEvents(opts),
  nature: opts => require('./osmNature').getNatureSpots(opts),
  travel: opts => require('./osmTravel').getTravelSpots(opts),
  history: city => require('./wikiHistory').getCityHistory(city),
  details: placeId => require('./googleMaps').getPlaceDetails(placeId),
  today: torontoToday
});

// osmNature answers from cache and refreshes in the background; a guide is
// built once, so it waits (bounded) for the refresh to land.
async function natureSpots(nature, center) {
  for (let i = 0; i < 8; i++) {
    const spots = await nature({ lat: center.lat, lng: center.lng, limit: 30 }).catch(() => []);
    if (spots.length) return spots;
    await new Promise(r => setTimeout(r, 5000));
  }
  return [];
}

async function buildGuideData(order, deps = {}) {
  const d = Object.assign(defaultDeps(), deps);
  const where = `${order.city}, Ontario`;
  const geo = await d.geocode(where);
  const center = { lat: geo.lat, lng: geo.lng };
  const trip = { start: order.start, end: order.end };
  const month = monthBounds(order.start);
  const monthEnd = monthBounds(order.end).end;
  const settle = p => p.then(v => v, err => { console.warn('[personal-guide] source failed:', err.message); return null; });

  const [rr, adv, dining, monthPool, tm, natureRaw, travel, history] = await Promise.all([
    settle(d.gather(seasonalPrompt('rr', order.start) || MODE_PROMPTS.rr, where, null, null, center, 'rr', trip)),
    settle(d.gather(seasonalPrompt('adventure', order.start) || MODE_PROMPTS.adventure, where, null, null, center, 'adventure', trip)),
    settle(d.gather(DINING_QUERY, where, null, null, center, 'rr', trip)),
    settle(d.gather(MODE_PROMPTS.rr, where, null, null, center, 'rr', { start: month.start, end: monthEnd })),
    settle(d.events({ lat: center.lat, lng: center.lng, radiusKm: 50, limit: 60, daysAhead: Math.max(1, daysBetween(d.today(), monthEnd) + 1) })),
    settle(natureSpots(d.nature, center)),
    settle(d.travel(center)),
    settle(d.history(order.city))
  ]);

  const pool = dedupe([
    ...((rr && rr.candidates) || []),
    ...((adv && adv.candidates) || []),
    ...((dining && dining.candidates) || []),
    ...((monthPool && monthPool.candidates) || []),
    ...(tm || []),
    ...(natureRaw || [])
  ]).filter(c => c.business_status !== 'CLOSED_PERMANENTLY');

  const chapters = { nature: [], food: [], culture: [], family: [], active: [], more: [], eventsTrip: [], eventsMonth: [] };
  for (const c of pool) {
    const e = entryOf(c, order.city);
    if (!e.title) continue;
    const ch = chapterOf(c);
    if (ch === 'event') {
      const last = e.end || e.date;
      if (e.date <= order.end && last >= order.start) chapters.eventsTrip.push(e);
      else if (e.date >= month.start && e.date <= monthEnd) chapters.eventsMonth.push(e);
      continue;
    }
    chapters[ch].push(e);
  }
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '');
  const byQuality = (a, b) => ((b.rating || 0) * Math.log10((b.reviews || 0) + 10)) - ((a.rating || 0) * Math.log10((a.reviews || 0) + 10));
  chapters.eventsTrip.sort(byDate);
  chapters.eventsMonth.sort(byDate);
  for (const k of ['food', 'culture', 'family', 'active', 'more']) chapters[k].sort(byQuality);
  // Day trips from the feed itself, before the chapters trim to town: the
  // curated catalog is GTA-heavy, so from Kingston or Sudbury it has little
  // to offer, while the feed already holds well-loved places an hour or two
  // out. Kept for "By car, together" below.
  const farLoved = ['nature', 'culture', 'family', 'active', 'more']
    .flatMap(k => chapters[k])
    .filter(e => e.km != null && e.km > 35 && e.km <= 150 && (e.rating || 0) >= 4.4 && (e.reviews || 0) >= 50);
  // A longer stay needs more to choose from, or a month-long plan can only
  // repeat the same dozen places.
  const span = daysBetween(order.start, order.end) + 1;
  const grow = n => Math.round(n * (span > 10 ? 1.6 : 1));
  const CAP = { nature: grow(18), food: grow(12), culture: grow(12), family: grow(10), active: grow(10), more: grow(8), eventsTrip: 30, eventsMonth: 30 };
  // Chapters describe the place, not the province: parks reach a little
  // further than restaurants, and events keep whatever the sources sent.
  const REACH_KM = { nature: 60, food: 40, culture: 50, family: 50, active: 50, more: 50 };
  for (const k of Object.keys(CAP)) {
    const reach = REACH_KM[k];
    chapters[k] = chapters[k].filter(e => reach == null || e.km == null || e.km <= reach).slice(0, CAP[k]);
  }

  // Must-sees: the catalog's own picks within an hour, then the best-loved
  // places Google knows here, whether or not the buyer would have asked.
  const tripMonth = Number(order.start.slice(5, 7));
  const near = catalogNear(center, tripMonth);
  const catalogPicks = near.filter(x => x.km <= 60).sort((a, b) => (b.e.wow - a.e.wow) || (a.km - b.km)).slice(0, 8).map(catalogEntry);
  const loved = pool
    .filter(c => !c.date && c.rating >= 4.6 && (c.rating_count || 0) >= 300 && (c.distance_km == null || c.distance_km <= 40))
    .sort((a, b) => (b.rating_count || 0) - (a.rating_count || 0))
    .slice(0, 6)
    .map(c => entryOf(c, order.city));
  const mustSee = dedupe([...catalogPicks, ...loved]).slice(0, 12);
  // A Google listing's own text is just its types ("museum · historical
  // landmark"). For the must-sees, the page a buyer reads most, swap in
  // Google's one-line editorial summary where one exists: about 6 Place
  // Details lookups per guide (~$0.15), cached a day across all buyers.
  await Promise.all(mustSee.filter(e => e.place_id).slice(0, 8).map(async e => {
    const det = await d.details(e.place_id).catch(() => null);
    if (det && det.editorial_summary) e.what = det.editorial_summary;
  }));
  const drives = near.filter(x => x.km <= 150 && x.e.tags.some(t => /scenic drive|scenic/.test(t))).slice(0, 6).map(catalogEntry);
  const dayTrips = dedupe([
    ...near.filter(x => x.km > 30 && x.km <= 150 && (x.e.worth_trip || x.e.wow))
      .filter(x => !catalogPicks.some(p => p.title === x.e.title)).map(catalogEntry),
    ...farLoved.sort(byQuality)
  ]).filter(e => !mustSee.some(m => m.title === e.title)).slice(0, 8);

  const t = travel || {};
  const days = planDays(order, Object.assign({ mustSee }, chapters));

  return {
    version: 1,
    order,
    built_at: new Date().toISOString(),
    center: { lat: Math.round(center.lat * 1e4) / 1e4, lng: Math.round(center.lng * 1e4) / 1e4 },
    history: history || null,
    mustSee,
    events: { trip: chapters.eventsTrip, month: chapters.eventsMonth, monthLabel: new Date(`${month.start}T12:00:00Z`).toLocaleString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
    days,
    nature: chapters.nature,
    routes: { bike: t.bike_route || [], hike: t.hike_route || [], bikeShare: t.bike_share || [] },
    drives,
    dayTrips,
    overnight: { camping: t.camping || [], rv: t.rv || [], dump: t.dump || [], rest: t.rest || [], missing: t.missing || (travel ? [] : ['all']) },
    food: chapters.food,
    culture: chapters.culture,
    family: chapters.family,
    active: chapters.active,
    more: chapters.more,
    links: {
      ontarioParks: 'https://reservations.ontarioparks.ca/',
      overlander: `https://www.ioverlander.com/places/map?searchboxmin=${(center.lat - 0.4).toFixed(3)},${(center.lng - 0.6).toFixed(3)}&searchboxmax=${(center.lat + 0.4).toFixed(3)},${(center.lng + 0.6).toFixed(3)}`,
      ontario511: 'https://511on.ca/',
      weather: `https://weather.gc.ca/en/location/index.html?coords=${center.lat.toFixed(3)},${center.lng.toFixed(3)}`
    }
  };
}

module.exports = {
  PRICE_CENTS, MAX_TRIP_DAYS,
  validateOrder, findPlace, buildGuideData,
  chapterOf, entryOf, planDays, catalogNear, monthBounds, daysBetween, addDays
};
