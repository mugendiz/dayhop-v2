// routes/generate.js — DayHop V2
// Orchestrates: geocode → weather → real venue/activity/event candidates
// (Google Places + Viator + GetYourGuide + Ticketmaster + Eventbrite +
// Toronto/York open data + DayHop-curated events) → Grok selects & explains.
// Degrades gracefully: any unconfigured/failed API is skipped with a
// warning, never crashes the request. If NO grounding sources are
// available at all, falls back to ungrounded Grok generation so the
// app still works in pure-dev mode with just a Grok key.

const express = require('express');
const router = express.Router();

const grok = require('../services/grok');
const maps = require('../services/googleMaps');
const weatherSvc = require('../services/weather');
const viator = require('../services/viator');
const gyg = require('../services/getYourGuide');
const ticketmaster = require('../services/ticketmaster');
const eventbrite = require('../services/eventbrite');
const torontoOpenData = require('../services/torontoOpenData');
const yorkOpenData = require('../services/yorkOpenData');
const curatedEvents = require('../data/curatedEvents');
const curatedCatalog = require('../data/curatedCatalog');
const { matchThemes } = require('../data/themes');
const relevance = require('../services/relevance');

const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Richmond Hill';

router.post('/', async (req, res) => {
  // Frontend's GTA picker sends `city`; older clients may send `location`.
  // `event_keyword` (optional) narrows the event connectors, e.g. "world cup".
  const { prompt, filter, location, city, event_keyword } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({
      error: 'MISSING_PROMPT',
      message: 'Tell us what kind of day you want — a sentence is enough.'
    });
  }
  if (prompt.length > 600) {
    return res.status(400).json({
      error: 'PROMPT_TOO_LONG',
      message: 'Keep your request under 600 characters.'
    });
  }

  const targetLocation = (location && location.trim()) || (city && city.trim()) || DEFAULT_CITY;
  const eventKeyword = typeof event_keyword === 'string' ? event_keyword.trim().slice(0, 80) : '';
  const userCoords = sanitizeCoords(req.body && req.body.coords);

  try {
    const { candidates, weather, usedGrounding, resolvedCity } =
      await gatherCandidates(prompt, targetLocation, eventKeyword, filter, userCoords);
    const cityForGrok = resolvedCity || targetLocation;

    let ideas;
    let degraded = false;
    if (usedGrounding) {
      try {
        const selected = await grok.generateGroundedIdeas({
          prompt,
          filter,
          city: cityForGrok,
          candidates: candidates.map(toGrokCandidate),
          weather
        });
        ideas = mergeWithCandidates(selected, candidates);
      } catch (err) {
        // We already hold a relevance-ranked pool of real places — serve the
        // top of it directly rather than failing the whole feed because the
        // AI selection step timed out or misbehaved.
        if (err.code === 'GROK_NOT_CONFIGURED' || err.code === 'INVALID_INPUT') throw err;
        console.warn('[generate] Grok selection failed, serving ranked candidates directly:', err.message);
        ideas = mergeWithCandidates(candidates.slice(0, 16).map(fallbackIdea), candidates);
        degraded = true;
      }
    } else {
      ideas = await grok.generateIdeas({ prompt, filter, city: cityForGrok });
    }

    res.json({
      ideas,
      grounded: usedGrounding,
      degraded: degraded || undefined,
      weather: weather || null,
      near: userCoords ? resolvedCity || null : null,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    handleGrokError(err, res);
  }
});

/**
 * Grok returns ideas referencing candidate ids — re-attach the real
 * booking_url / maps_url / rating data from the original candidate so
 * the frontend can link out to an actual bookable page or map listing.
 */
function mergeWithCandidates(selectedIdeas, candidates) {
  const byId = new Map(candidates.map(c => [String(c.id), c]));
  return selectedIdeas
    // A grounded idea whose id isn't in the pool is a hallucination —
    // drop it rather than showing an unverifiable card with no links.
    .filter(idea => byId.has(String(idea.id)))
    .map(idea => {
      const original = byId.get(String(idea.id));
      return Object.assign({}, idea, {
        booking_url: original.booking_url || null,
        maps_url: original.maps_url || null,
        rating: original.rating != null ? original.rating : null,
        price_from: original.price_from != null ? original.price_from : null,
        currency: original.currency || null,
        image_url: original.image_url || null,
        date: original.date || null,
        venue: original.venue || null,
        civic: original.civic === true || undefined,
        also_from: original.also_from || undefined,
        wow: original.wow === true || undefined,
        distance_km: original.distance_km != null ? original.distance_km : undefined
      });
    });
}

// Slim projection sent to Grok: enough signal to select and explain, but
// without URLs/coordinates/opening hours — keeps 60 candidates around the
// same token budget the old 40 full-fat ones used.
function toGrokCandidate(c) {
  return {
    id: c.id,
    source: c.source,
    title: c.title,
    category: c.category || null,
    description: c.description ? String(c.description).slice(0, 160) : null,
    venue: c.venue || null,
    area: shortAddress(c.address || c.location),
    date: c.date || null,
    cost_tier: c.cost_tier || null,
    price_from: c.price_from != null ? c.price_from : null,
    rating: c.rating != null ? c.rating : null,
    good_for_ages: c.good_for_ages || null,
    wow: c.wow === true || undefined,
    km_away: c.distance_km != null ? c.distance_km : undefined
  };
}

// A candidate rendered as an idea card without Grok's curation — used when
// the AI selection step fails but the grounded pool is healthy.
function fallbackIdea(c) {
  return {
    id: c.id,
    source: c.source,
    title: c.title,
    category: c.category || 'general',
    why: c.description || '',
    location: c.venue || shortAddress(c.address || c.location) || '',
    good_for_ages: c.good_for_ages || null,
    cost_tier: c.cost_tier || null
  };
}

// "290 Bremner Blvd, Toronto, ON M5V 3L9, Canada" → "Toronto"
function shortAddress(address) {
  if (!address) return null;
  const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 2 ? parts[parts.length - 3] : parts.join(', ');
}

// Per-source caps keep any one source from flooding the pool. The pool is
// then relevance-scored against the prompt and trimmed to 60 (grok.js cap),
// so these are generous ceilings, not the final mix.
const SOURCE_CAPS = {
  google_places: 24,
  viator: 10,
  getyourguide: 10,
  ticketmaster: 12,
  eventbrite: 8,
  toronto_open_data: 12,
  york_open_data: 6,
  curated: 4,
  curated_catalog: 12
};

const CANDIDATE_POOL_CAP = 60;

async function gatherCandidates(prompt, locationText, eventKeyword, filter, userCoords) {
  let geo = null;
  let weather = null;
  // With shared coordinates the locality comes from reverse geocoding and
  // drives the GTA gate, Viator destination, and Grok's location context.
  let resolvedCity = null;

  if (userCoords) {
    geo = { lat: userCoords.lat, lng: userCoords.lng };
    try {
      resolvedCity = (await maps.reverseGeocode(userCoords)).city;
    } catch (err) {
      console.warn('[generate] Reverse geocode unavailable:', err.message);
    }
  } else {
    // Normalize GTA-picker values into something geocodable: "Across the GTA"
    // grounds on Toronto; strip "(Downtown)"-style hints; bias bare GTA town
    // names to Ontario so we don't geocode a same-named city elsewhere.
    const geoText = toGeocodable(locationText);
    try {
      geo = await maps.geocode(geoText);
    } catch (err) {
      console.warn('[generate] Geocoding unavailable:', err.message);
    }
  }

  const localityText = resolvedCity || locationText;

  if (geo) {
    try {
      weather = await weatherSvc.getConditions({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      console.warn('[generate] Weather unavailable:', err.message);
    }
  }

  // The GTA-only sources (open data, curated, org-scoped Eventbrite) would be
  // wrong grounding for a request about some other city — skip them there.
  // A typed postal code ("L4C 1J8") won't name a town, so also check the
  // geocoder's formatted address.
  const isGta = GTA_TOWNS.test(String(localityText || '')) ||
    Boolean(geo && GTA_TOWNS.test(String(geo.formatted_address || '')));

  // Theme expansion: "swimming" fans out to pools, beaches, splash pads,
  // paddling rentals, waterparks — the neighbourhood of the request, not
  // just its literal words.
  const themes = matchThemes(prompt);
  const themeQueries = themes.flatMap(t => t.placesQueries).slice(0, 4);

  // One parallel batch: each source is independently optional — a failed or
  // unconfigured source logs one warning and contributes nothing.
  const sources = [
    {
      name: 'google_places',
      run: () => geo ? searchPlacesWithThemes(prompt, themeQueries, geo, Boolean(userCoords)) : []
    },
    {
      name: 'viator',
      run: () => viator.resolveDestinationId(toViatorDestination(localityText))
        .then(destinationId => viator.searchActivities({ destinationId }))
        .then(activities => activities.map(a => Object.assign({}, a, { id: a.product_code })))
    },
    {
      name: 'getyourguide',
      run: () => geo
        ? gyg.searchActivities({ lat: geo.lat, lng: geo.lng, query: prompt })
            .then(activities => activities.map(a => Object.assign({}, a, { id: a.activity_id })))
        : []
    },
    {
      name: 'ticketmaster',
      run: () => geo
        ? ticketmaster.searchEvents({ lat: geo.lat, lng: geo.lng, keyword: eventKeyword || undefined, limit: SOURCE_CAPS.ticketmaster })
        : []
    },
    {
      name: 'eventbrite',
      run: () => isGta ? eventbrite.searchEvents({ limit: SOURCE_CAPS.eventbrite }) : []
    },
    {
      name: 'toronto_open_data',
      run: () => isGta ? torontoOpenData.getUpcomingEvents({ limit: SOURCE_CAPS.toronto_open_data, keyword: eventKeyword || undefined }) : []
    },
    {
      name: 'york_open_data',
      run: () => isGta ? yorkOpenData.getCivicPlaces({ limit: SOURCE_CAPS.york_open_data, keyword: eventKeyword || undefined }) : []
    },
    {
      name: 'curated',
      run: () => isGta ? upcomingCuratedEvents(SOURCE_CAPS.curated) : []
    },
    {
      name: 'curated_catalog',
      run: () => isGta ? catalogCandidates(prompt, themes, SOURCE_CAPS.curated_catalog) : []
    }
  ];

  const settled = await Promise.allSettled(sources.map(s => Promise.resolve().then(s.run)));
  const bySource = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const cap = SOURCE_CAPS[sources[i].name] || 10;
      const items = (result.value || []).slice(0, cap);
      if (items.length) bySource.push(items);
    } else {
      console.warn(`[generate] ${sources[i].name} unavailable:`, result.reason && result.reason.message);
    }
  });

  // Dedup first (interleave order only decides which duplicate wins), then
  // rank the whole pool against the prompt so the cap trims the least
  // relevant candidates instead of whichever source came last.
  const pool = dedupCandidates(interleave(bySource));

  // With shared coordinates, distance becomes a first-class signal: shown on
  // cards, boosted by the scorer, and visible to Grok as km_away.
  if (userCoords) {
    for (const c of pool) {
      if (c.lat != null && c.lng != null) {
        c.distance_km = relevance.haversineKm(userCoords, { lat: c.lat, lng: c.lng });
      }
    }
  }

  const candidates = relevance.selectTop(
    relevance.scoreCandidates(pool, { prompt, themes, filter }),
    CANDIDATE_POOL_CAP
  );
  return { candidates, weather, usedGrounding: candidates.length > 0, resolvedCity };
}

