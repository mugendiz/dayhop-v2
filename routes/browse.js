// routes/browse.js — DayHop V2
// POST /api/browse { city, coords? } — the instant discovery feed.
// Runs the same grounding pipeline as /api/generate but with a synthetic
// daypart-aware prompt and NO Grok call: real, bookable candidates come
// back relevance-ranked, get grouped into browse sections here, and the
// whole payload is cached — so browsing is fast, free of LLM spend, and
// safe to fire on every city pick. Does not count against daily_generates:
// discovery is top-of-funnel.

const express = require('express');
const router = express.Router();

const analytics = require('../services/analytics');
const { normalizeMode } = require('../services/grok');
const { gatherCandidates, sanitizeCoords, fallbackIdea, parseDateWindow, DEFAULT_CITY, GTA_TOWNS } = require('../services/candidates');
const { enrichIdeaImages } = require('../services/ideaPhotos');
const { isAroundSpotlight, formatRange, torontoToday, addDays } = require('../services/spotlight');
const { getSeasonContext } = require('../data/seasons');
const { haversineKm } = require('../services/relevance');
const { getSkyTonight } = require('../services/skyConditions');
const venueIndex = require('../services/venueIndex');
const { MODE_PROMPTS, CORRIDOR_QUERY } = require('../data/feedPrompts');
const sponsors = require('../services/sponsors');
const talkOfTown = require('../services/talkOfTown');

// Home-feed layout. 'top5' (TOP5_FEED=on): Top 5 picks → one sponsor /
// spotlight slot → Talk of the town, then every other shelf flagged
// fold:true for the client to hide behind "More ideas". 'full' is the
// classic shelf feed (Talk of the town still appears, third shelf down).
function feedLayout() {
  return String(process.env.TOP5_FEED || '').toLowerCase() === 'on' ? 'top5' : 'full';
}
const normTitleKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Sky checks anchor to the user's point when shared, else metro Toronto —
// close enough for a "clear tonight?" answer anywhere in the GTA.
const GTA_CENTER = { lat: 43.6532, lng: -79.3832 };

// One entry per (city|coords-grid|daypart). 30 minutes keeps partner-API
// usage flat while staying fresh enough for weather/daypart shifts.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map();

// Section size ceilings; overlaps are deduped and the pool is already
// quality-gated (candidates.js). The named sections stay tight and curated
// up top; everything else in the ranked pool pours into a catch-all
// "More to explore" shelf at the bottom, in relevance order, up to this cap.
const FEED_CAP = 40;

