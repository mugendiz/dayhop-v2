// services/talkOfTown.js — DayHop V2
// The "Talk of the town 🔥" shelf: the five outdoor happenings people are
// actually flocking to THIS WEEK around the user — the CNE, Ribfests, fall
// fairs, TIFF's street festival, night markets, Nuit Blanche… none of which
// ever reached the feed before (no partner source carries them and the
// Sunday autopilot only hunts newly-opened permanent places).
//
// How a pick earns the shelf (trust contract: verified, never assumed):
//   1. Once a week per region hub (data/tottHubs.js), Grok runs xAI's live
//      web + X search (services/grok.js callGrokSearch) for the 8 outdoor
//      happenings locals are talking about in the coming 10 days.
//   2. Every candidate is verified: Google Places (or the geocoder) must
//      place its venue; it must sit within HUB_REACH_KM (~2 h) of the hub;
//      dates must overlap the window; it must involve the outdoors; and the
//      venue gates apply — no restaurant without a patio, nothing that is
//      for drinking only (services/venueGates.js, founder rule 2026-09-07).
//   3. The first 5 that pass, in Grok's rank order, with at most 2 beyond
//      FAR_KM from the hub, publish. Pinned picks from the previous week that
//      are still date-valid stay in front. Fewer than 5 verified means a
//      shorter shelf — never filler.
//
// The request path never calls Grok or Google: active() is a pure read of
// the in-memory store (hydrated from public.talk_of_town). Toronto refreshes
// every Sunday; any other hub refreshes the first time someone browses from
// it (noteBrowse → one background refresh, debounced), then weekly while it
// keeps seeing traffic. Persistence mirrors services/autoCatalog.js: Supabase
// via the service key, memory-only (lost on restart) without one.

const maps = require('./googleMaps');
const { callGrokSearch } = require('./grok');
const dbClient = require('./db/client');
const { venueGateVerdict, looksLikeBarOrRestaurant, isHalloweenThemed } = require('./venueGates');
const { HUBS, HUB_REACH_KM, FAR_KM, hubFor, hubById, haversineKm } = require('../data/tottHubs');
const { torontoToday } = require('./spotlight');

const TABLE = 'talk_of_town';
const SHELF_SIZE = 5;
const ASK_FOR = 8;             // candidates requested per hub; verification thins them
const PUBLISH_SIZE = SHELF_SIZE + 1; // one spare: the Top-5 layout lifts rank 1 into its slot 6
const MAX_FAR = 2;             // of SHELF_SIZE, beyond FAR_KM
// The live feeds promise a day out, not a road trip, and cap what they serve
// at 80 km from the user (routes/surprise.js's DRIVE_MAX_KM says the same).
// The weekly store itself reaches HUB_REACH_KM (180) on purpose: the Monday
// newsletter is read at the kitchen table on a week's notice, where "worth
// the drive to Prince Edward County" is the whole point. So the ceiling is
// per-caller, not baked into the store — active() takes maxKm, the feeds
// pass FEED_MAX_KM, and services/tottDigest.js deliberately passes nothing.
const FEED_MAX_KM = 80;
// How far ahead the weekly search looks. This is the number that decides
// whether a festival is ever FOUND: pickerPrompt() asks Grok for happenings
// "between ${today} and ${end}", and end is today + WINDOW_DAYS, so nothing
// past this horizon is ever requested, however permissive the gates below
// are. At 10 days the shelf could only ever report what was already upon us,
// which is why a season of festivals went by without one appearing: a fair
// announced three weeks out was invisible until the week it ran, by which
// point a family had already made other plans.
//
// 21 days covers the next three weekends, which is the horizon a family
// actually plans a day out on, without turning a "talk of the town" shelf
// into a listings page.
const WINDOW_DAYS = 21;
// Derived, never a loose literal. This gate rejects a pick whose start is
// further out than the search asked for, so if it is ever SMALLER than
// WINDOW_DAYS the system quietly throws away the far edge of its own search
// results: Grok is asked for 21 days, finds a fair on day 18, and shapePick
// drops it as too_far_ahead. That is invisible from the outside and the two
// numbers were already drifting (10 vs 14). Tying them together means the
// window can be retuned in one place without opening that trap.
const MAX_START_AHEAD_DAYS = WINDOW_DAYS + 3;
const MAX_RUN_DAYS = 75;       // long-running installations are fine; year-round attractions are not "happening"
const DEMAND_WINDOW_DAYS = 14; // a hub stays on the weekly schedule while it has rows this recent

