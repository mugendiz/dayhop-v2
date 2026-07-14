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
const { gatherCandidates, sanitizeCoords, fallbackIdea, DEFAULT_CITY } = require('../services/candidates');
const { enrichIdeaImages } = require('../services/ideaPhotos');

// One entry per (city|coords-grid|daypart). 30 minutes keeps partner-API
// usage flat while staying fresh enough for weather/daypart shifts.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map();

// Section size ceilings; overlaps are deduped and the pool is already
// quality-gated (candidates.js), so the final feed is a tight top-10 —
// only the best, never overwhelming.
const FEED_CAP = 10;

router.post('/', async (req, res) => {
  const city = String((req.body && req.body.city) || '').trim().slice(0, 120) || DEFAULT_CITY;
  const coords = sanitizeCoords(req.body && req.body.coords);
  const mode = normalizeMode(req.body && req.body.mode);
  const part = daypart();
  const key = cacheKey(city, coords, part, mode);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    recordBrowse(req, hit.payload, true, mode);
    return res.json(hit.payload);
  }

  try {
    const { candidates, weather, resolvedCity } =
      await gatherCandidates(syntheticPrompt(part, mode), city, '', null, coords);

    const ideas = buildSections(candidates, { near: Boolean(coords), weather, part, mode }).slice(0, FEED_CAP);
    // Real venue photos for curated/open-data cards; the enriched feed is
    // what gets cached, so the lookups are paid once per cache window.
    await enrichIdeaImages(ideas, { city: resolvedCity || city, coords });
    const payload = {
      ideas,
      weather: weather || null,
      city: resolvedCity || city,
      near: Boolean(coords),
      generated_at: new Date().toISOString()
    };

    if (ideas.length) {
      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), payload });
    }
    recordBrowse(req, payload, false, mode);
    res.json(payload);
  } catch (err) {
    console.error('[browse] failed:', err.message);
    res.status(500).json({ error: 'BROWSE_FAILED', message: 'Could not load ideas right now.' });
  }
});

function recordBrowse(req, payload, cached, mode) {
  const ownerKey = (req.user && req.user.id) ||
    (typeof (req.body && req.body.owner_id) === 'string' && req.body.owner_id.trim().slice(0, 80)) ||
    `ip-${req.ip}`;
  analytics.recordEvent({
    type: 'browse_feed',
    ownerKey,
    meta: { city: payload.city, near: payload.near, mode, ideas: payload.ideas.length, cached }
  });
}

function daypart() {
  const hour = Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', hour12: false
  }).format(new Date()));
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
function cacheKey(city, coords, part, mode) {
  const grid = coords
    ? `${Math.round(coords.lat * 50) / 50},${Math.round(coords.lng * 50) / 50}`
    : '';
  return `${city.toLowerCase()}|${grid}|${part}|${mode}`;
}

// Assign ranked candidates to named sections, first match wins (a card never
// repeats across sections). Section order is the display order.
function buildSections(candidates, { near, weather, part, mode }) {
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
  const isOutdoor = c => ['water', 'adventures'].includes(c.category) ||
    /park|trail|garden|beach|nature|conservation|hike|island|waterfront|zoo|farm|lookout|falls|paddle|kayak/i.test(text(c));
  const isIndoor = c => /museum|gallery|aquarium|science|indoor|arcade|cinema|theatre|theater|library|escape room|bowling|climbing|market hall/i.test(text(c));
  const isGem = c => c.wow === true;
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

  if (near) {
    // The pool is already ranked against the daypart+mode prompt, so "right
    // now" is simply its top — filtered to indoor picks when it's raining.
    const rightNow = weather && weather.is_rainy ? pool.filter(isIndoor) : pool;
    take(rightNowLabel(part, weather), rightNow, 4);
    take('Within 15 minutes 📍',
      pool.filter(c => c.distance_km != null && c.distance_km <= 10)
        .slice().sort((a, b) => a.distance_km - b.distance_km), 4);
    take('On today 📅', pool.filter(hasDate), 3);
    take('Hidden gems ✨', pool.filter(isGem), 3);
  } else if (mode === 'adventure') {
    take('Top thrills ⚡', pool, 4);
    take('Get outside 🌊', pool.filter(isOutdoor), 3);
    take('On now 📅', pool.filter(hasDate), 3);
    take('Hidden gems ✨', pool.filter(isGem), 2);
    take('Refuel 🍴', pool.filter(isFood), 2);
  } else {
    take('Restorative picks 🌿', pool, 4);
    take('Outdoors & nature 🌳', pool.filter(isOutdoor), 3);
    take('Food & drink 🍴', pool.filter(isFood), 3);
    take('On now 📅', pool.filter(hasDate), 3);
    take('Hidden gems ✨', pool.filter(isGem), 3);
  }
  return ideas;
}

function rightNowLabel(part, weather) {
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
    rating: c.rating != null ? c.rating : null,
    price_from: c.price_from != null ? c.price_from : null,
    currency: c.currency || null,
    image_url: c.image_url || null,
    date: c.date || null,
    venue: c.venue || null,
    civic: c.civic === true || undefined,
    also_from: c.also_from || undefined,
    wow: c.wow === true || undefined,
    distance_km: c.distance_km != null ? c.distance_km : undefined
  });
}

module.exports = router;