router.post('/', async (req, res) => {
  const city = String((req.body && req.body.city) || '').trim().slice(0, 120) || DEFAULT_CITY;
  const coords = sanitizeCoords(req.body && req.body.coords);
  const mode = normalizeMode(req.body && req.body.mode);
  const dateWindow = parseDateWindow(req.body && req.body.date, req.body && req.body.date_end);
  const part = daypart();
  const key = cacheKey(city, coords, mode, dateWindow);

  try {
    // The CANDIDATE POOL is what's cached (the expensive part: 14 sources +
    // ranking) — the feed itself is built per request, so two people at the
    // same corner no longer read a byte-identical page for 30 minutes.
    let base;
    const hit = cache.get(key);
    const baseCached = Boolean(hit && Date.now() - hit.at < CACHE_TTL_MS);
    if (baseCached) {
      base = hit.base;
    } else {
      const [gathered, sky] = await Promise.all([
        gatherCandidates(syntheticPrompt(mode), city, '', null, coords, mode, dateWindow),
        getSkyTonight(coords || GTA_CENTER)
      ]);
      base = Object.assign(gathered, { sky });
      if (gathered.candidates.length) {
        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { at: Date.now(), base });
      }
    }
    const { candidates, weather, resolvedCity, advisories, advisoriesStatus, spotlight, geo, sky } = base;

    // ---------- Per-user serendipity, applied on top of the shared pool ----------
    // 1. A seeded shuffle inside 5-rank blocks: near-tied candidates swap
    //    places per user per day, so your feed is yours and tomorrow's is
    //    different — without ever promoting a weak pick past a strong block.
    // 2. Ideas the client says this user has already been shown slide to the
    //    back half of the ordering (demoted, never dropped — "seen" is not
    //    "bad", it just shouldn't block discovery).
    const ownerKey = (req.user && req.user.id) ||
      (typeof (req.body && req.body.owner_id) === 'string' && req.body.owner_id.trim().slice(0, 80)) || '';
    let pool = personalOrder(daypartOrder(candidates, part), `${ownerKey}|${new Date().toISOString().slice(0, 10)}`);
    const seenRaw = Array.isArray(req.body && req.body.seen) ? req.body.seen.slice(0, 200) : [];
    if (seenRaw.length) {
      const seen = new Set(seenRaw.map(String));
      pool = [...pool.filter(c => !seen.has(String(c.id))), ...pool.filter(c => seen.has(String(c.id)))];
    }

    // Sponsored placement: at most ONE per feed, gated on relevance
    // (distance/season) inside pickFor and always clearly labeled by its
    // shelf. The advisory shelter check inside buildSections suppresses it
    // entirely on stay-indoors days — the trust contract outranks revenue.
    const sponsorPick = sponsors.pickFor({
      coords,
      month: Number(String((dateWindow && dateWindow.start) || torontoToday()).slice(5, 7)) || null
    });

    // Talk of the town (services/talkOfTown.js): this week's verified outdoor
    // happenings for the hub nearest the user — a pure read of the weekly
    // store, never a live search. One extra pick is fetched so the slot-6
    // spotlight (when no sponsor is active) leaves a full five on the shelf.
    // noteBrowse() arms a one-off background refresh for a hub that has
    // never been browsed from; it never delays this response.
    const point = coords || (geo && geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : null);
    // maxKm: the front page serves a day out, not a road trip. The weekly
    // store reaches 180 km and the Monday newsletter still gets all of it
    // (services/tottDigest.js passes no ceiling) — a week's notice is what
    // makes "worth the drive" worth reading. A feed you scroll on Saturday
    // morning is not.
    const tott = talkOfTown.active({ point, limit: 6, maxKm: talkOfTown.FEED_MAX_KM });
    talkOfTown.noteBrowse(point);
    const layout = feedLayout();

    const ideas = buildSections(pool, { near: Boolean(coords), weather, part, mode, advisories, spotlight, dateWindow, sponsor: sponsorPick, tott, layout }).slice(0, FEED_CAP + 6);

    // Corridor radar: the client remembers spots this user regularly browses
    // from ("my end of Yonge Street") and sends them along — high-rated
    // places along those corridors get their own shelf, so the storefronts
    // you drive past finally get suggested. Never blocks the feed.
    const corridors = sanitizeCorridors(req.body && req.body.corridors, coords);
    if (corridors.length) {
      try {
        // Deadline: up to 3 live Places searches must never hold the feed —
        // past 1.5 s the shelf is simply absent this load (the searches are
        // 6h-cached, so the next request usually gets it for free).
        ideas.push(...await Promise.race([
          corridorFinds(corridors, new Set(ideas.map(i => i.id))),
          new Promise(resolve => setTimeout(() => resolve([]), 1500))
        ]));
      } catch (err) { /* the radar is a bonus, never a failure */ }
    }

    const featured = pickFeatured(candidates, geo);
    // Real venue photos for curated/open-data cards. Personalized feeds are
    // built per request, but findPhotoUrl caches per venue for 24 h, so the
    // lookups are still paid roughly once per cache window.
    // One pass over ideas + featured (they draw from the same pool, so two
    // passes mostly bought the same lookups twice against the daily budget).
    {
      const seen = new Set();
      const both = ideas.concat(featured).filter(i => i && !seen.has(i.id) && seen.add(i.id));
      await enrichIdeaImages(both, { city: resolvedCity || city, coords });
    }
    const payload = {
      ideas,
      layout,
      weather: weather || null,
      advisories: advisories || [],
      advisories_status: advisoriesStatus || 'unavailable',
      city: resolvedCity || city,
      near: Boolean(coords),
      sky: sky || null,
      featured,
      // The hand-written GTA sky pool only belongs under GTA skies — for any
      // other city the algorithmic picks above carry the card alone.
      featured_curated: GTA_TOWNS.test(String(resolvedCity || city || '')),
      spotlight: spotlight || null,
      date_window: dateWindow || null,
      generated_at: new Date().toISOString()
    };

    recordBrowse(req, payload, baseCached, mode);
    res.json(payload);
  } catch (err) {
    console.error('[browse] failed:', err.message);
    res.status(500).json({ error: 'BROWSE_FAILED', message: 'Could not load ideas right now.' });
  }
});

// ---------- Corridor radar ----------
// Corridor points arrive from the client's location memory: up to 3 spots,
// each meaningfully away from the current origin (the local feed already
// covers home) and from each other.
function sanitizeCorridors(raw, origin) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw.slice(0, 5)) {
    const lat = Number(p && p.lat), lng = Number(p && p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 41 || lat > 47 || lng < -85 || lng > -73) continue; // Ontario sanity box
    if (origin && haversineKm(origin, { lat, lng }) < 5) continue;
    if (out.some(q => haversineKm(q, { lat, lng }) < 2)) continue;
    out.push({ lat, lng, label: typeof (p && p.label) === 'string' ? p.label.slice(0, 60) : null });
    if (out.length >= 3) break;
  }
  return out;
}

