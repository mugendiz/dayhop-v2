// routes/surprise.js — DayHop V2
// POST /api/surprise { city, coords?, mode, wider?, exclude? } — the
// "Surprise me" feed: for people with no prompt in mind, a mode-and-
// location-aware grab bag built from the same grounding pipeline as
// browse — synthetic prompt, NO Grok call, server-assigned sections:
//
//   Talk of the town 🔥              — this week's verified happenings for the
//                                      hub nearest the user (services/talkOfTown.js),
//                                      a pure read of the weekly store
//   Top local locations 📍           — highest-rated places nearby
//   Curated by the discovery engine ✨ — catalog picks + hidden gems
//
// The bottom-of-feed "Next" button hits the same route with `wider: true`
// (Places radius opens up to 50 km) and an `exclude` list of everything
// already on screen, so each page is fresh: unrelated-but-awesome stuff,
// including places worth the drive. Not cached (exclude lists are
// per-user) and no LLM spend, so it doesn't count against daily_generates.

const express = require('express');
const router = express.Router();

const analytics = require('../services/analytics');
const { normalizeMode } = require('../services/grok');
const { gatherCandidates, sanitizeCoords, fallbackIdea, parseDateWindow, DEFAULT_CITY } = require('../services/candidates');
const { enrichIdeaImages } = require('../services/ideaPhotos');
const talkOfTown = require('../services/talkOfTown');

// Wider pages sweep further out; the local sections adjust their distance
// bands to match ("worth the drive" = genuinely beyond the local band).
const WIDER_RADIUS_KM = 50;
const LOCAL_MAX_KM = 12;          // with real user coords
const LOCAL_MAX_KM_CITY = 20;     // city-centroid distances are fuzzier
const DRIVE_MIN_KM = 15;
const DRIVE_MAX_KM = 80;
const SECTION_CAP = 6;
// Talk of the town leads the feed, so it has to look like a shelf and not a
// leftover. Below this many verified picks the shelf is skipped entirely
// rather than shipped thin — the old buzz shelf it replaces routinely
// rendered two cards under a headline promising the talk of the town.
const TOTT_MIN = 4;
const MIN_FEED = 6;               // below this, the backstop shelf tops up
const EXCLUDE_MAX = 200;

// Two fixed variants per mode (not free-form), shared with the venue index
// (data/feedPrompts.js) so every press is answered from pre-bought rows.
// "Wider" pages widen the RADIUS (more index cells), not the prompt text —
// a suffixed prompt would be a new, unindexed query.
const { SURPRISE_PROMPTS } = require('../data/feedPrompts');

const normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Pre-exclusion pool cache. The full source fan-out is identical for every
// press from the same spot — only the per-user exclude list varies, and
// applying it is pure local work. So the pool is cached (like browse), the
// exclusion + randomized sectioning stay per-request (so it still feels
// fresh), and only when a user's excludes drain the cached pool below a
// usable feed does the press fall through to a real gather.
const POOL_TTL_MS = 10 * 60 * 1000;
const POOL_CACHE_MAX = 50;
const poolCache = new Map(); // key -> { at, gathered }