// Coordinates from the browser (already rounded client-side). Anything
// malformed is silently ignored — the request proceeds city-based.
function sanitizeCoords(coords) {
  if (!coords || typeof coords !== 'object') return null;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Raw-prompt Places search plus up to 4 theme-expanded searches, all in
// parallel; results from theme queries are tagged so the relevance scorer
// knows they were already intent-matched. When the user shared their real
// coordinates, bias tight (5 km — "around the corner") and add one wide
// 15 km raw-prompt search so standout options further out still appear.
async function searchPlacesWithThemes(prompt, themeQueries, geo, hyperLocal = false) {
  const radiusMeters = hyperLocal ? 5000 : 15000;
  const searches = [
    maps.searchPlaces({ query: prompt, lat: geo.lat, lng: geo.lng, radiusMeters, maxResults: 8 })
      .then(places => places.map(p => Object.assign({}, p, { source: 'google_places', id: p.place_id })))
  ];
  if (hyperLocal) {
    searches.push(
      maps.searchPlaces({ query: prompt, lat: geo.lat, lng: geo.lng, radiusMeters: 15000, maxResults: 6 })
        .then(places => places.map(p => Object.assign({}, p, { source: 'google_places', id: p.place_id })))
        .catch(() => [])
    );
  }
  for (const query of themeQueries) {
    searches.push(
      maps.searchPlaces({ query, lat: geo.lat, lng: geo.lng, radiusMeters, maxResults: 6 })
        .then(places => places.map(p => Object.assign({}, p, { source: 'google_places', id: p.place_id, theme_hit: true })))
        .catch(err => {
          console.warn(`[generate] places theme search "${query}" failed:`, err.message);
          return [];
        })
    );
  }
  const results = await Promise.all(searches);
  const seen = new Set();
  const out = [];
  for (const place of results.flat()) {
    if (seen.has(place.place_id)) continue;
    seen.add(place.place_id);
    out.push(place);
  }
  return out;
}

// Evergreen curated catalog entries, season-filtered and pre-ranked against
// the prompt so only the most fitting slice of the catalog joins the pool.
function catalogCandidates(prompt, themes, limit) {
  const month = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'numeric' }).format(new Date()));
  const inSeason = month >= 5 && month <= 9 ? 'summer' : 'winter';
  const eligible = curatedCatalog.filter(e => !e.seasonal || e.seasonal === inSeason);

  const normalized = eligible.map(e => ({
    source: 'curated_catalog',
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    tags: e.tags,
    date: null,
    venue: e.venue,
    address: e.location,
    location: e.location,
    good_for_ages: e.good_for_ages,
    cost_tier: e.cost_tier,
    price_from: null,
    currency: null,
    image_url: null,
    booking_url: null,
    maps_url: e.maps_url,
    rating: null,
    wow: e.wow === true
  }));

  return relevance.selectTop(
    relevance.scoreCandidates(normalized, { prompt, themes }),
    limit
  );
}