// Outdoor evidence for the "must involve the outdoors" rule when Grok's flag
// is missing. Deliberately broad — the venue gates handle bars/restaurants.
const OUTDOOR_TEXT_RE = /\b(outdoors?|open[- ]air|park|street|streets|market|fair|festival|midway|parade|fireworks|trail|beach|waterfront|harbour|harbor|lake|island|garden|patio|plaza|square|grounds|farm|orchard|pumpkin|corn maze|ribfest|race|run|marathon|walk|ride|paddle|regatta|air show|drive-in|screening under|amphitheatre|amphitheater|bandshell|stadium|field)\b/i;

// ---------- store ----------
const rows = new Map();  // id -> { id, hub, entry, week_start, status, pinned, created_at }
const lastRun = new Map(); // hub -> { at, reason, asked, verified, published, dropped: [{title, reason}], error? }
const refreshing = new Map(); // hub -> Promise (in-flight guard)
const demandNoted = new Map(); // hub -> ms of last on-demand trigger

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

let loadPromise = null;
let persistenceDown = false; // table missing / DB unreachable: automatic runs pause
function loadFromDb() {
  if (loadPromise) return loadPromise;
  if (!hasServiceKey()) { loadPromise = Promise.resolve(); return loadPromise; }
  loadPromise = dbClient.getClient().from(TABLE).select('*')
    .gte('created_at', new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString())
    .limit(2000)
    .then(({ data, error }) => {
      if (error) throw error;
      for (const r of data || []) if (r && r.id && r.entry) rows.set(r.id, r);
      if (data && data.length) console.log(`[talk-of-town] loaded ${data.length} row${data.length === 1 ? '' : 's'}`);
    })
    .catch(err => {
      persistenceDown = true;
      console.warn('[talk-of-town] load failed (memory-only until restart; automatic refreshes paused — run db/migrations/2026-09-07-talk-of-town.sql):', err.message);
    });
  return loadPromise;
}

