// routes/generate.js — DayHop V2
// Orchestrates: candidate gathering (services/candidates.js: geocode →
// weather → real venue/activity/event sources, deduped and relevance-
// ranked) → Grok selects & explains. Degrades gracefully: if NO grounding
// sources are available at all, falls back to ungrounded Grok generation
// so the app still works in pure-dev mode with just a Grok key.

const express = require('express');
const router = express.Router();

const grok = require('../services/grok');
const analytics = require('../services/analytics');
const { entitlementsFor } = require('../services/entitlements');
const {
  gatherCandidates, sanitizeCoords, shortAddress, fallbackIdea, DEFAULT_CITY
} = require('../services/candidates');

// Who is asking, for usage limits + analytics: authenticated user id, else
// the client's guest id, else the IP as a last resort.
function ownerKeyFor(req) {
  if (req.user && req.user.id) return req.user.id;
  const guest = req.body && req.body.owner_id;
  if (typeof guest === 'string' && guest.trim()) return guest.trim().slice(0, 80);
  return `ip-${req.ip}`;
}

router.post('/', async (req, res) => {
  // Frontend's GTA picker sends `city`; older clients may send `location`.
  // `event_keyword` (optional) narrows the event connectors, e.g. "world cup".
  // `mode` is the R&R/Adventure toggle; anything unrecognized falls back to R&R.
  const { prompt, filter, location, city, event_keyword } = req.body || {};
  const mode = grok.normalizeMode(req.body && req.body.mode);

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
  const ownerKey = ownerKeyFor(req);

  // Free-tier daily limit (entitlements resolve to unlimited for Pro and for
  // pre-Stripe preview mode). Any gate error fails open — the paywall must
  // never break the product.
  try {
    const ent = await entitlementsFor(req.user && req.user.id);
    if (ent.daily_generates != null) {
      const usedToday = await analytics.countToday('prompt_generated', ownerKey);
      if (usedToday >= ent.daily_generates) {
        return res.status(402).json({
          error: 'UPGRADE_REQUIRED',
          feature: 'generate',
          message: `You've used your ${ent.daily_generates} free day plans for today. Go Pro for unlimited planning.`,
          limit: ent.daily_generates
        });
      }
    }
  } catch (err) {
    console.warn('[generate] pro-gate check failed (allowing):', err.message);
  }

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
          mode,
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
        ideas = mergeWithCandidates(candidates.slice(0, 10).map(fallbackIdea), candidates);
        degraded = true;
      }
    } else {
      ideas = await grok.generateIdeas({ prompt, filter, mode, city: cityForGrok });
    }

    analytics.recordEvent({
      type: 'prompt_generated',
      ownerKey,
      meta: { grounded: usedGrounding, degraded, mode, city: cityForGrok, ideas: ideas.length }
    });

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


router.post('/plan', async (req, res) => {
  const { items, city } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'EMPTY_SHORTLIST',
      message: 'Add at least one idea to your shortlist before building a day plan.'
    });
  }

  // Multi-day trips (2-3 days) are a Pro feature; the tier's max_trip_days
  // is the gate. Unlike the daily limits this does NOT fail open on a gate
  // error — a Grok multi-day call costs real money, so unknown tier = free.
  const days = Math.min(Math.max(Number(req.body.days) || 1, 1), 3);
  if (days > 1) {
    const ent = await entitlementsFor(req.user && req.user.id).catch(() => null);
    if (!ent || days > ent.max_trip_days) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        feature: 'multi_day',
        message: 'Weekend and multi-day trips are a Pro feature. Go Pro to plan 2-3 day itineraries.'
      });
    }
  }

  const mode = grok.normalizeMode(req.body && req.body.mode);
  try {
    const plan = await grok.buildDayPlan({ items, city, days, mode });
    analytics.recordEvent({ type: 'plan_built', ownerKey: ownerKeyFor(req), meta: { stops: items.length, days, mode } });
    res.json(plan);
  } catch (err) {
    handleGrokError(err, res);
  }
});