function poolKey(city, coords, mode, wider, dateWindow, prompt) {
  const grid = coords
    ? `${Math.round(coords.lat * 50) / 50},${Math.round(coords.lng * 50) / 50}`
    : '';
  const dateKey = dateWindow ? `${dateWindow.start}..${dateWindow.end}` : '';
  return `${city.toLowerCase()}|${grid}|${mode}|${wider ? 'w' : ''}|${dateKey}|${prompt}`;
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const city = String(body.city || '').trim().slice(0, 120) || DEFAULT_CITY;
  const coords = sanitizeCoords(body.coords);
  const mode = normalizeMode(body.mode);
  const dateWindow = parseDateWindow(body.date, body.date_end);
  const wider = body.wider === true;

  // Everything already on the user's screen, id or title — each entry goes
  // in BOTH sets (cheap, and the client doesn't have to know which is which).
  const excludeIds = new Set();
  const excludeTitles = new Set();
  if (Array.isArray(body.exclude)) {
    for (const raw of body.exclude.slice(0, EXCLUDE_MAX)) {
      const s = String(raw).slice(0, 160).trim();
      if (!s) continue;
      excludeIds.add(s);
      const t = normTitle(s);
      if (t) excludeTitles.add(t);
    }
  }

  try {
    const variants = SURPRISE_PROMPTS[mode] || SURPRISE_PROMPTS.rr;
    // Variant rotates by DAY, not by press: a random pick per request made
    // every press a fresh pool key (and a fresh metered fan-out). Variety
    // within a day comes from the randomized sectioning below.
    const dayIdx = Math.floor(Date.now() / 86400000);
    const prompt = variants[dayIdx % variants.length];
    const excludesActive = excludeIds.size > 0 || excludeTitles.size > 0;
    const notExcluded = c => !excludeIds.has(String(c.id)) && !excludeTitles.has(normTitle(c.title));
    const gatherOpts = {
      radiusKm: wider ? WIDER_RADIUS_KM : null,
      // A wider "Next" page is one metered prompt search, not a full theme
      // fan-out — the local page already bought the themes.
      skipThemes: Boolean(wider)
    };

    const key = poolKey(city, coords, mode, wider, dateWindow, prompt);
    const hit = poolCache.get(key);
    let shared = (hit && Date.now() - hit.at < POOL_TTL_MS) ? hit.gathered : null;
    if (!shared) {
      // ALWAYS gather the shareable pool first (no per-user excludes) and
      // cache it — excludes are applied locally afterwards. "Next" pages
      // used to pass excludes INTO the gather, which made every page an
      // uncacheable full fan-out, and the client auto-fires Next on scroll.
      shared = await gatherCandidates(prompt, city, '', null, coords, mode, dateWindow, gatherOpts);
      if (shared.candidates.length) {
        if (poolCache.size >= POOL_CACHE_MAX) poolCache.delete(poolCache.keys().next().value);
        poolCache.set(key, { at: Date.now(), gathered: shared });
      }
    }
    let gathered;
    const filtered = shared.candidates.filter(notExcluded);
    if (!excludesActive || filtered.length >= MIN_FEED) {
      gathered = Object.assign({}, shared, { candidates: filtered });
    } else {
      // A drained pool must not serve an anemic feed — do the deeper,
      // exclusion-aware gather. Its Google searches are the same keys the
      // shared gather just filled, so this costs zero metered calls.
      gathered = await gatherCandidates(prompt, city, '', null, coords, mode, dateWindow, Object.assign({}, gatherOpts, {
        excludeIds, excludeTitles
      }));
    }
    const { candidates, weather, resolvedCity, advisories, advisoriesStatus } = gathered;

    // Talk of the town (services/talkOfTown.js) leads the feed: this week's
    // verified happenings for the hub nearest the user. A pure read of the
    // weekly store, never a live search, so it costs nothing per press and
    // the surprise feed can't disagree with what browse is showing.
    // noteBrowse() arms a one-off background refresh for a hub nobody has
    // browsed from yet; it never delays this response.
    const point = coords ||
      (gathered.geo && gathered.geo.lat != null ? gathered.geo : null);
    const tott = talkOfTown.active({ point, limit: SECTION_CAP });
    talkOfTown.noteBrowse(point);

    const ideas = buildSurpriseSections(candidates, { mode, near: Boolean(coords), wider, tott });
    await enrichIdeaImages(ideas, { city: resolvedCity || city, coords });

    const ownerKey = (req.user && req.user.id) ||
      (typeof body.owner_id === 'string' && body.owner_id.trim().slice(0, 80)) ||
      `ip-${req.ip}`;
    // Per-shelf serve mix (raw data only — CTR impressions now come from
    // the client's viewport-truth shelf_seen batches, not cards served).
    const shelves = {};
    for (const idea of ideas) {
      if (idea.section) shelves[idea.section] = (shelves[idea.section] || 0) + 1;
    }
    analytics.recordEvent({
      type: 'surprise_feed',
      ownerKey,
      meta: { city: resolvedCity || city, mode, wider, ideas: ideas.length, excluded: excludeIds.size, shelves }
    });

    res.json({
      ideas,
      weather: weather || null,
      advisories: advisories || [],
      advisories_status: advisoriesStatus || 'unavailable',
      city: resolvedCity || city,
      near: Boolean(coords),
      // The client hides the Next button once the well runs dry.
      exhausted: ideas.length < 5,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[surprise] failed:', err.message);
    res.status(500).json({ error: 'SURPRISE_FAILED', message: 'Could not pull a surprise together right now.' });
  }
});

// Assign ranked candidates to the surprise shelves, first match wins.
// Same used-Set discipline as browse's buildSections: a card never repeats.
function buildSurpriseSections(candidates, { mode, near, wider, tott }) {
  const used = new Set();
  const ideas = [];
  const take = (label, list, n) => {
    let added = 0;
    for (const c of list) {
      if (added >= n) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      ideas.push(Object.assign(toFeedIdea(c), { section: label }));
      added++;
    }
  };

  // Mode personalities — same classifiers as browse.js (thrill wins ties).
  const text = c => `${c.title || ''} ${c.description || ''} ${c.category || ''}`;
  const isThrill = c => c.category === 'adventures' ||
    /zipline|zip.?lin|treetop|aerial|ropes course|climb|boulder|mountain bik|bmx|kart|paintball|axe|trampoline|skydiv|parasail|paraglid|bungee|jet ski|rafting|atv|quad bik|off.?road|snowboard|toboggan|laser tag|wakeboard|surf|adrenaline|thrill/i.test(text(c));
  const isCalm = c => !isThrill(c) &&
    /garden|botanical|arboretum|trail|conservation|lookout|viewpoint|scenic|beach|waterfront|boardwalk|spa|sauna|springs|nature|greenhouse|gallery|museum|tea|picnic|sunset|quiet|peaceful|stroll/i.test(text(c));
  const prefer = mode === 'adventure' ? isThrill : isCalm;
  let pool = [...candidates.filter(prefer), ...candidates.filter(c => !prefer(c))];

  // Talk of the town reaches further than surprise does: talkOfTown.active()
  // admits anything within HUB_REACH_KM (180 km) of the hub, and this feed
  // promises 80 (test/surpriseSections.test.js). The band is applied here,
  // before anything else looks at the list, so the shelf cannot be the one
  // that turns "surprise" into a road trip. Unknown distance stays eligible,
  // same allowance the curated shelf makes.
  const tottList = (Array.isArray(tott) ? tott : [])
    .filter(t => t.distance_km == null || t.distance_km <= DRIVE_MAX_KM);

  // The picks that survive own their titles, same rule browse.js applies: a
  // candidate for the same happening from another source (the city calendar,
  // Ticketmaster) leaves the pool so one event can't hold two slots. A pick
  // dropped for distance above releases its twin back to the pool.
  if (tottList.length) {
    const owned = new Set(tottList.map(t => normTitle(t.title)));
    pool = pool.filter(c => !owned.has(normTitle(c.title)));
  }

  // Repeat presses with identical inputs should still feel different:
  // sample the picks from the top 2×cap of each sorted shelf.
  const sample = (list, cap) => {
    const top = list.slice(0, cap * 2);
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    return top;
  };

  // 1) Talk of the town — this week's verified happenings for the user's hub,
  // already ordered pinned then rank by talkOfTown.active(). Replaces the old
  // "Social gleanings" shelf, which ranked whatever the discovery autopilot
  // had published by a stale buzz_score and regularly rendered two cards.
  // Below TOTT_MIN the shelf is skipped rather than shipped thin.
  //
  // Nothing is lost by dropping the buzz shelf: the newly-opened and
  // autopilot finds it used to consume stay in the pool and flow into the
  // shelves below instead of being pulled out into a headline of their own.
  if (tottList.length >= TOTT_MIN) take('Talk of the town 🔥', tottList, SECTION_CAP);

  // 2) Top local locations — the best-rated real places around the user.
  // Wider pages flip this into "worth the drive": genuinely beyond the
  // local band, capped at 80 km so "surprise" never means "road trip".
  const localMax = near ? LOCAL_MAX_KM : LOCAL_MAX_KM_CITY;
  const inBand = c => c.distance_km != null && (wider
    ? (c.distance_km >= DRIVE_MIN_KM && c.distance_km <= DRIVE_MAX_KM)
    : c.distance_km <= localMax);
  let top = pool.filter(c => c.rating != null && c.rating >= 4.5 && (c.rating_count || 0) >= 50 && inBand(c));
  // No measurable distances at all (geocode failed) → best-rated anywhere.
  if (!top.length && !pool.some(c => c.distance_km != null)) {
    top = pool.filter(c => c.rating != null && c.rating >= 4.5 && (c.rating_count || 0) >= 50);
  }
  top = top.slice().sort((a, b) => (b.rating - a.rating) || ((b.rating_count || 0) - (a.rating_count || 0)));
  take(wider ? 'Worth the drive 🚗' : 'Top local locations 📍', sample(top, SECTION_CAP), SECTION_CAP);

  // 2b) Top tables — R&R only: the city's serious restaurants (the prompt
  // vocabulary pulls acclaimed / Michelin-recognized / viral dining into
  // the pool). Rating-count floor stays high so this shelf reads "the
  // places people talk about", never "a food court that averages well".
  if (mode !== 'adventure') {
    // Category is authoritative; the text fallback yields to isThrill for the
    // same reason browse.js's does — a bouldering gym that mentions its cafe
    // is not one of the city's serious restaurants.
    const isFood = c => c.category === 'food' ||
      (!isThrill(c) &&
        /restaurant|dining|bistro|brasserie|trattoria|osteria|izakaya|omakase|steakhouse|tasting menu|michelin|chef|eatery|supper club|wine bar|café|cafe|patisserie|bakery|brunch|dessert/i.test(text(c)));
    const tables = pool
      .filter(c => isFood(c) && c.rating != null && c.rating >= 4.4 && (c.rating_count || 0) >= 100)
      .slice().sort((a, b) => (b.rating - a.rating) || ((b.rating_count || 0) - (a.rating_count || 0)));
    take('Top tables 🍽️', sample(tables, SECTION_CAP), SECTION_CAP);
  }

  // 3) Curated by the discovery engine — catalog picks and hidden gems.
  // Same distance band as shelf 2: the catalog now carries day-trip icons
  // (Niagara, Wasaga…) well past 80 km, and "surprise" still never means
  // "road trip". Unknown distance (no coords shared) stays eligible.
  const curated = pool.filter(c =>
    (c.source === 'curated_catalog' || c.source === 'curated' || c.wow === true) &&
    (c.distance_km == null || inBand(c) || c.distance_km <= DRIVE_MAX_KM));
  take('Curated by the discovery engine ✨', sample(curated, SECTION_CAP), SECTION_CAP);

  // Backstop: a thin area (or a deep Next page) never renders an anemic
  // two-card surprise — top up from the ranked pool. It draws from the whole
  // pool rather than a shelf's narrow filter, but the 80 km promise binds it
  // like every other shelf: it used to top up from the raw pool and would
  // happily serve a 119 km catalog icon, which is the exact bug the shelves
  // above were fixed for on 2026-08-15. It only ever passed the test because
  // the shelves above happened to consume the near items first. A short feed
  // beats a surprise that is secretly a road trip.
  if (ideas.length < MIN_FEED) {
    const inPromise = pool.filter(c => c.distance_km == null || c.distance_km <= DRIVE_MAX_KM);
    take('More surprises 🎁', inPromise, MIN_FEED * 2 - ideas.length);
  }
  return ideas;
}

// Same card shape browse serves — fallbackIdea base + the booking/maps
// richness mergeWithCandidates would attach on the generate path.
function toFeedIdea(c) {
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
    venue: c.venue || null,
    civic: c.civic === true || undefined,
    also_from: c.also_from || undefined,
    wow: c.wow === true || undefined,
    newly_opened: c.newly_opened === true || undefined,
    distance_km: c.distance_km != null ? c.distance_km : undefined
  });
}

module.exports = router;
// Exported for the invariant tests (test/surpriseSections.test.js) — pure
// function over candidate objects, no network.
module.exports.buildSurpriseSections = buildSurpriseSections;
module.exports.DRIVE_MAX_KM = DRIVE_MAX_KM;
// Exported for the card-badge invariant test (test/ideaOpenNow.test.js) —
// pure function over a candidate object, no network.
module.exports.toFeedIdea = toFeedIdea;