async function persistRows(list) {
  for (const r of list) rows.set(r.id, r);
  if (!hasServiceKey() || !list.length) return;
  try {
    const { error } = await dbClient.getClient().from(TABLE)
      .upsert(list.map(r => ({ id: r.id, hub: r.hub, entry: r.entry, week_start: r.week_start, status: r.status, pinned: r.pinned })), { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.warn('[talk-of-town] persist failed (kept in memory):', err.message);
  }
}

// ---------- dates ----------
const DAY_MS = 24 * 3600 * 1000;
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY_MS);
}
/** Monday of the Toronto week containing `today` — the refresh's week key. */
function weekStart(today = torontoToday()) {
  const d = new Date(today + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(today, -dow);
}

// ---------- shaping ----------
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Validate one Grok candidate against the rules that need no network.
 * Returns { ok: true, pick } or { ok: false, reason }.
 */
function shapePick(raw, { hub, today }) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'malformed' };
  const title = String(raw.title || '').trim().slice(0, 120);
  if (!title) return { ok: false, reason: 'no_title' };
  const start = isYmd(raw.start_date) ? raw.start_date : null;
  const end = isYmd(raw.end_date) ? raw.end_date : start;
  if (!start) return { ok: false, reason: 'no_date' };
  if (end < today) return { ok: false, reason: 'already_over' };
  if (daysBetween(today, start) > MAX_START_AHEAD_DAYS) return { ok: false, reason: 'too_far_ahead' };
  if (daysBetween(start, end) > MAX_RUN_DAYS) return { ok: false, reason: 'not_an_event' };
  const why = String(raw.why || '').trim().slice(0, 200);
  const venue = String(raw.venue || '').trim().slice(0, 120);
  const city = String(raw.city || '').trim().slice(0, 80);
  if (!venue && !city) return { ok: false, reason: 'no_venue' };
  const text = `${title} ${venue} ${why}`;
  const outdoor = raw.outdoor === true || OUTDOOR_TEXT_RE.test(text);
  if (!outdoor) return { ok: false, reason: 'indoor_only' };
  const gate = venueGateVerdict({ title, description: why, date: start, types: [] });
  if (!gate.pass) return { ok: false, reason: gate.reason };
  if (isHalloweenThemed({ title, description: why, venue })) return { ok: false, reason: 'halloween' };
  const url = /^https?:\/\//i.test(String(raw.official_url || '')) ? String(raw.official_url).slice(0, 300) : null;
  const price = String(raw.price || raw.free_or_price || '').toLowerCase();
  const cost_tier = /free|no charge|\$0\b/.test(price) ? 'free' : /\$\$|premium|\b(4|5|6|7|8|9)\d\b/.test(price) ? '$$' : price ? '$' : null;
  return {
    ok: true,
    pick: {
      id: `tott-${hub.id}-${slug(title)}-${weekStart(today)}`,
      title, why, venue, city, date: start, date_end: end, official_url: url, cost_tier,
      family_ok: raw.family_ok !== false, outdoor: true,
      rank: Number.isFinite(Number(raw.rank)) ? Number(raw.rank) : 99,
      area: city || hub.name
    }
  };
}

// ---------- verification (network) ----------
/**
 * Place the pick on the map and apply the venue gates with Google's truth.
 * Places text search first (gives lat/lng, photo, types, patio flag); the
 * geocoder as a fallback for venues Google doesn't list as a place (a
 * street, a park corner). Unplaceable → rejected.
 */
const isBudgetError = err => /budget/i.test(String((err && err.message) || ''));

async function verifyPick(pick, hub) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { pass: false, reason: 'maps_not_configured' };
  // Identity-only Places search (Pro SKU, 5k free/month): place, coords,
  // photo. The daily Maps budget (services/apiCache.js) guards it like every
  // metered call — when the budget is spent the pick is not dropped but
  // deferred (retry: true), so a run late in the day never publishes a
  // half-verified week.
  let place = null;
  let budgetHit = false;
  const q = `${pick.venue || pick.title}, ${pick.city || hub.name}`;
  try {
    const found = await maps.searchPlacesLite({ query: q, lat: hub.lat, lng: hub.lng, radiusMeters: HUB_REACH_KM * 1000, maxResults: 3 });
    place = (found || []).find(p => p.lat != null && p.lng != null) || null;
  } catch (err) { if (isBudgetError(err)) budgetHit = true; }
  let lat = place ? place.lat : null;
  let lng = place ? place.lng : null;
  let address = place ? place.address : null;
  if (lat == null && !budgetHit) {
    try {
      const g = await maps.geocode(`${pick.venue || pick.title}, ${pick.city || hub.name}, Ontario`);
      if (g && g.lat != null) { lat = g.lat; lng = g.lng; address = g.formatted_address || null; }
    } catch (err) { if (isBudgetError(err)) budgetHit = true; }
  }
  if (budgetHit && lat == null) return { pass: false, reason: 'maps_budget', retry: true };
  if (lat == null || lng == null) return { pass: false, reason: 'unplaceable' };
  // The lite record carries no types/patio flag; a pick that reads like a
  // bar or restaurant buys ONE full record so the venue gates see Google's
  // truth (same rule as the autopilot). Everything else skips the call.
  if (place && looksLikeBarOrRestaurant({ title: pick.title, description: pick.why, types: [] })) {
    try {
      const full = await maps.searchPlaces({ query: q, lat, lng, radiusMeters: 5000, maxResults: 1 });
      if (full && full[0]) { place.types = full[0].types || []; place.outdoor_seating = full[0].outdoor_seating; }
    } catch (err) { if (isBudgetError(err)) return { pass: false, reason: 'maps_budget', retry: true }; }
  }
  const km = Math.round(haversineKm(hub, { lat, lng }));
  if (km > HUB_REACH_KM) return { pass: false, reason: `too_far (${km} km)` };
  // Venue gates with Google's types/patio flag: a "festival" that resolves
  // to a bar with no patio or a taproom is out.
  const gate = venueGateVerdict({
    title: pick.title, description: pick.why, date: pick.date,
    types: place ? place.types : [], outdoor_seating: place ? place.outdoor_seating : null
  });
  if (!gate.pass) return { pass: false, reason: gate.reason };
  return {
    pass: true,
    verification: {
      places_id: place ? place.place_id : null,
      places_name: place ? place.title : null,
      geocoded: !place,
      km_from_hub: km,
      checked_at: new Date().toISOString()
    },
    enrich: {
      lat, lng, address,
      image_url: place && place.image_url ? place.image_url : null,
      maps_url: place && place.maps_url ? place.maps_url : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick.venue || pick.title} ${pick.city || ''}`)}`,
      website: (place && place.website) || null,
      km_from_hub: km
    }
  };
}