// Corridor points are answered from the venue index only — never a live
// Places call (a corridor is per-user, so a live search here would scale
// with users). Only crowd-verified spots (4.4+, 50+ reviews, operational,
// actually within 5 km of the corridor) make the shelf, 3 cards max.
async function corridorFinds(corridors, excludeIds) {
  const out = [];
  const results = corridors.map(pt => {
    const idx = venueIndex.lookup({ queries: [CORRIDOR_QUERY], lat: pt.lat, lng: pt.lng, radiusKm: 4 });
    return { pt, places: (idx && idx.byQuery[CORRIDOR_QUERY]) || [] };
  });
  for (const r of results) {
    const { pt, places } = r;
    for (const p of places) {
      if (out.length >= 3) break;
      if (!p.place_id || excludeIds.has(p.place_id)) continue;
      if (p.business_status && p.business_status !== 'OPERATIONAL') continue;
      if (!(p.rating >= 4.4 && (p.rating_count || 0) >= 50)) continue;
      if (p.lat == null || haversineKm(pt, p) > 5) continue;
      excludeIds.add(p.place_id);
      out.push(Object.assign(
        toBrowseIdea(Object.assign({ source: 'google_places', id: p.place_id }, p)),
        { section: 'Spotted on your route 🚗', route_label: pt.label || undefined }
      ));
    }
  }
  return out;
}

// ---------- Per-user, per-day deterministic ordering ----------
// mulberry32 over a string hash: stable for (user, day), no Math.random —
// the same user reloading gets the same feed all day; a different user (or
// tomorrow) gets a different near-tie resolution.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededRng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function personalOrder(candidates, seedStr) {
  const rng = seededRng(hashStr(seedStr));
  const out = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const block = candidates.slice(i, i + 5);
    for (let j = block.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [block[j], block[k]] = [block[k], block[j]];
    }
    out.push(...block);
  }
  return out;
}

function recordBrowse(req, payload, cached, mode) {
  const ownerKey = (req.user && req.user.id) ||
    (typeof (req.body && req.body.owner_id) === 'string' && req.body.owner_id.trim().slice(0, 80)) ||
    `ip-${req.ip}`;
  // Per-shelf serve mix (raw data only — CTR impressions now come from the
  // client's viewport-truth shelf_seen batches, not cards served).
  const shelves = {};
  for (const idea of payload.ideas) {
    if (idea.section) shelves[idea.section] = (shelves[idea.section] || 0) + 1;
  }
  // Sponsor impression: which placement (if any) this feed carried — the
  // denominator of the sponsor's monthly performance report.
  const sponsorIdea = payload.ideas.find(i => i.sponsored);
  const utm = analytics.sanitizeAttrib(req.body && req.body.attrib);
  analytics.recordEvent({
    type: 'browse_feed',
    ownerKey,
    meta: Object.assign(
      { city: payload.city, near: payload.near, mode, ideas: payload.ideas.length, cached, shelves },
      sponsorIdea ? { sponsor: sponsorIdea.id } : null,
      utm ? { utm } : null)
  });
}

// Hoisted: Intl.DateTimeFormat construction is expensive and this runs per request.
const TORONTO_HOUR_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', hour: 'numeric', hour12: false
});