// Round-robin across the source lists so grok.js's 40-candidate cap trims
// every source proportionally instead of chopping off whichever came last.
function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

// The same real-world event often arrives from two sources (e.g. Ticketmaster
// and Eventbrite). Keep the first candidate seen for a title+venue (or
// title+date) key, fill its null fields from later duplicates, and record the
// extra source names so the frontend can badge "+1 source".
function dedupCandidates(candidates) {
  const FILLABLE = ['description', 'category', 'date', 'datetime', 'venue', 'address', 'lat', 'lng',
    'price_from', 'currency', 'cost_tier', 'image_url', 'booking_url', 'maps_url', 'rating'];
  const byKey = new Map();
  for (const c of candidates) {
    const key = dedupKey(c);
    const kept = byKey.get(key);
    if (!kept) { byKey.set(key, c); continue; }
    for (const f of FILLABLE) {
      if ((kept[f] == null || kept[f] === '') && c[f] != null && c[f] !== '') kept[f] = c[f];
    }
    if (c.source && c.source !== kept.source) {
      kept.also_from = kept.also_from || [];
      if (!kept.also_from.includes(c.source)) kept.also_from.push(c.source);
    }
  }
  return [...byKey.values()];
}

function dedupKey(c) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const title = norm(c.title);
  const venue = norm(c.venue);
  return venue ? `${title}|v:${venue}` : `${title}|d:${c.date || ''}`;
}