// ---------- the picker ----------
function pickerPrompt(hub, today) {
  const end = addDays(today, WINDOW_DAYS);
  return `Today is ${today}. You are the local events editor for ${hub.name}, Ontario, Canada.

Find the ${ASK_FOR} outdoor happenings between ${today} and ${end} that people around ${hub.name} are most talking about and actually going to right now. Search the live web and X for what is buzzing this week — festivals, fairs, street festivals, markets and night markets, Ribfests, outdoor concerts and screenings, fireworks, parades, races and runs, farm and orchard events, park programming, waterfront and beach events.

Rules:
- Every pick must INVOLVE THE OUTDOORS. No indoor-only events, no restaurants or cafés as such, nothing that is mainly about drinking (bars, pub crawls, taprooms, beer-only halls).
- Nothing Halloween themed: no haunted attractions, trick or treating, costume events, ghost walks or jack-o'-lantern displays. In the fall, pick harvest festivals, farm days, fall colour walks, markets, races and parades instead.
- Mostly local: ${hub.local}. At most 2 of the ${ASK_FOR} may be standouts further out (up to about 2 hours' drive: ${hub.far}), and only if genuinely worth the trip.
- Real, scheduled, and happening in this window. Skip anything that ended before ${today} and anything year-round.
- Weight the near days heavily. Most picks should be on in the next few days, because that is what someone deciding tonight can act on. Include something further out only when it is genuinely worth planning for, like a named festival or fair, and never more than 3 of the ${ASK_FOR}.
- Rank 1 = the single most talked-about pick happening right now, not the biggest event in the window.

Return ONLY this JSON, no commentary:
{"picks":[{"rank":1,"title":"","venue":"venue or street, as specific as possible","city":"","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","official_url":"https://...","why":"one sentence, max 160 chars, why locals are going","price":"free | $ | $$","family_ok":true,"outdoor":true}]}`;
}

async function askGrok(hub, today) {
  const { data, citations, usage } = await callGrokSearch(pickerPrompt(hub, today), {
    instructions: 'You are a meticulous local events editor. Only report events you can confirm from current sources. Respond with JSON only.',
    temperature: 0.2
  });
  const picks = data && Array.isArray(data.picks) ? data.picks : [];
  return { picks, citations, usage };
}

