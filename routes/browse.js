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
const { gatherCandidates, sanitizeCoords, fallbackIdea, DEFAULT_CITY } = require('../services/candidates');

// One entry per (city|coords-grid|daypart). 30 minutes keeps partner-API
// usage flat while staying fresh enough for weather/daypart shifts.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map();

// Section size ceilings; overlaps are deduped so the final feed lands
// around 8–14 cards — browsable, not overwhelming.
const FEED_CAP = 14;

router.post('/', async (req, res) => {
  const city = String((req.body && req.body.city) || '').trim().slice(0, 120) || DEFAULT_CITY;
  const coords = sanitizeCoords(req.body && req.body.coords);
  const part = daypart();
  const key = cacheKey(city, coords, part);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    recordBrowse(req, hit.payload, true);
    return res.json(hit.payload);
  }

  try {
    const { candidates, weather, resolvedCity } =
      await gatherCandidates(syntheticPrompt(part), city, '', null, coords);

    const ideas = buildSections(candidates, { near: Boolean(coords), weather, part }).slice(0, FEED_CAP);
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
    recordBrowse(req, payload, false);
    res.json(payload);
  } catch (err) {
    console.error('[browse] failed:', err.message);
    res.status(500).json({ error: 'BROWSE_FAILED', message: 'Could not load ideas right now.' });
  }
});

function recordBrowse(req, payload, cached) {
  const ownerKey = (req.user && req.user.id) ||
    (typeof (req.body && req.body.owner_id) === 'string' && req.body.owner_id.trim().slice(0, 80)) ||
    `ip-${req.ip}`;
  analytics.recordEvent({
    type: 'browse_feed',
    ownerKey,
    meta: { city: payload.city, near: payload.near, ideas: payload.ideas.length, cached }
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

// The daypart is baked into the synthetic prompt, so the existing relevance
// ranking naturally floats "right now" material to the top of the pool.
const DAYPART_PROMPTS = {
  morning: 'breakfast and brunch spots, coffee, farmers markets, parks and trails, top attractions, museums, family activities',
  afternoon: 'top attractions and things to do, lunch spots, parks and outdoor activities, museums and galleries, family activities, events',
  evening: 'dinner restaurants, patios, live music and shows, evening events, dessert spots, waterfront walks'
};

function syntheticPrompt(part) {
  return DAYPART_PROMPTS[part] || DAYPART_PROMPTS.afternoon;
}

// ~2 km grid so neighbours share a cache entry without leaking anything
// more precise than the client already sent (~110 m rounding).
function cacheKey(city, coords, part) {
  const grid = coords
    ? `${Math.round(coords.lat * 50) / 50},${Math.round(coords.lng * 50) / 50}`
    : '';
  return `${city.toLowerCase()}|${grid}|${part}`;
}

// Assign ranked candidates to named sections, first match wins (a card never
// repeats across sections). Section order is the display order.
function buildSections(candidates, { near, weather, part }) {
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

  if (near) {
    // The pool is already ranked against the daypart prompt, so "right now"
    // is simply its top — filtered to indoor picks when it's raining.
    const rightNow = weather && weather.is_rainy ? candidates.filter(isIndoor) : candidates;
    take(rightNowLabel(part, weather), rightNow, 4);
    take('Within 15 minutes 📍',
      candidates.filter(c => c.distance_km != null && c.distance_km <= 10)
        .slice().sort((a, b) => a.distance_km - b.distance_km), 4);
    take('On today 📅', candidates.filter(hasDate), 3);
    take('Hidden gems ✨', candidates.filter(isGem), 3);
  } else {
    take('Top picks ⭐', candidates, 4);
    take('Food & drink 🍴', candidates.filter(isFood), 3);
    take('Outdoors & nature 🌳', candidates.filter(isOutdoor), 3);
    take('On now 📅', candidates.filter(hasDate), 3);
    take('Hidden gems ✨', candidates.filter(isGem), 3);
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