// ---------- Smart re-planning ----------
// POST /api/generate/replan { guide, instruction, city }
// Takes the CURRENT itinerary (self-contained guide shape: stops carry their
// full idea payloads) plus a natural-language adjustment ("it's raining",
// "make it kid-friendly"), gathers fresh real-venue candidates scoped to the
// instruction as swap material, and asks Grok to revise. Free tier gets
// FREE_DAILY_REPLANS per day; Pro is unlimited.

// Only these idea fields survive into swap-in stops (mirrors guides.js).
const REPLAN_IDEA_FIELDS = [
  'id', 'title', 'why', 'category', 'location', 'venue', 'date',
  'good_for_ages', 'duration_minutes', 'cost_tier', 'price_from', 'currency',
  'rating', 'image_url', 'booking_url', 'maps_url', 'source', 'distance_km'
];

router.post('/replan', async (req, res) => {
  const { guide, instruction, city } = req.body || {};
  const ownerKey = ownerKeyFor(req);

  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({
      error: 'MISSING_INSTRUCTION',
      message: 'Tell DayHop what to change — "it\'s raining" is enough.'
    });
  }
  const stops = collectGuideStops(guide);
  if (!stops.length) {
    return res.status(400).json({
      error: 'MISSING_PLAN',
      message: 'Build a day plan first, then ask DayHop to tune it.'
    });
  }

  // Replan gate: free tier gets a daily taste, Pro is unlimited. Fails open
  // like the generate gate.
  try {
    const ent = await entitlementsFor(req.user && req.user.id);
    if (ent.daily_replans != null) {
      const usedToday = await analytics.countToday('plan_replanned', ownerKey);
      if (usedToday >= ent.daily_replans) {
        return res.status(402).json({
          error: 'UPGRADE_REQUIRED',
          feature: 'replan',
          message: `You've used today's free re-plan. Go Pro for unlimited smart re-planning.`,
          limit: ent.daily_replans
        });
      }
    }
  } catch (err) {
    console.warn('[replan] pro-gate check failed (allowing):', err.message);
  }

  const targetLocation = (city && String(city).trim()) || guide.city || DEFAULT_CITY;
  const trimmedInstruction = instruction.trim().slice(0, 300);

  try {
    // Fresh swap material scoped to the instruction (plus the plan's own
    // titles for context). Candidate gathering failing is fine — Grok can
    // still reorder/retime/remove with an empty pool.
    let candidates = [];
    let weather = null;
    try {
      const gathered = await gatherCandidates(
        trimmedInstruction, targetLocation, '', null, sanitizeCoords(req.body.coords)
      );
      candidates = gathered.candidates;
      weather = gathered.weather;
    } catch (err) {
      console.warn('[replan] candidate gathering failed (re-planning without swaps):', err.message);
    }

    const revised = await grok.replanPlan({
      current: slimGuideForReplan(guide),
      instruction: trimmedInstruction,
      city: targetLocation,
      mode: grok.normalizeMode(req.body.mode),
      weather,
      candidates: candidates.map(toGrokCandidate)
    });

    const merged = mergeReplan(revised, guide, candidates);
    if (!collectGuideStops(merged).length) {
      const err = new Error('Re-plan produced no usable stops');
      err.code = 'GROK_BAD_SHAPE';
      throw err;
    }

    analytics.recordEvent({
      type: 'plan_replanned',
      ownerKey,
      meta: { instruction: trimmedInstruction.slice(0, 80), city: targetLocation, stops: collectGuideStops(merged).length }
    });

    res.json({
      guide: merged,
      change_summary: Array.isArray(revised.change_summary) ? revised.change_summary.slice(0, 6).map(s => String(s).slice(0, 200)) : [],
      weather: weather || null
    });
  } catch (err) {
    handleGrokError(err, res);
  }
});

// All stops of a guide regardless of single-day (stops) or multi-day (days[].stops) shape.
function collectGuideStops(guide) {
  if (!guide || typeof guide !== 'object') return [];
  if (Array.isArray(guide.days)) return guide.days.flatMap(d => Array.isArray(d && d.stops) ? d.stops : []);
  return Array.isArray(guide.stops) ? guide.stops : [];
}