/**
 * Refresh one hub: ask, verify, compose, persist. Never throws; the result
 * is recorded for the admin panel and returned.
 */
async function refresh({ hubId = 'toronto', reason = 'manual', today = torontoToday() } = {}) {
  const hub = hubById(hubId);
  if (!hub) return { ok: false, error: `unknown hub ${hubId}` };
  if (refreshing.has(hub.id)) return refreshing.get(hub.id);
  const job = (async () => {
    const run = { at: new Date().toISOString(), reason, hub: hub.id, asked: 0, verified: 0, published: 0, dropped: [] };
    try {
      await loadFromDb();
      const wk = weekStart(today);
      const { picks, citations, usage } = await askGrok(hub, today);
      run.asked = picks.length;
      run.usage = usage;
      const shaped = [];
      for (const raw of picks) {
        const s = shapePick(raw, { hub, today });
        if (s.ok) shaped.push(s.pick);
        else run.dropped.push({ title: String((raw && raw.title) || '?').slice(0, 80), reason: s.reason });
      }
      shaped.sort((a, b) => a.rank - b.rank);
      // Verify in rank order until the shelf is full (plus a spare for the
      // far cap); every verification is one or two metered Maps calls.
      const verified = [];
      let deferred = 0;
      for (const pick of shaped) {
        if (verified.length >= PUBLISH_SIZE + 2) break;
        const v = await verifyPick(pick, hub);
        if (!v.pass) {
          run.dropped.push({ title: pick.title, reason: v.reason });
          if (v.retry) deferred++;
          continue;
        }
        verified.push(Object.assign(pick, v.enrich, { verification: v.verification, sources: citations.slice(0, 6) }));
      }
      run.verified = verified.length;
      // Maps budget spent mid-run: publish nothing new, keep last week's shelf
      // serving, and flag the run so needsRefresh() retries after midnight.
      if (deferred && verified.length < SHELF_SIZE) {
        run.retry = true;
        run.deferred = deferred;
        console.warn(`[talk-of-town] ${hub.id}: Maps budget spent — ${deferred} pick(s) deferred, retrying later (${reason})`);
        return run;
      }
      // Compose: last week's pins that are still valid lead; then rank order
      // with the far cap.
      const previous = [...rows.values()].filter(r => r.hub === hub.id && r.status === 'active');
      const keepPinned = previous.filter(r => r.pinned && r.entry.date_end >= today);
      const chosen = [];
      let far = keepPinned.filter(r => (r.entry.km_from_hub || 0) > FAR_KM).length;
      const seenTitles = new Set(keepPinned.map(r => normTitle(r.entry.title)));
      for (const p of verified) {
        if (chosen.length + keepPinned.length >= PUBLISH_SIZE) break;
        if (seenTitles.has(normTitle(p.title))) continue;
        const isFar = (p.km_from_hub || 0) > FAR_KM;
        if (isFar && far >= MAX_FAR) { run.dropped.push({ title: p.title, reason: 'far_cap' }); continue; }
        if (isFar) far++;
        seenTitles.add(normTitle(p.title));
        chosen.push(p);
      }
      const newRows = chosen.map(p => ({
        id: p.id, hub: hub.id, entry: p, week_start: wk, status: 'active', pinned: false,
        created_at: new Date().toISOString()
      }));
      // Retire last week's un-pinned rows for this hub, keep the pins. A run
      // that verified nothing retires nothing: emptying the shelf because a
      // mid-week search came back thin would turn a short shelf into none.
      const retire = !newRows.length ? [] : previous.filter(r => !r.pinned && !newRows.some(n => n.id === r.id))
        .map(r => Object.assign({}, r, { status: 'retired' }));
      await persistRows([...newRows, ...retire]);
      run.published = newRows.length;
      run.kept_pinned = keepPinned.length;
      console.log(`[talk-of-town] ${hub.id}: ${run.published} published, ${run.kept_pinned || 0} pinned kept, ${run.dropped.length} dropped (${reason})`);
      reportRun(hub, run, newRows);
    } catch (err) {
      run.error = err.message;
      console.warn(`[talk-of-town] ${hub.id} refresh failed (${reason}):`, err.message);
    } finally {
      lastRun.set(hub.id, run);
      refreshing.delete(hub.id);
    }
    return run;
  })();
  refreshing.set(hub.id, job);
  return job;
}