// Curated seed events, upcoming only (dates are Toronto-local YYYY-MM-DD).
function upcomingCuratedEvents(limit) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  return curatedEvents
    .filter(e => !e.date || e.date >= today)
    .slice(0, limit)
    .map(e => ({
      source: 'curated',
      id: e.id,
      title: e.title,
      description: e.description || '',
      category: e.category || null,
      date: e.date || null,
      venue: null,
      address: e.location || null,
      lat: null,
      lng: null,
      price_from: null,
      currency: null,
      cost_tier: e.cost_tier || null,
      image_url: null,
      booking_url: null,
      maps_url: null,
      rating: null
    }));
}

// Viator's catalog is metro-level: every GTA town maps to the "Toronto"
// destination. Anything outside the known GTA set passes through cleaned.
const GTA_TOWNS = /across the gta|greater toronto|toronto|north york|scarborough|etobicoke|east york|richmond hill|markham|vaughan|newmarket|aurora|king city|stouffville|mississauga|brampton|caledon|oakville|burlington|milton|halton hills|pickering|ajax|whitby|oshawa|thornhill|woodbridge/i;
function toViatorDestination(text) {
  const t = String(text || '').trim();
  if (!t || GTA_TOWNS.test(t)) return 'Toronto';
  return t.replace(/\s*\([^)]*\)\s*/g, ' ').split(',')[0].trim();
}

