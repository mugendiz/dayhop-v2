// services/candidates.js — DayHop V2
// The grounding engine: geocode → weather → real venue/activity/event
// candidates (Google Places + Viator + GetYourGuide + Ticketmaster +
// Eventbrite + Toronto/York open data + DayHop-curated events/catalog),
// deduped and relevance-ranked against the prompt. Extracted from
// routes/generate.js so both prompt generation and the instant browse
// feed share one pipeline. Degrades gracefully: any unconfigured/failed
// API is skipped with a warning, never crashes the request.

const maps = require('./googleMaps');
const weatherSvc = require('./weather');
const viator = require('./viator');
const gyg = require('./getYourGuide');
const ticketmaster = require('./ticketmaster');
const eventbrite = require('./eventbrite');
const torontoOpenData = require('./torontoOpenData');
const yorkOpenData = require('./yorkOpenData');
const curatedEvents = require('../data/curatedEvents');
const curatedCatalog = require('../data/curatedCatalog');
const { matchThemes } = require('../data/themes');
const relevance = require('./relevance');

const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Richmond Hill';

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

// ---------- Quality gate: only "10/10" candidates survive ----------
// Applied to the ranked pool in every mode, so the browse feed, prompt
// results, and re-plan swap-ins all draw from excellent material only.
// A candidate passes on the strongest evidence available for its kind:
//  - Rated venues/activities: rating >= 4.4 with a real review sample.
//  - Hand-curated entries: 10/10 by definition — a human picked them.
//  - Unrated events/civic listings: must be a complete, actionable listing
//    (description plus a venue, booking link, map link, or photo).
const QUALITY_MIN_RATING = 4.4;
const QUALITY_MIN_REVIEWS = 25;
// Strictness must never starve the feed in a sparse area: below this many
// survivors, top back up with the best-scored of the rest.
const QUALITY_FLOOR = 12;

function isTopQuality(c) {
  if (c.rating != null) {
    if (c.rating < QUALITY_MIN_RATING) return false;
    if ((c.rating_count ?? QUALITY_MIN_REVIEWS) < QUALITY_MIN_REVIEWS) return false;
    return true;
  }
  if (c.source === 'curated' || c.source === 'curated_catalog') return true;
  if (c.wow === true) return true;
  return Boolean(c.description && (c.venue || c.booking_url || c.maps_url || c.image_url));
}

// Operates on scoreCandidates output so the floor top-up picks the most
// RELEVANT of the rejects, not arbitrary ones.
function qualityGate(scored) {
  const strict = scored.filter(e => isTopQuality(e.candidate));
  if (strict.length >= QUALITY_FLOOR) return strict;
  const rest = scored
    .filter(e => !isTopQuality(e.candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, QUALITY_FLOOR - strict.length);
  return [...strict, ...rest];
}

async function gatherCandidates(prompt, locationText, eventKeyword, filter, userCoords, mode) {
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
      console.warn('[candidates] Reverse geocode unavailable:', err.message);
    }
  } else {
    // Normalize GTA-picker values into something geocodable: "Across the GTA"
    // grounds on Toronto; strip "(Downtown)"-style hints; bias bare GTA town
    // names to Ontario so we don't geocode a same-named city elsewhere.
    const geoText = toGeocodable(locationText);
    try {
      geo = await maps.geocode(geoText);
    } catch (err) {
      console.warn('[candidates] Geocoding unavailable:', err.message);
    }
  }

  const localityText = resolvedCity || locationText;

  if (geo) {
    try {
      weather = await weatherSvc.getConditions({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      console.warn('[candidates] Weather unavailable:', err.message);
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
      console.warn(`[candidates] ${sources[i].name} unavailable:`, result.reason && result.reason.message);
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

  // Quality gate BEFORE the cap, so the pool fills with excellent
  // candidates instead of capping first and filtering what's left.
  const candidates = relevance.selectTop(
    qualityGate(relevance.scoreCandidates(pool, { prompt, themes, filter, mode })),
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
          console.warn(`[candidates] places theme search "${query}" failed:`, err.message);
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

// "290 Bremner Blvd, Toronto, ON M5V 3L9, Canada" → "Toronto"
function shortAddress(address) {
  if (!address) return null;
  const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 2 ? parts[parts.length - 3] : parts.join(', ');
}

// A candidate rendered as an idea card without Grok's curation — used when
// the AI selection step fails but the grounded pool is healthy, and by the
// instant browse feed which never involves Grok.
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

module.exports = {
  gatherCandidates,
  sanitizeCoords,
  shortAddress,
  fallbackIdea,
  DEFAULT_CITY,
  CANDIDATE_POOL_CAP
};