function reportRun(hub, run, newRows) {
  if (!newRows.length && !run.dropped.length) return;
  const lines = [`Talk of the town — ${hub.name} (${run.reason})`, ''];
  if (newRows.length) {
    lines.push('Live on the shelf this week:');
    for (const r of newRows) lines.push(`  - ${r.entry.title} · ${r.entry.venue || r.entry.city} · ${r.entry.date}${r.entry.date_end !== r.entry.date ? ' → ' + r.entry.date_end : ''}`);
  }
  if (run.dropped.length) {
    lines.push('', 'Dropped by verification:');
    for (const d of run.dropped) lines.push(`  - ${d.title}: ${d.reason}`);
  }
  lines.push('', 'Pin, retire or add picks from the admin panel → Talk of the town.');
  require('./email').sendEmail({
    to: process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com',
    subject: `DayHop talk of the town (${hub.name}): ${newRows.length} live`,
    text: lines.join('\n')
  }).catch(() => {});
}

/** Hubs the weekly job should refresh: Toronto always, plus any hub with recent rows. */
function hubsDue(today = torontoToday()) {
  loadFromDb();
  const since = Date.now() - DEMAND_WINDOW_DAYS * DAY_MS;
  const ids = new Set(['toronto']);
  for (const r of rows.values()) {
    if (Date.parse(r.created_at || 0) >= since) ids.add(r.hub);
  }
  return [...ids].filter(id => hubById(id));
}

async function refreshDue({ reason = 'weekly', today = torontoToday() } = {}) {
  const out = [];
  for (const id of hubsDue(today)) out.push(await refresh({ hubId: id, reason, today }));
  return out;
}

/**
 * Does a hub need a refresh right now? No rows for this week (a deploy on
 * the wrong side of Sunday, a failed run), the shelf has run dry mid-week,
 * or the last run was cut short by the Maps budget and midnight has passed
 * since. Reads the DB first so a redeploy mid-week never re-buys a run that
 * already happened.
 *
 * The run-dry rule is the one that was missing. This used to count rows by
 * WEEK only, while active() serves them by DATE, so the two disagreed from
 * the middle of the week on: Sunday's pass files its rows under the week
 * that is ending, the hourly check re-runs on Monday under the new week,
 * and from then until the next Sunday the hub "has rows this week" even
 * after every one of them has ended. The prompt weights the near days, so
 * Monday's picks are mostly over by Thursday, and the shelf sat empty
 * through the run-up to every weekend: Oct 1, and again Oct 8, the eve of
 * Thanksgiving. Fewer than MIN_LIVE picks still running now buys one fresh
 * search, at most once per Toronto day, so a quiet week costs one ~US$0.12
 * run a day at worst and a busy one costs nothing extra.
 *
 * opts.source and opts.last are for tests; the server passes neither.
 */
const MIN_LIVE = 3; // same floor routes/browse.js tottFallback() needs to show a shelf at all
function needsRefresh(hubId, today = torontoToday(), opts = {}) {
  const wk = weekStart(today);
  const mine = [...(opts.source || rows.values())].filter(r => r.hub === hubId && r.status === 'active');
  const thisWeek = mine.filter(r => r.week_start >= wk);
  if (!thisWeek.length) return true;
  const last = 'last' in opts ? opts.last : lastRun.get(hubId);
  const dayOf = at => (at ? torontoToday(new Date(at)) : '');
  // A run today, remembered in memory or proven by a row it wrote. The row
  // check is what stops a redeploy (which empties lastRun) from re-buying.
  const ranToday = dayOf(last && last.at) === today || mine.some(r => dayOf(r.created_at) === today);
  const live = mine.filter(r => r.entry && r.entry.date_end >= today);
  if (live.length < MIN_LIVE && !ranToday) return true;
  if (last && last.retry && thisWeek.length < SHELF_SIZE && dayOf(last.at) < today) return true;
  return false;
}