// Turn a GTA-picker label, free-typed city, or postal/zip code into a
// geocodable place string.
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;

function toGeocodable(text) {
  const t = String(text || '').trim();
  if (!t) return DEFAULT_CITY;
  if (/across the gta|greater toronto/i.test(t)) return 'Toronto, Ontario';
  if (CA_POSTAL_RE.test(t)) return `${t.toUpperCase()}, Canada`;
  if (US_ZIP_RE.test(t)) return `${t}, USA`;
  const cleaned = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // drop "(Downtown)" etc.
  if (/,/.test(cleaned)) return cleaned;
  // Only bias bare names to Ontario when they're known GTA towns — a free-
  // typed "Lisbon" should geocode to Portugal, not an Ontario hamlet.
  return GTA_TOWNS.test(cleaned) ? `${cleaned}, Ontario` : cleaned;
}

router.post('/plan', async (req, res) => {
  const { items, city } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'EMPTY_SHORTLIST',
      message: 'Add at least one idea to your shortlist before building a day plan.'
    });
  }

  try {
    const plan = await grok.buildDayPlan({ items, city });
    res.json(plan);
  } catch (err) {
    handleGrokError(err, res);
  }
});

function handleGrokError(err, res) {
  if (err.code === 'GROK_NOT_CONFIGURED') {
    console.error('[generate] Grok API key missing');
    return res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: 'AI planning is temporarily unavailable. Please try again shortly.'
    });
  }
  if (err.code === 'INVALID_INPUT') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: err.message });
  }
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
    console.error('[generate] Grok timed out:', err.message);
    return res.status(504).json({
      error: 'AI_TIMEOUT',
      message: 'That took longer than usual — please try again.'
    });
  }
  if (err.code === 'GROK_BAD_SHAPE' || err.code === 'NO_CANDIDATES') {
    console.error('[generate] Unexpected Grok response/shape:', err.message);
    return res.status(502).json({
      error: 'AI_BAD_RESPONSE',
      message: 'We had trouble putting together ideas for that. Try rephrasing your request.'
    });
  }
  console.error('[generate] Unexpected error:', err.message);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong on our end. Please try again.'
  });
}

module.exports = router;
