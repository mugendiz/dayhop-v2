// routes/surprise.js — DayHop V2
// POST /api/surprise { city, coords?, mode, wider?, exclude? } — the
// "Surprise me" feed: for people with no prompt in mind, a mode-and-
// location-aware grab bag built from the same grounding pipeline as
// browse — synthetic prompt, NO Grok call, server-assigned sections:
//
//   Social gleanings 🔥              — the discovery autopilot's buzz-verified
//                                      finds (never live buzz calls — too slow)
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

// Wider pages sweep further out; the local sections adjust their distance
// bands to match ("worth the drive" = genuinely beyond the local band).
const WIDER_RADIUS_KM = 50;
const LOCAL_MAX_KM = 12;          // with real user coords
const LOCAL_MAX_KM_CITY = 20;     // city-centroid distances are fuzzier
const DRIVE_MIN_KM = 15;
const DRIVE_MAX_KM = 80;
const SECTION_CAP = 6;
const MIN_FEED = 6;               // below this, the backstop shelf tops up
const EXCLUDE_MAX = 200;

// Two fixed variants per mode (not free-form): a small stable set keeps
// googleMaps' query-keyed cache warm, so repeat presses are cheap.
const SURPRISE_PROMPTS = {
  rr: [
    'hidden gems, surprising beautiful places, buzzworthy new openings, scenic lookouts, unusual gardens, acclaimed restaurants and Michelin-recognized dining, and calm one-of-a-kind spots locals love',
    'secret gardens, quiet scenic viewpoints, remarkable new openings, peaceful waterfronts, charming cafés, celebrated fine dining and viral food spots locals line up for, and under-the-radar calm places locals recommend'
  ],
  adventure: [
    'surprising thrills, unusual adrenaline activities, buzzworthy new attractions, one-of-a-kind adventures and hidden gems locals rave about',
    'unique adventure experiences, exciting new attractions, adrenaline sports, unusual outdoor challenges and thrilling hidden gems locals talk about'
  ]
};
const WIDER_SUFFIX = ', worth the drive, standout destination attractions';

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
    const prompt = variants[Math.floor(Math.random() * variants.length)] + (wider ? WIDER_SUFFIX : '');

    const key = poolKey(city, coords, mode, wider, dateWindow, prompt);
    const hit = poolCache.get(key);
    let gathered = null;
    if (hit && Date.now() - hit.at < POOL_TTL_MS) {
      const filtered = hit.gathered.candidates.filter(c =>
        !excludeIds.has(String(c.id)) && !excludeTitles.has(normTitle(c.title)));
      // A drained pool must not serve an anemic feed from cache — fall
      // through to a real (deeper, exclusion-aware) gather instead.
      if (filtered.length >= MIN_FEED) {
        gathered = Object.assign({}, hit.gathered, { candidates: filtered });
      }
    }
    if (!gathered) {
      const excludesActive = excludeIds.size > 0 || excludeTitles.size > 0;
      gathered = await gatherCandidates(prompt, city, '', null, coords, mode, dateWindow, {
        radiusKm: wider ? WIDER_RADIUS_KM : null,
        excludeIds: excludeIds.size ? excludeIds : null,
        excludeTitles: excludeTitles.size ? excludeTitles : null
      });
      // Only a pool gathered WITHOUT per-user excludes is shareable.
      if (!excludesActive && gathered.candidates.length) {
        if (poolCache.size >= POOL_CACHE_MAX) poolCache.delete(poolCache.keys().next().value);
        poolCache.set(key, { at: Date.now(), gathered });
      }
    }
    const { candidates, weather, resolvedCity, advisories, advisoriesStatus } = gathered;

    const ideas = buildSurpriseSections(candidates, { mode, near: Boolean(coords), wider });
    await enrichIdeaImages(ideas, { city: resolvedCity || city, coords });

    const ownerKey = (req.user && req.user.id) ||
      (typeof body.owner_id === 'string' && body.owner_id.trim().slice(0, 80)) ||
      `ip-${req.ip}`;
    analytics.recordEvent({
      type: 'surprise_feed',
      ownerKey,
      meta: { city: resolvedCity || city, mode, wider, ideas: ideas.length, excluded: excludeIds.size }
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
function buildSurpriseSections(candidates, { mode, near, wider }) {
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
  const pool = [...candidates.filter(prefer), ...candidates.filter(c => !prefer(c))];

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

  // 1) Social gleanings — buzz-verified finds from the discovery autopilot
  // (buzz_score persisted at publish time) plus anything newly opened,
  // engagement-ranked. Never a live social call.
  const social = pool
    .filter(c => c.newly_opened === true || c.buzz_score != null || c.auto === true)
    .slice().sort((a, b) =>
      (b.buzz_score || 0) - (a.buzz_score || 0) ||
      (b.engagement_30d || 0) - (a.engagement_30d || 0) ||
      Number(b.newly_opened === true) - Number(a.newly_opened === true));
  take('Social gleanings 🔥', social, SECTION_CAP);

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
    const isFood = c => c.category === 'food' ||
      /restaurant|dining|bistro|brasserie|trattoria|osteria|izakaya|omakase|steakhouse|tasting menu|michelin|chef|eatery|supper club|wine bar|café|cafe|patisserie|bakery|brunch|dessert/i.test(text(c));
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
  // two-card surprise — top up from the ranked pool.
  if (ideas.length < MIN_FEED) {
    take('More surprises 🎁', pool, MIN_FEED * 2 - ideas.length);
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