/** Hourly from server.js: Toronto refreshes when needsRefresh says so (at most once per 3 h). */
let lastStaleCheckRun = 0;
async function checkStale({ reason = 'stale' } = {}) {
  await loadFromDb();
  // Without persistence every cold start would re-buy a run (free-tier
  // Render wakes several times a day). Manual + weekly runs still work.
  if (persistenceDown) return null;
  if (!needsRefresh('toronto')) return null;
  if (Date.now() - lastStaleCheckRun < 3 * 3600 * 1000) return null;
  lastStaleCheckRun = Date.now();
  return refresh({ hubId: 'toronto', reason });
}
const checkStaleOnBoot = () => checkStale({ reason: 'stale-on-boot' });

// ---------- request path (pure reads) ----------
/**
 * The shelf for a point: active, date-valid picks of the nearest hub, pinned
 * first then rank, ≤ HUB_REACH_KM from the user, at most MAX_FAR beyond
 * FAR_KM from the user. Candidate-shaped for routes/browse.js.
 */
function active({ point, today = torontoToday(), limit = SHELF_SIZE, source, maxKm = HUB_REACH_KM } = {}) {
  // > 0, not just finite: Number(null) is 0, so a null ceiling would pass an
  // isFinite check and silently empty the shelf. Same guard regionGate.js uses.
  const reachN = Number(maxKm);
  const reach = Number.isFinite(reachN) && reachN > 0 ? reachN : HUB_REACH_KM;
  if (!source) loadFromDb();
  const hub = hubFor(point);
  if (!hub) return [];
  const list = [...(source || rows.values())]
    .filter(r => r.hub === hub.id && r.status === 'active' && r.entry && r.entry.date_end >= today)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.entry.rank || 99) - (b.entry.rank || 99));
  const out = [];
  let far = 0;
  for (const r of list) {
    const e = r.entry;
    const km = e.lat != null ? haversineKm(point, { lat: e.lat, lng: e.lng }) : null;
    if (km != null && km > reach) continue;
    const isFar = km != null && km > FAR_KM;
    if (isFar && far >= MAX_FAR) continue;
    if (isFar) far++;
    out.push(toCandidate(r, km));
    if (out.length >= limit) break;
  }
  return out;
}

function toCandidate(r, km) {
  const e = r.entry;
  return {
    id: r.id,
    source: 'talk_of_town',
    title: e.title,
    description: e.why || '',
    category: /market|food|taste/i.test(e.title) ? 'food' : /concert|music|film|screening|art|nuit/i.test(`${e.title} ${e.why}`) ? 'culture' : 'general',
    venue: e.venue || null,
    address: e.address || null,
    location: e.venue || e.city || e.area || '',
    lat: e.lat != null ? e.lat : null,
    lng: e.lng != null ? e.lng : null,
    date: e.date,
    date_end: e.date_end,
    image_url: e.image_url || null,
    booking_url: e.official_url || null,
    website: e.website || e.official_url || null,
    maps_url: e.maps_url || null,
    cost_tier: e.cost_tier || null,
    price_from: null,
    good_for_ages: e.family_ok ? 'all ages' : null,
    tott: true,
    pinned: r.pinned === true,
    rank: e.rank || 99,
    distance_km: km != null ? Math.round(km * 10) / 10 : undefined,
    types: []
  };
}

/**
 * Fire-and-forget: a browse from a hub with no rows this week triggers one
 * background refresh (once per hub per week per process). Never awaited.
 */