// What Grok needs to reason about the current plan — ids + human context,
// no URLs/images (token budget, and the model must not echo links anyway).
function slimGuideForReplan(guide) {
  const slimStop = (stop) => {
    const idea = (stop && stop.idea) || {};
    return {
      id: idea.id != null ? String(idea.id) : null,
      title: stop.title || idea.title || '',
      suggested_time: stop.suggested_time || '',
      note: stop.note || undefined,
      category: idea.category || null,
      location: idea.location || null,
      cost_tier: idea.cost_tier || null,
      duration_minutes: idea.duration_minutes || null,
      good_for_ages: idea.good_for_ages || null
    };
  };
  const out = {
    title: guide.title || '',
    city: guide.city || null,
    start_time: guide.start_time || '',
    notes: guide.notes || ''
  };
  if (Array.isArray(guide.days)) {
    out.days = guide.days.map((d, i) => ({
      day: i + 1,
      label: (d && d.label) || `Day ${i + 1}`,
      start_time: (d && d.start_time) || '',
      stops: (Array.isArray(d && d.stops) ? d.stops : []).map(slimStop)
    }));
  } else {
    out.stops = (guide.stops || []).map(slimStop);
  }
  return out;
}

// Rebuild a self-contained guide from Grok's revision: kept stops get their
// original idea payload back (by keep_id), swap-ins are built from the real
// candidate (by candidate_id). Stops referencing neither are hallucinations
// and get dropped.
function mergeReplan(revised, originalGuide, candidates) {
  const ideaById = new Map();
  for (const stop of collectGuideStops(originalGuide)) {
    const idea = stop && stop.idea;
    if (idea && idea.id != null) ideaById.set(String(idea.id), stop);
  }
  const candidateById = new Map(candidates.map(c => [String(c.id), c]));

  const rebuildStop = (stop) => {
    if (!stop || typeof stop !== 'object') return null;
    const keepId = stop.keep_id != null ? String(stop.keep_id) : null;
    const candId = stop.candidate_id != null ? String(stop.candidate_id) : null;
    let idea = null;
    let note = '';
    if (keepId && ideaById.has(keepId)) {
      const original = ideaById.get(keepId);
      idea = original.idea;
      note = original.note || '';
    } else if (candId && candidateById.has(candId)) {
      idea = ideaFromCandidate(candidateById.get(candId));
    } else {
      return null; // unverifiable stop — drop it
    }
    return {
      title: String(stop.title || idea.title || '').slice(0, 200),
      suggested_time: String(stop.suggested_time || '').slice(0, 60),
      transition_note: String(stop.transition_note || '').slice(0, 300),
      note,
      changed: stop.changed === true || undefined,
      idea
    };
  };

  const out = {
    title: String(revised.plan_title || originalGuide.title || 'Your day, mapped out').slice(0, 140),
    city: originalGuide.city || null,
    notes: String(revised.notes || '').slice(0, 1000)
  };
  if (Array.isArray(revised.days)) {
    out.days = revised.days.slice(0, 3).map((d, i) => ({
      label: String((d && d.label) || `Day ${i + 1}`).slice(0, 80),
      start_time: String((d && d.start_time) || '').slice(0, 40),
      notes: String((d && d.notes) || '').slice(0, 500),
      stops: (Array.isArray(d && d.stops) ? d.stops : []).map(rebuildStop).filter(Boolean)
    }));
  } else {
    out.start_time = String(revised.start_time || originalGuide.start_time || '').slice(0, 40);
    out.stops = (Array.isArray(revised.stops) ? revised.stops : []).map(rebuildStop).filter(Boolean);
  }
  return out;
}

// A gathered candidate rendered as a guide-stop idea (the swap-in path).
function ideaFromCandidate(c) {
  const idea = {};
  for (const key of REPLAN_IDEA_FIELDS) {
    if (c[key] != null && c[key] !== '') idea[key] = typeof c[key] === 'string' ? c[key].slice(0, 2000) : c[key];
  }
  if (!idea.why && c.description) idea.why = String(c.description).slice(0, 300);
  if (!idea.location) idea.location = c.venue || shortAddress(c.address || c.location) || '';
  return idea;
}

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
