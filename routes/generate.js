// routes/generate.js — DayHop V2
// Orchestrates: geocode → weather → real venue/activity candidates
// (Google Places + Viator + GetYourGuide) → Grok selects & explains.
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

const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Richmond Hill';

router.post('/', async (req, res) => {
  // Frontend's GTA picker sends `city`; older clients may send `location`.
  const { prompt, filter, location, city } = req.body || {};

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

  try {
    const { candidates, weather, usedGrounding } = await gatherCandidates(prompt, targetLocation);

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
      currency: original.currency || null
    });
  });
}

async function gatherCandidates(prompt, locationText) {
  let geo = null;
  let weather = null;
  const candidates = [];

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

  if (geo) {
    try {
      const places = await maps.searchPlaces({ query: prompt, lat: geo.lat, lng: geo.lng });
      candidates.push(...places.map(p => Object.assign({}, p, { source: 'google_places', id: p.place_id })));
    } catch (err) {
      console.warn('[generate] Google Places unavailable:', err.message);
    }
  }

  try {
    const destinationId = await viator.resolveDestinationId(toViatorDestination(locationText));
    const activities = await viator.searchActivities({ destinationId });
    candidates.push(...activities.map(a => Object.assign({}, a, { id: a.product_code })));
  } catch (err) {
    console.warn('[generate] Viator unavailable:', err.message);
  }

  if (geo) {
    try {
      const activities = await gyg.searchActivities({ lat: geo.lat, lng: geo.lng, query: prompt });
      candidates.push(...activities.map(a => Object.assign({}, a, { id: a.activity_id })));
    } catch (err) {
      console.warn('[generate] GetYourGuide unavailable:', err.message);
    }
  }

  return { candidates, weather, usedGrounding: candidates.length > 0 };
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