function noteBrowse(point) {
  if (!process.env.GROK_API_KEY || process.env.TOTT_AUTO === 'off') return;
  const hub = hubFor(point);
  if (!hub) return;
  if (!needsRefresh(hub.id)) return;
  const last = demandNoted.get(hub.id) || 0;
  const prior = lastRun.get(hub.id);
  // Once per hub per week, or every 3 h while a budget-blocked run waits.
  if (Date.now() - last < (prior && prior.retry ? 3 * 3600 * 1000 : 6 * DAY_MS)) return;
  demandNoted.set(hub.id, Date.now());
  loadFromDb().then(() => {
    if (persistenceDown) return;
    if (needsRefresh(hub.id)) refresh({ hubId: hub.id, reason: 'first-browse' }).catch(() => {});
  });
}

// ---------- admin ----------
async function pin(id, pinned) {
  await loadFromDb();
  const r = rows.get(id);
  if (!r) throw new Error('unknown pick');
  await persistRows([Object.assign({}, r, { pinned: pinned !== false })]);
  return rows.get(id);
}

async function retire(id) {
  await loadFromDb();
  const r = rows.get(id);
  if (!r) throw new Error('unknown pick');
  await persistRows([Object.assign({}, r, { status: 'retired', pinned: false })]);
  return rows.get(id);
}

/** Founder-added pick: same shaping + verification chain, pinned by default. */
async function addManual({ hubId = 'toronto', title, venue, city, start_date, end_date, official_url, why, price, today = torontoToday() }) {
  const hub = hubById(hubId);
  if (!hub) throw new Error(`unknown hub ${hubId}`);
  const s = shapePick({ title, venue, city, start_date, end_date, official_url, why, price, outdoor: true, rank: 0 }, { hub, today });
  if (!s.ok) throw new Error(`rejected: ${s.reason}`);
  const v = await verifyPick(s.pick, hub);
  if (!v.pass) throw new Error(`rejected: ${v.reason}`);
  const entry = Object.assign(s.pick, v.enrich, { verification: v.verification, manual: true });
  const row = { id: entry.id, hub: hub.id, entry, week_start: weekStart(today), status: 'active', pinned: true, created_at: new Date().toISOString() };
  await persistRows([row]);
  return row;
}

async function peek() {
  await loadFromDb();
  const today = torontoToday();
  const byHub = {};
  for (const r of rows.values()) {
    if (r.status !== 'active') continue;
    (byHub[r.hub] = byHub[r.hub] || []).push({
      id: r.id, title: r.entry.title, venue: r.entry.venue, city: r.entry.city,
      date: r.entry.date, date_end: r.entry.date_end, url: r.entry.official_url,
      km_from_hub: r.entry.km_from_hub, rank: r.entry.rank, pinned: r.pinned,
      live: r.entry.date_end >= today, verified: Boolean(r.entry.verification), manual: r.entry.manual === true,
      week_start: r.week_start
    });
  }
  for (const list of Object.values(byHub)) list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.rank || 99) - (b.rank || 99));
  return {
    hubs: HUBS.map(h => ({ id: h.id, name: h.name })),
    due: hubsDue(today),
    week_start: weekStart(today),
    rows: byHub,
    last_runs: Object.fromEntries(lastRun),
    refreshing: [...refreshing.keys()]
  };
}

module.exports = {
  active, noteBrowse, refresh, refreshDue, checkStale, checkStaleOnBoot, needsRefresh,
  pin, retire, addManual, peek,
  // pure helpers for tests
  shapePick, weekStart, toCandidate, SHELF_SIZE, MIN_LIVE, MAX_FAR, FAR_KM, FEED_MAX_KM,
  // Exported so test/talkOfTown.test.js can pin the invariant between them:
  // the gate must never be tighter than the window the search asks for.
  WINDOW_DAYS, MAX_START_AHEAD_DAYS
};
