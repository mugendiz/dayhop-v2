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
const { isAroundSpotlight, formatRange, torontoToday } = require('../services/spotlight');
const { getSeasonContext } = require('../data/seasons');
const { haversineKm } = require('../services/relevance');
const { getSkyTonight } = require('../services/skyConditions');
const maps = require('../services/googleMaps');
const sponsors = require('../services/sponsors');

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
  const key = cacheKey(city, coords, part, mode, dateWindow);

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
        gatherCandidates(syntheticPrompt(part, mode), city, '', null, coords, mode, dateWindow),
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
    let pool = personalOrder(candidates, `${ownerKey}|${new Date().toISOString().slice(0, 10)}`);
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

    const ideas = buildSections(pool, { near: Boolean(coords), weather, part, mode, advisories, spotlight, dateWindow, sponsor: sponsorPick }).slice(0, FEED_CAP);

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
    await Promise.all([
      enrichIdeaImages(ideas, { city: resolvedCity || city, coords }),
      enrichIdeaImages(featured, { city: resolvedCity || city, coords })
    ]);
    const payload = {
      ideas,
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

// One tightly-biased, 6h-cached Places search per corridor point; only
// crowd-verified spots (4.4+, 50+ reviews, operational, actually within
// 5 km of the corridor) make the shelf, 3 cards max.
async function corridorFinds(corridors, excludeIds) {
  const out = [];
  const results = await Promise.allSettled(corridors.map(pt =>
    maps.searchPlaces({
      query: 'popular restaurants cafes and attractions',
      lat: pt.lat, lng: pt.lng, radiusMeters: 4000, maxResults: 6
    }).then(places => ({ pt, places }))));
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { pt, places } = r.value;
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
  // Per-shelf impression counts — the denominator of the admin dashboard's
  // shelf CTR (clicks arrive from the client with meta.section).
  const shelves = {};
  for (const idea of payload.ideas) {
    if (idea.section) shelves[idea.section] = (shelves[idea.section] || 0) + 1;
  }
  // Sponsor impression: which placement (if any) this feed carried — the
  // denominator of the sponsor's monthly performance report.
  const sponsorIdea = payload.ideas.find(i => i.sponsored);
  analytics.recordEvent({
    type: 'browse_feed',
    ownerKey,
    meta: Object.assign(
      { city: payload.city, near: payload.near, mode, ideas: payload.ideas.length, cached, shelves },
      sponsorIdea ? { sponsor: sponsorIdea.id } : null)
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

// The daypart AND mode are baked into the synthetic prompt, so the existing
// relevance ranking naturally floats "right now, right vibe" material to the
// top of the pool. R&R leans restorative/scenic; Adventure leans active/thrill.
const DAYPART_PROMPTS = {
  rr: {
    morning: 'peaceful gardens and parks, quiet scenic trails, calm waterfront walks, cozy coffee and brunch spots, farmers markets, lookouts and viewpoints, conservation areas',
    afternoon: 'botanical gardens and parks, scenic trails and lookouts, calm beaches, museums and galleries, spas and wellness, tea rooms and quiet cafés, waterfront strolls, picnic spots',
    evening: 'relaxed dinner spots, quiet patios, sunset lookouts, waterfront walks, gardens, dessert cafés, calm evening strolls'
  },
  adventure: {
    morning: 'ziplining and treetop trekking, rock climbing, mountain biking trails, kayaking and paddleboarding, hiking adventures, aerial adventure parks, go-karting',
    afternoon: 'ziplining and aerial adventure parks, rock climbing, kayaking and rafting, mountain biking, go-karts, jet ski and watersport rentals, trampoline parks, adventure tours, axe throwing',
    evening: 'go-karting, indoor climbing, axe throwing, escape rooms, trampoline parks, laser tag, high-energy evening events and shows, night hikes'
  }
};

function syntheticPrompt(part, mode) {
  const byPart = DAYPART_PROMPTS[mode] || DAYPART_PROMPTS.rr;
  return byPart[part] || byPart.afternoon;
}

// ~2 km grid so neighbours share a cache entry without leaking anything
// more precise than the client already sent (~110 m rounding).
function cacheKey(city, coords, part, mode, dateWindow) {
  const grid = coords
    ? `${Math.round(coords.lat * 50) / 50},${Math.round(coords.lng * 50) / 50}`
    : '';
  const dateKey = dateWindow ? `${dateWindow.start}..${dateWindow.end}` : '';
  return `${city.toLowerCase()}|${grid}|${part}|${mode}|${dateKey}`;
}

// Assign ranked candidates to named sections, first match wins (a card never
// repeats across sections). Section order is the display order.
function buildSections(candidates, { near, weather, part, mode, advisories, spotlight, dateWindow, sponsor }) {
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
    for (const c of list) {
      if (added >= n) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      ideas.push(Object.assign(toBrowseIdea(c), { section: label }));
      added++;
    }
  };

  const text = c => `${c.title || ''} ${c.description || ''} ${c.category || ''}`;
  const hasDate = c => Boolean(c.date);
  const isFood = c => ['food', 'patios'].includes(c.category) ||
    /restaurant|café|cafe|coffee|brunch|breakfast|bakery|food|dining|patio|brewery|winery|dessert|ice cream|pizza|ramen|taco|bistro|eatery/i.test(text(c));
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
  // The two mode personalities. Thrill wins ties (a climbing gym is a thrill,
  // not a calm indoor spot), so calm explicitly excludes thrill matches.
  const isThrill = c => c.category === 'adventures' ||
    /zipline|zip.?lin|treetop|aerial|ropes course|climb|boulder|mountain bik|bmx|kart|paintball|axe|trampoline|skydiv|parasail|paraglid|bungee|jet ski|rafting|atv|quad bik|off.?road|snowboard|toboggan|laser tag|wakeboard|surf|adrenaline|thrill/i.test(text(c));
  const isCalm = c => !isThrill(c) &&
    /garden|botanical|arboretum|trail|conservation|lookout|viewpoint|scenic|beach|waterfront|boardwalk|spa|sauna|springs|nature|greenhouse|gallery|museum|tea|picnic|sunset|quiet|peaceful|stroll/i.test(text(c));

  // Mode-preferred candidates lead; every section below draws from this
  // ordering (relative rank preserved within each half), so the whole feed
  // leans into the active mode without discarding anything.
  const prefer = mode === 'adventure' ? isThrill : isCalm;
  const pool = [...candidates.filter(prefer), ...candidates.filter(c => !prefer(c))];
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
  const isWorthDrive = c => c.distance_km != null && c.distance_km > 40 &&
    (c.wow === true || (c.rating != null && c.rating >= 4.5 && (c.rating_count || 0) >= 50));
  const takeWorthDrive = n => {
    if (shelter) return;
    if (seasonCtx.season === 'summer') take('Worth the drive 🚗', pool.filter(isWorthDrive), n);
  };

  if (near) {
    // The pool is already ranked against the daypart+mode prompt, so "right
    // now" is simply its top — filtered to indoor picks when it's raining
    // or when an advisory says to stay out of the open air.
    const rightNow = shelter ? pool.filter(isSheltered)
      : (weather && weather.is_rainy) ? pool.filter(isIndoor) : pool;
    take(rightNowLabel(part, weather, shelter), rightNow, 6);
    takeJustOpened();
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
    price_from: c.price_from != null ? c.price_from : null,
    currency: c.currency || null,
    image_url: c.image_url || null,
    date: c.date || null,
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
  const part = daypart();
  for (const mode of ['rr', 'adventure']) {
    const key = cacheKey(GTA_WIDE_CITY, null, part, mode, null);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) continue;
    try {
      const [gathered, sky] = await Promise.all([
        gatherCandidates(syntheticPrompt(part, mode), GTA_WIDE_CITY, '', null, null, mode, null),
        getSkyTonight(GTA_CENTER)
      ]);
      if (gathered.candidates.length) {
        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { at: Date.now(), base: Object.assign(gathered, { sky }) });
        console.log(`[browse] warmed default pool (${mode}/${part}): ${gathered.candidates.length} candidates`);
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
