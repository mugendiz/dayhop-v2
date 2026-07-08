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

  try {
    const { candidates, weather, usedGrounding } = await gatherCandidates(prompt, targetLocation, eventKeyword);

    let ideas;
    if (usedGrounding) {
      const selected = await grok.generateGroundedIdeas({ prompt, city: targetLocation, candidates, weather });
      ideas = mergeWithCandidates(selected, candidates);
    } else {
      ideas = await grok.generateIdeas({ prompt, filter, city: targetLocation });
    }

    res.json({
      ideas,
      grounded: usedGrounding,
      weather: weather || null,
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
  return selectedIdeas.map(idea => {
    const original = byId.get(String(idea.id));
    if (!original) return idea;
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
      also_from: original.also_from || undefined
    });
  });
}

// Per-source caps keep any one source from flooding the pool that Grok sees
// (grok.js hard-caps at 40 candidates total).
const SOURCE_CAPS = {
  google_places: 16,
  viator: 10,
  getyourguide: 10,
  ticketmaster: 10,
  eventbrite: 8,
  toronto_open_data: 10,
  york_open_data: 6,
  curated: 6
};

async function gatherCandidates(prompt, locationText, eventKeyword) {
  let geo = null;
  let weather = null;

  // Normalize GTA-picker values into something geocodable: "Across the GTA"
  // grounds on Toronto; strip "(Downtown)"-style hints; bias bare town names
  // to Ontario so we don't accidentally geocode a same-named city elsewhere.
  const geoText = toGeocodable(locationText);

  try {
    geo = await maps.geocode(geoText);
  } catch (err) {
    console.warn('[generate] Geocoding unavailable:', err.message);
  }

  if (geo) {
    try {
      weather = await weatherSvc.getConditions({ lat: geo.lat, lng: geo.lng });
    } catch (err) {
      console.warn('[generate] Weather unavailable:', err.message);
    }
  }

  // The GTA-only sources (open data, curated, org-scoped Eventbrite) would be
  // wrong grounding for a request about some other city — skip them there.
  const isGta = GTA_TOWNS.test(String(locationText || ''));

  // One parallel batch: each source is independently optional — a failed or
  // unconfigured source logs one warning and contributes nothing.
  const sources = [
    {
      name: 'google_places',
      run: () => geo
        ? maps.searchPlaces({ query: prompt, lat: geo.lat, lng: geo.lng })
            .then(places => places.map(p => Object.assign({}, p, { source: 'google_places', id: p.place_id })))
        : []
    },
    {
      name: 'viator',
      run: () => viator.resolveDestinationId(toViatorDestination(locationText))
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

  const candidates = dedupCandidates(interleave(bySource));
  return { candidates, weather, usedGrounding: candidates.length > 0 };
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

// Turn a GTA-picker label into a geocodable place string.
function toGeocodable(text) {
  const t = String(text || '').trim();
  if (!t) return DEFAULT_CITY;
  if (/across the gta|greater toronto/i.test(t)) return 'Toronto, Ontario';
  const cleaned = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // drop "(Downtown)" etc.
  return /,/.test(cleaned) ? cleaned : `${cleaned}, Ontario`;
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