function daypart() {
  const hour = Number(TORONTO_HOUR_FMT.format(new Date()));
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// ONE synthetic prompt per mode, daypart-free. The prompt drives the metered
// Google Text Searches (services/candidates.js), so baking the daypart into
// it — as this used to — meant three distinct query sets per city per day,
// re-bought every day: the single biggest line on the Sept 2026 Maps bill.
// The daypart now shapes the feed for free, after the fetch: daypartOrder()
// below nudges "right now" material up the ranked pool, and buildSections
// labels the lead shelf by time of day. R&R leans restorative/scenic;
// Adventure leans active/thrill.
// (Prompt text lives in data/feedPrompts.js so the venue index pre-buys the
// exact same strings.)
function syntheticPrompt(mode) {
  return MODE_PROMPTS[mode] || MODE_PROMPTS.rr;
}

// Time-of-day fit, applied to the shared pool without touching the network.
// A matching candidate climbs up to DAYPART_LIFT ranks (stable sort on
// index − lift), so evening surfaces dinner/patio/escape-room picks first
// without ever burying a top-ranked park below a mediocre bar.
const DAYPART_RE = {
  morning: /brunch|breakfast|coffee|caf[eé]|bakery|farmers'? market|sunrise|morning|trail|hike|hiking|park\b|garden|paddle|kayak|canoe|bike|biking|climb/i,
  afternoon: /museum|gallery|beach|zoo|aquarium|pool|water ?park|splash|trampoline|go-?kart|zipline|zip line|aerial|rafting|jet ski|axe/i,
  evening: /dinner|patio|sunset|rooftop|dessert|ice cream|night|evening|escape room|laser tag|bowling|axe|show|theatre|theater|brewery|winery|\bbar\b|\bpub\b|cocktail|live music/i
};
const DAYPART_LIFT = 8;

function daypartOrder(candidates, part) {
  const re = DAYPART_RE[part];
  if (!re || !Array.isArray(candidates)) return candidates;
  const text = c => `${c.title || ''} ${c.description || ''} ${c.category || ''} ${(c.tags || []).join(' ')}`;
  return candidates
    .map((c, i) => ({ c, score: i - (re.test(text(c)) ? DAYPART_LIFT : 0), i }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(x => x.c);
}

// ~2 km grid so neighbours share a cache entry without leaking anything
// more precise than the client already sent (~110 m rounding). No daypart
// in the key: the pool is the same all day, only its ordering changes.
function cacheKey(city, coords, mode, dateWindow) {
  const grid = coords
    ? `${Math.round(coords.lat * 50) / 50},${Math.round(coords.lng * 50) / 50}`
    : '';
  const dateKey = dateWindow ? `${dateWindow.start}..${dateWindow.end}` : '';
  return `${city.toLowerCase()}|${grid}|${mode}|${dateKey}`;
}

// Assign ranked candidates to named sections, first match wins (a card never
// repeats across sections). Section order is the display order.
function buildSections(candidates, { near, weather, part, mode, advisories, spotlight, dateWindow, sponsor, tott, layout = 'full' }) {
  // The "date aware" picker relabels the dated-events shelf so it reads
  // right whether the user is browsing "any day" or a specific date/range.
  const datedLabel = dateWindow
    ? `${dateWindow.start === dateWindow.end ? 'On that day' : 'Those days'} 📅`
    : (near ? 'On today 📅' : 'On now 📅');
  // A warning+ "stay out of the open air" advisory (smoke, dangerous heat,
  // damaging wind) reshapes the feed the same way rain does: the lead
  // section becomes indoor refuges, and the outdoor showcase steps back.
  const shelter = (advisories || []).some(a =>
    (a.severity === 'warning' || a.severity === 'danger') &&
    a.effects && a.effects.avoid_outdoor);
  const used = new Set();
  const ideas = [];
  const take = (label, list, n) => {
    let added = 0;
    // Photo-bearing candidates first (stable, so rank order holds within
    // each group): the mobile tile grid is a wall of pictures, and a
    // placeholder tile costs more attention than a slightly lower-ranked
    // place with a real photo. Same rule pickFeatured already applies.
    const ordered = list.slice().sort((a, b) => (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0));
    for (const c of ordered) {
      if (added >= n) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      ideas.push(Object.assign(toBrowseIdea(c), { section: label }));
      added++;
    }
  };

  const text = c => `${c.title || ''} ${c.description || ''} ${c.category || ''}`;
  const hasDate = c => Boolean(c.date);
  // Thrill is classified FIRST because isFood defers to it: the food regex
  // matches a MENTION of food anywhere in title/description/category, and
  // half the climbing gyms in the GTA describe a cafe or a patio. That put
  // Boulder Parc on "New & notable dining". Category stays authoritative
  // (a real restaurant is category food/patios and is never second-guessed);
  // only the loose text fallback has to yield. Same "thrill wins ties" rule
  // the mode classifiers below already use.
  const isThrill = c => c.category === 'adventures' ||
    /zipline|zip.?lin|treetop|aerial|ropes course|climb|boulder|mountain bik|bmx|kart|paintball|axe|trampoline|skydiv|parasail|paraglid|bungee|jet ski|rafting|atv|quad bik|off.?road|snowboard|toboggan|laser tag|wakeboard|surf|adrenaline|thrill/i.test(text(c));
  const isFood = c => ['food', 'patios'].includes(c.category) ||
    (!isThrill(c) &&
      /restaurant|café|cafe|coffee|brunch|breakfast|bakery|food|dining|patio|brewery|winery|dessert|ice cream|pizza|ramen|taco|bistro|eatery/i.test(text(c)));
  // Dining worth a special trip: newly opened, or 4.4+ with a real crowd
  // behind the rating. Both modes get this shelf — adventurers eat too.
  const isNotableDining = c => isFood(c) &&
    (c.newly_opened || (c.rating != null && c.rating >= 4.4 && (c.rating_count || 0) >= 100));
  const isOutdoor = c => ['water', 'adventures'].includes(c.category) ||
    /park|trail|garden|beach|nature|conservation|hike|island|waterfront|zoo|farm|lookout|falls|paddle|kayak/i.test(text(c));
  const isIndoor = c => /museum|gallery|aquarium|science|indoor|arcade|cinema|theatre|theater|library|escape room|bowling|climbing|market hall/i.test(text(c));
  // A gem is a hand-flagged wow, OR a genuinely under-the-radar find: loved
  // by the few who know it (≥4.6) but not yet discovered by the crowd
  // (25–100 reviews). The old wow-only read made "Hidden gems" a rerun of
  // the curated catalog.
  const isGem = c => c.wow === true ||
    (c.rating != null && c.rating >= 4.6 && (c.rating_count || 0) >= 25 && (c.rating_count || 0) <= 100);
  // The two mode personalities. Thrill (hoisted above isFood) wins ties: a
  // climbing gym is a thrill, not a calm indoor spot, so calm explicitly
  // excludes thrill matches.
  const isCalm = c => !isThrill(c) &&
    /garden|botanical|arboretum|trail|conservation|lookout|viewpoint|scenic|beach|waterfront|boardwalk|spa|sauna|springs|nature|greenhouse|gallery|museum|tea|picnic|sunset|quiet|peaceful|stroll/i.test(text(c));

  // Mode-preferred candidates lead; every section below draws from this
  // ordering (relative rank preserved within each half), so the whole feed
  // leans into the active mode without discarding anything.
  const prefer = mode === 'adventure' ? isThrill : isCalm;
  let pool = [...candidates.filter(prefer), ...candidates.filter(c => !prefer(c))];
  // Talk of the town picks own their titles: a candidate for the same event
  // from another source (the city calendar, Ticketmaster) leaves the pool so
  // the CNE can't sit on Top 5 AND on the shelf.
  const tottList = Array.isArray(tott) ? tott : [];
  if (tottList.length) {
    const owned = new Set(tottList.map(t => normTitleKey(t.title)));
    pool = pool.filter(c => !owned.has(normTitleKey(c.title)));
  }
  // Genuinely sheltered: indoor markers AND no outdoor ones — a "music
  // garden" matching an indoor word is still an outdoor place.
  const isSheltered = c => isIndoor(c) && !isOutdoor(c);

  // Holiday-spotlight shelf: events landing on the next stat-holiday long
  // weekend get their own named section — the "plan the long weekend" hook
  // that replaces the World Cup rail once the tournament wraps.
  const spotLabel = spotlight && spotlight.kind === 'holiday'
    ? `${spotlight.name}${spotlight.long_weekend ? ' weekend' : ''} ${spotlight.emoji}`
    : null;
  const onSpotlight = spotLabel ? pool.filter(c => isAroundSpotlight(spotlight, c.date)) : [];
  const takeSpotlight = () => { if (spotLabel) take(spotLabel, onSpotlight, 3); };

  // "Just opened" shelf (Phase 0 of the discovery plan): newly-opened
  // attractions get their own early shelf in every branch — the feed's
  // answer to "it's all over socials but not in DayHop".
  const takeJustOpened = () => take('Just opened ✨', pool.filter(c => c.newly_opened), 3);

  // The one sponsored slot (services/sponsors.js picked it, relevance-gated).
  // Always its own labeled shelf — a sponsor never masquerades as an organic
  // pick — and suppressed entirely under a shelter advisory.
  const takeSponsor = () => {
    if (sponsor && !shelter) take('Partner pick · Sponsored ⭐', [sponsor], 1);
  };

  // "Talk of the town" (services/talkOfTown.js): this week's verified outdoor
  // happenings near the user. Its own shelf in every layout; the picks are
  // already ordered pinned → rank.
  // Taken once per feed: the layout head and the branch both call it; the
  // second call must not top the shelf up with the spare sixth pick.
  let tottTaken = false;
  const takeTalkOfTown = () => {
    if (tottTaken) return;
    tottTaken = true;
    take('Talk of the town 🔥', tottList.length ? tottList : tottFallback(), 5);
  };

  // The shelf had exactly one supply line, the weekly Grok search, and no
  // floor under it. When a refresh fails or its picks all finish mid-week the
  // shelf does not degrade, it vanishes, and nothing on the page says why.
  // Observed live on 2026-10-01 and 2026-10-02: zero picks served, in the
  // month with the most going on all year.
  //
  // The floor is built from candidates the request already fetched and
  // verified at source (Ticketmaster, Eventbrite, the civic calendars): real,
  // dated, outdoor things inside the same 10-day window the weekly store
  // uses. Nothing is invented and no date is guessed, which is the only way
  // a fallback can be allowed to wear this shelf's name.
  //
  // Indoor listings are excluded on purpose. The dated pool in October is
  // mostly gallery exhibits, and "Talk of the town" promising a room of
  // paintings is how a shelf loses its meaning. Those still reach the feed
  // through the dated shelf below, which runs after this one and cannot
  // repeat a card the used-Set already holds.
  //
  // Three is the floor: a one or two card shelf under this headline reads as
  // broken, so below that the shelf is skipped and the cards flow on to the
  // dated shelf exactly as they do today.
  function tottFallback() {
    const today = torontoToday();
    // Same 10-day horizon the weekly store uses (WINDOW_DAYS in
    // services/talkOfTown.js), so the floor and the real shelf mean the
    // same thing by "this week".
    const horizon = addDays(today, 10);
    const picks = pool.filter(c =>
      hasDate(c) &&
      String(c.date).slice(0, 10) >= today &&
      String(c.date).slice(0, 10) <= horizon &&
      isOutdoor(c) && !isIndoor(c));
    return picks.length >= 3 ? picks : [];
  }

  // Season shelf: spring through fall it's trails ("push trails forward" is
  // the product promise those months), winter it's OUTDOOR winter — skating
  // trails, tubing, snowshoe — so cold months still say "get outside".
  // Skipped entirely under a shelter advisory; the planned date wins when
  // the picker is set.
  const seasonCtx = getSeasonContext((dateWindow && dateWindow.start) || torontoToday());
  const isTrailTime = c =>
    /\b(trail|hik(e|ing)|conservation|escarpment|bluffs|ravine|gorge|badlands|forest|lookout|boardwalk)\b/i.test(text(c));
  const isWinterOut = c =>
    /\b(skat(e|ing)|ice (rink|trail)|toboggan|sledding|snow ?tub(e|ing)|snowshoe|cross.?country ski|xc ski|ski (hill|resort)|snowboard|winter (village|festival|lights?)|light (festival|trail))\b/i.test(text(c));
  const takeSeasonOutside = n => {
    if (shelter) return;
    if (seasonCtx.season === 'winter') take('Winter outside ❄️', pool.filter(isWinterOut), n);
    else take('Trail time 🥾', pool.filter(isTrailTime), n);
  };

  // Summer-only shelf for the day-trip icons (Niagara, Wasaga, Sandbanks…):
  // far entries rank low under the distance penalty, so genuine
  // worth-the-drive picks get a named home BELOW every local shelf instead
  // of vanishing. Label matches the surprise page's wider-radius band.
  // A day trip is up to about three hours each way — roughly 250 km in
  // Ontario, which is the same ceiling discovery already crawls
  // (DISCOVERY_MAX_KM). Under 40 km is not a trip, it is the local shelf with
  // a drive attached; past the ceiling it stops being a day out and becomes a
  // weekend. worth_trip on an entry earns the shelf regardless of rating,
  // which is how a hand-added place gets in (relevance.js uses the same flag).
  const DAY_TRIP_MIN_KM = 40;
  const DAY_TRIP_MAX_KM = Number(process.env.DAY_TRIP_MAX_KM) > 0 ? Number(process.env.DAY_TRIP_MAX_KM) : 250;
  const isWorthDrive = c => c.distance_km != null &&
    c.distance_km > DAY_TRIP_MIN_KM && c.distance_km <= DAY_TRIP_MAX_KM &&
    (c.worth_trip === true || c.wow === true ||
      (c.rating != null && c.rating >= 4.5 && (c.rating_count || 0) >= 50));
  const takeWorthDrive = n => {
    if (shelter) return;
    // This was summer-only, so the shelf went dark at Labour Day — through
    // exactly the season Ontario drives for: colour, orchards, the salmon
    // run, the escarpment. Winter stays out on purpose (54b37aa: local play
    // first, and past 40 km the drive has to be asked for).
    if (seasonCtx.season === 'winter') return;
    take('Worth the drive 🚗', pool.filter(isWorthDrive), n);
  };

  // ---------- Top-5 layout head (TOP5_FEED=on) ----------
  // Card 1-5: the ranked pool's top, filtered exactly like the lead shelf
  // (indoor under rain or a shelter advisory). Card 6: the sponsor slot — a
  // paid partner when one is active, else this week's most talked-about
  // outdoor event as "In the spotlight" (never dressed as sponsored). Then
  // Talk of the town. Everything the branches below add after this point is
  // flagged fold:true; the client hides it behind "More ideas".
  let foldFrom = null;
  if (layout === 'top5') {
    const top = shelter ? pool.filter(isSheltered)
      : (weather && weather.is_rainy) ? pool.filter(isIndoor) : pool;
    take('Top 5 picks 🏆', top, 5);
    if (sponsor && !shelter) take('Partner pick · Sponsored ⭐', [sponsor], 1);
    else if (tottList.length) take('In the spotlight 📣', [tottList[0]], 1);
    takeTalkOfTown();
    foldFrom = ideas.length;
  }

  if (near) {
    // The pool is already ranked against the daypart+mode prompt, so "right
    // now" is simply its top — filtered to indoor picks when it's raining
    // or when an advisory says to stay out of the open air.
    const rightNow = shelter ? pool.filter(isSheltered)
      : (weather && weather.is_rainy) ? pool.filter(isIndoor) : pool;
    take(rightNowLabel(part, weather, shelter), rightNow, 6);
    takeJustOpened();
    takeTalkOfTown();
    takeSponsor();
    take('Within 15 minutes 📍',
      pool.filter(c => c.distance_km != null && c.distance_km <= 10)
        .slice().sort((a, b) => a.distance_km - b.distance_km), 6);
    takeSeasonOutside(4);
    take('New & notable dining 🍽️', pool.filter(isNotableDining), 3);
    takeSpotlight();
    takeWorthDrive(3);
    take(datedLabel, pool.filter(hasDate), 4);
    take('Hidden gems ✨', pool.filter(isGem), 4);
  } else if (mode === 'adventure') {
    if (shelter) take('Indoor thrills right now 😷', pool.filter(isSheltered), 5);
    take('Top thrills ⚡', pool, 6);
    takeJustOpened();
    takeTalkOfTown();
    takeSponsor();
    if (!shelter) take('Get outside 🌊', pool.filter(isOutdoor), 5);
    takeSeasonOutside(4);
    takeWorthDrive(3);
    takeSpotlight();
    take(datedLabel, pool.filter(hasDate), 4);
    take('Hidden gems ✨', pool.filter(isGem), 3);
    take('New & notable dining 🍽️', pool.filter(isNotableDining), 3);
    take('Refuel 🍴', pool.filter(isFood), 3);
  } else {
    if (shelter) take('Sheltered picks right now 😷', pool.filter(isSheltered), 5);
    take('Restorative picks 🌿', pool, 5);
    takeJustOpened();
    takeTalkOfTown();
    takeSponsor();
    takeSeasonOutside(5);
    if (!shelter) take('Outdoors & nature 🌳', pool.filter(isOutdoor), 4);
    takeWorthDrive(3);
    take('New & notable dining 🍽️', pool.filter(isNotableDining), 3);
    take('Food & drink 🍴', pool.filter(isFood), 4);
    takeSpotlight();
    take(datedLabel, pool.filter(hasDate), 4);
    take('Hidden gems ✨', pool.filter(isGem), 4);
  }
  // Wildcards (candidates.js): daily-rotating quality picks from OUTSIDE
  // the ranked pool — the deliberate stumble-upon shelf, in every branch.
  take('Try something different 🎲', pool.filter(c => c.wildcard), 3);

  // Catch-all: whatever survived quality gating but missed the curated
  // shelves lands here in relevance order — more to browse, never mixed
  // into (or above) the best picks.
  take('More to explore 🧭', pool, FEED_CAP);

  // With precise coordinates, closest-first is the default READING order:
  // each shelf keeps its relevance-chosen members but displays them nearest
  // first (unknown distances last). Which ideas made the feed is still
  // relevance's call; the client's "Nearest first" chip remains the
  // flat-list override across all shelves.
  if (near) {
    const bySection = new Map();
    ideas.forEach((idea, i) => {
      if (!bySection.has(idea.section)) bySection.set(idea.section, []);
      bySection.get(idea.section).push(i);
    });
    for (const slots of bySection.values()) {
      const sorted = slots
        .map(i => ideas[i])
        .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      slots.forEach((slot, k) => { ideas[slot] = sorted[k]; });
    }
  }
  if (foldFrom != null) {
    for (let i = foldFrom; i < ideas.length; i++) ideas[i].fold = true;
  }
  return ideas;
}

// ---------- "Under open skies" featured pool ----------
// City-agnostic: instead of leaning on a hand-curated GTA list, the hero's
// rotation draws sky-and-open-air material straight out of the ranked
// candidate pool for WHATEVER city was asked — observatories, lookouts,
// beaches, open-air cinema, waterfalls. Photo-bearing picks lead (the card
// is a visual), relevance order is preserved otherwise, and the client
// blends these with dated sky events plus (in the GTA) the curated pool.
const FEATURED_MATCH = /observator|planetari|stargaz|astronom|telescope|night sky|under the stars|lookout|viewpoint|scenic|sunset|golden hour|open[- ]air|outdoor (movie|cinema|film|concert)|rooftop|beach|boardwalk|waterfall|botanical|conservation area/i;

// Text search treats its radius as a bias, not a boundary — a famous garden
// 400 km away can outrank the local one. The hero card is a "your city"
// promise, so coord-bearing picks must actually be near the asked city.
const FEATURED_MAX_KM = 80;

// Coord-less candidates can't prove locality, so only feeds that are local
// by construction get a pass; everything else must measure up.
const FEATURED_LOCAL_SOURCES = new Set(['tpl_events', 'civic_calendars', 'curated', 'curated_catalog', 'toronto_open_data', 'york_open_data']);

// "Mooney's Bay Park and Beach" vs "Mooney's Bay Beach": different sources,
// same place. Key on the distinctive words so one survives.
const FEATURED_STOPWORDS = new Set(['the', 'a', 'and', 'at', 'of', 'park', 'beach', 'gardens', 'garden']);
function featuredDupKey(c) {
  return String(c.title || '').toLowerCase().replace(/[^a-z\s]/g, '')
    .split(/\s+/).filter(w => w && !FEATURED_STOPWORDS.has(w)).slice(0, 3).join(' ');
}

function pickFeatured(candidates, geo) {
  const nearEnough = c => {
    if (c.lat != null && c.lng != null) {
      return !geo || haversineKm({ lat: geo.lat, lng: geo.lng }, { lat: c.lat, lng: c.lng }) <= FEATURED_MAX_KM;
    }
    return FEATURED_LOCAL_SOURCES.has(c.source);
  };
  // Newly-opened attractions earn a hero slot regardless of the sky/open-air
  // vocabulary — being brand new IS the featured-worthy story (Phase 3).
  const matches = (candidates || []).filter(c =>
    nearEnough(c) &&
    (c.newly_opened === true ||
      FEATURED_MATCH.test(`${c.title || ''} ${c.description || ''} ${c.venue || ''}`)));
  const seen = new Set();
  const deduped = [];
  for (const c of matches.filter(m => m.image_url).concat(matches.filter(m => !m.image_url))) {
    const key = featuredDupKey(c);
    if (key && seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped.slice(0, 8).map(toBrowseIdea);
}

function rightNowLabel(part, weather, shelter) {
  if (shelter) return 'Sheltered picks right now 😷';
  if (weather && weather.is_rainy) return 'Rain-proof right now ☔';
  if (weather && weather.is_extreme_heat) return 'Beat the heat right now 🥵';
  if (part === 'morning') return 'Perfect this morning ☀️';
  if (part === 'evening') return 'Perfect tonight 🌆';
  return 'Perfect for right now ⚡';
}

// fallbackIdea gives the base card shape; browse cards additionally carry
// the booking/maps links and richness mergeWithCandidates would attach.
function toBrowseIdea(c) {
  return Object.assign(fallbackIdea(c), {
    booking_url: c.booking_url || null,
    maps_url: c.maps_url || null,
    website: c.website || null,
    rating: c.rating != null ? c.rating : null,
    open_now: c.open_now != null ? c.open_now : null,
    price_from: c.price_from != null ? c.price_from : null,
    currency: c.currency || null,
    image_url: c.image_url || null,
    date: c.date || null,
    date_end: c.date_end && c.date_end !== c.date ? c.date_end : undefined,
    tott: c.tott === true || undefined,
    venue: c.venue || null,
    civic: c.civic === true || undefined,
    also_from: c.also_from || undefined,
    wow: c.wow === true || undefined,
    newly_opened: c.newly_opened === true || undefined,
    sponsored: c.sponsored === true || undefined,
    distance_km: c.distance_km != null ? c.distance_km : undefined
  });
}

// ---------- Default-pool warmer ----------
// The most common first-visit request is the anonymous GTA-wide feed (the
// client sends 'Across the GTA' until a location is chosen). Prime its
// candidate pool for both modes whenever the entry is missing or expired,
// so a brand-new visitor hits the 30-min cache (~1-2 s) instead of paying
// the cold 14-source fan-out (4-9 s). Called from server.js on boot and on
// the keep-alive tick; a no-op while the entries are still fresh, so the
// partner-API cost is at most one gather per mode per TTL window.
const GTA_WIDE_CITY = 'Across the GTA'; // mirrors GTA_WIDE in public/app.js
async function warmDefaultPool() {
  for (const mode of ['rr', 'adventure']) {
    const key = cacheKey(GTA_WIDE_CITY, null, mode, null);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) continue;
    try {
      const [gathered, sky] = await Promise.all([
        gatherCandidates(syntheticPrompt(mode), GTA_WIDE_CITY, '', null, null, mode, null),
        getSkyTonight(GTA_CENTER)
      ]);
      if (gathered.candidates.length) {
        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { at: Date.now(), base: Object.assign(gathered, { sky }) });
        console.log(`[browse] warmed default pool (${mode}): ${gathered.candidates.length} candidates`);
      }
    } catch (err) {
      console.warn(`[browse] default pool warm failed (${mode}):`, err.message);
    }
  }
}

module.exports = router;
// Exported for the invariant tests (test/browseSections.test.js) — pure
// function over candidate objects, no network.
module.exports.buildSections = buildSections;
module.exports.warmDefaultPool = warmDefaultPool;
// Cost invariants (test/browseDaypart.test.js): the pool key and prompt must
// stay daypart-free, and daypart ordering must be pure.
module.exports.cacheKey = cacheKey;
module.exports.syntheticPrompt = syntheticPrompt;
module.exports.daypartOrder = daypartOrder;
// Exported for the card-badge invariant test (test/ideaOpenNow.test.js) —
// pure function over a candidate object, no network.
module.exports.toBrowseIdea = toBrowseIdea;
