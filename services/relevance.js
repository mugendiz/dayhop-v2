// services/relevance.js — DayHop V2
// Ranks the merged candidate pool against the user's prompt before it is
// capped and sent to Grok. Previously candidates were round-robin
// interleaved, so a highly relevant item from a late source could be
// trimmed while an unrelated event survived. Simple additive keyword/tag
// scoring — no embeddings, no network calls.

const { isAroundSpotlight } = require('./spotlight');

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my',
  'our', 'your', 'me', 'us', 'we', 'i', 'is', 'are', 'be', 'this', 'that',
  'some', 'any', 'then', 'after', 'before', 'near', 'nearby', 'around',
  'something', 'somewhere', 'anything', 'want', 'like', 'need', 'looking',
  'day', 'hours', 'hour', 'afternoon', 'morning', 'evening', 'today',
  'tomorrow', 'weekend', 'old', 'year', 'years', 'please', 'fun', 'go',
  'do', 'get', 'have', 'it', 'out', 'up', 'so', 'or', 'but', 'not', 'no'
]);

// Tokenize a prompt: lowercase, strip punctuation, drop stopwords, and add
// naive singular forms so "beaches" also matches "beach".
function tokenize(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  const tokens = new Set(raw);
  for (const w of raw) {
    if (w.endsWith('ies')) tokens.add(w.slice(0, -3) + 'y');
    else if (w.endsWith('es')) tokens.add(w.slice(0, -2));
    if (w.endsWith('s')) tokens.add(w.slice(0, -1));
    if (w.endsWith('ing') && w.length > 5) tokens.add(w.slice(0, -3)); // swimming → swimm... also add -ing stem
    if (w.endsWith('ming') && w.length > 5) tokens.add(w.slice(0, -4)); // swimming → swim
  }
  return tokens;
}

function textHits(tokens, text) {
  if (!text) return 0;
  const t = String(text).toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (t.includes(token)) hits++;
  }
  return hits;
}

// ---------- Mode affinity ----------
// R&R and Adventure are two different products sharing one pool. The mode
// nudges which half of the pool rises: calm categories for R&R, thrill
// categories for Adventure. A nudge, not a wall — a standout item from the
// "wrong" half can still earn a slot on merit.
const MODE_CATEGORY_BOOST = {
  rr: { water: 1.5, culture: 1.5, patios: 1, food: 1, general: 0.5 },
  adventure: { adventures: 2.5, water: 1, cruises: 1, kids: 0.5 }
};
const RR_CALM_WORDS = /\b(garden|trail|park|lookout|scenic|beach|conservatory|arboretum|greenhouse|spa|quiet|calm|walk|stroll|nature)\b/i;
const ADVENTURE_WORDS = /\b(zipline|zip-line|climb|kayak|paddle|rafting|karting|go-kart|trampoline|skydiv|paraglid|bike|bungee|axe|archery|treetop|adrenaline|racing)\b/i;

// ---------- Advisory pressure ----------
// When an active advisory says "avoid outdoor" or "avoid strenuous"
// (services/advisories.js — smoke, extreme heat/cold, high wind), candidates
// that clearly fit that profile sink and indoor refuges rise. A demotion,
// not a wall: a standout outdoor pick can still surface, and Grok gets the
// advisory context to make the final judgment call.
const OUTDOOR_WORDS = /\b(park|trail|beach|garden|patio|splash|zoo|hik(e|ing)|outdoor|playground|conservation|falls|island|pier|boardwalk|farm|orchard|lookout|campground|picnic|marina|paddle|kayak|canoe|bike|zipline|treetop|rooftop)\b/i;
const INDOOR_REFUGE_WORDS = /\b(museum|gallery|aquarium|indoor|arcade|science|library|market|conservatory|cinema|theatre|theater|bowling|mall|pottery|studio|escape room)\b/i;

function advisoryAdjustment(candidate, pressure) {
  if (!pressure || (!pressure.avoid_outdoor && !pressure.avoid_strenuous)) return 0;
  const text = `${candidate.title || ''} ${candidate.description || ''} ${candidate.category || ''}`;
  let delta = 0;
  // Weights must beat the mode/theme boosts (+2..+3.5) at warning level —
  // in a nature-first app the pool is mostly outdoor, so a timid demotion
  // changes nothing and the feed contradicts its own smoke banner.
  if (pressure.avoid_outdoor && OUTDOOR_WORDS.test(text)) delta -= 2.5 * pressure.avoid_outdoor;
  if (pressure.avoid_strenuous && ADVENTURE_WORDS.test(text)) delta -= 2 * pressure.avoid_strenuous;
  if (pressure.avoid_outdoor >= 2 && INDOOR_REFUGE_WORDS.test(text)) delta += 3;
  return delta;
}

// ---------- Prompt intent ----------
// Cheap, deterministic reads of the constraints people actually type.
function readIntent(prompt) {
  const p = String(prompt || '').toLowerCase();
  return {
    budget: /\b(free|cheap|budget|no money|broke|inexpensive|affordable)\b/.test(p),
    kids: /\b(kid|kids|toddler|child|children|family|baby|stroller|year[- ]old)\b/.test(p),
    indoor: /\b(rain|raining|rainy|indoor|indoors|inside|snow|cold day)\b/.test(p),
    romantic: /\b(date|romantic|anniversary|partner|couple)\b/.test(p)
  };
}

/**
 * Score candidates against the prompt, matched themes (data/themes.js
 * shapes), the active category filter, and the R&R/Adventure mode.
 * Returns [{ candidate, score }].
 */
function scoreCandidates(candidates, { prompt, themes = [], filter, mode, advisoryPressure, spotlight } = {}) {
  const tokens = tokenize(prompt);
  const intent = readIntent(prompt);
  const modeBoost = MODE_CATEGORY_BOOST[mode] || null;
  const modeWords = mode === 'adventure' ? ADVENTURE_WORDS : (mode === 'rr' ? RR_CALM_WORDS : null);
  const themeTags = new Set();
  const themeCategories = new Set();
  for (const theme of themes) {
    (theme.tags || []).forEach(t => themeTags.add(t.toLowerCase()));
    (theme.categories || []).forEach(c => themeCategories.add(c));
  }

  const now = Date.now();
  const soon = now + 7 * 24 * 3600 * 1000;

  return candidates.map(candidate => {
    let score = 0;

    // Freshness: a newly-opened attraction gets a lift so it survives the
    // pool cap and shows up while it's the thing everyone's talking about.
    // The flag itself decays (candidates.js), so the boost self-expires.
    // Real engagement (last-30d shortlist adds + clicks, attached upstream)
    // grows the lift up to +3 — loved openings rise, ignored ones keep
    // only the base courtesy. Never a penalty: absence of clicks usually
    // just means absence of impressions.
    if (candidate.newly_opened) {
      score += 4 + Math.min(3, Math.round(Math.log2(1 + (candidate.engagement_30d || 0))));
    }

    // Direct prompt-token overlap: title matches count double.
    score += 2 * textHits(tokens, candidate.title);
    score += textHits(tokens, candidate.description);
    score += textHits(tokens, candidate.venue);
    score += textHits(tokens, candidate.category);

    // Theme vocabulary: candidate tags/category vs matched theme tags.
    const candTags = (candidate.tags || []).map(t => String(t).toLowerCase());
    if (candTags.some(t => themeTags.has(t)) || themeCategories.has(candidate.category)) {
      score += 3;
    }
    // Curated tags also count against raw prompt tokens.
    score += Math.min(2, candTags.filter(t => tokens.has(t)).length);

    // Came from a theme-expanded Places query — already intent-matched.
    if (candidate.theme_hit) score += 3;

    // Active category chip.
    if (filter && filter !== 'all' && candidate.category === filter) score += 3;

    // Quality signals.
    if (candidate.rating >= 4.5 && (candidate.rating_count || 0) >= 100) score += 1.5;
    else if (candidate.rating >= 4.0) score += 0.5;

    // Dated events happening soon beat far-future ones.
    if (candidate.date) {
      const when = Date.parse(candidate.date);
      if (!Number.isNaN(when) && when >= now - 24 * 3600 * 1000 && when <= soon) score += 1;
    }

    // Seasonal spotlight (services/spotlight.js): events landing on the
    // next holiday long weekend rise, and anything speaking the holiday's
    // vocabulary ("fireworks", "fall fair") gets a nudge — this is how the
    // engine promotes what's on around the moment people are actually free.
    if (spotlight) {
      if (isAroundSpotlight(spotlight, candidate.date)) score += 2.5;
      if (spotlight.tags && spotlight.tags.length) {
        const spotText = `${candidate.title || ''} ${candidate.description || ''}`.toLowerCase();
        if (spotlight.tags.some(t => spotText.includes(t))) score += 1.5;
      }
    }

    // Keep genuine discovery entries alive even with zero token overlap.
    if (candidate.wow === true) score += 1;
    if (candidate.civic === true || candidate.cost_tier === 'free') score += 0.5;

    // Mode personality: the active mode's home categories rise, and titles
    // that speak the mode's vocabulary rise further.
    if (modeBoost && modeBoost[candidate.category]) score += modeBoost[candidate.category];
    if (modeWords) {
      const modeText = `${candidate.title || ''} ${candidate.description || ''}`;
      if (modeWords.test(modeText)) score += 2;
    }

    // Explicit constraints in the prompt are promises to keep, not hints:
    // a "free things to do" prompt should never rank a $90 tour above a
    // great free park.
    if (intent.budget) {
      if (candidate.cost_tier === 'free') score += 3;
      else if (candidate.price_from != null && candidate.price_from > 60) score -= 2;
    }
    if (intent.kids && candidate.category === 'kids') score += 2;
    if (intent.kids && /\b(kid|family|children|all ages)\b/i.test(candidate.good_for_ages || '')) score += 1;
    if (intent.indoor && /\b(museum|gallery|aquarium|indoor|arcade|science|library|market|conservatory)\b/i
      .test(`${candidate.title || ''} ${candidate.description || ''} ${candidate.category || ''}`)) score += 2;

    // Proximity (set when the user shared their location). A top-tier
    // signal, not a tiebreaker: for family and R&R days, "20 minutes away"
    // IS relevance — nearby beats marginally-better-but-distant, and
    // anything past ~35 km (an hour across the GTA) must earn its place
    // on merit. ≤20 km ≈ the 20-30 min drive most day plans tolerate.
    if (candidate.distance_km != null) {
      if (candidate.distance_km <= 2) score += 6;
      else if (candidate.distance_km <= 5) score += 4.5;
      else if (candidate.distance_km <= 10) score += 3;
      else if (candidate.distance_km <= 20) score += 1.5;
      else if (candidate.distance_km > 35) score -= 2;
    }

    // Active advisories (smoke, extreme heat/cold, high wind) push the day
    // indoors: exposed candidates sink, indoor refuges rise.
    score += advisoryAdjustment(candidate, advisoryPressure);

    return { candidate, score };
  });
}

/**
 * Pick the top `cap` candidates by score while guaranteeing every source
 * that returned anything keeps at least a small voice (up to 2 entries),
 * so the pool Grok sees stays diverse. Output is relevance-ordered.
 */
// Affiliate feeds don't get the guaranteed floor: with a small fixed product
// catalog behind them, a guaranteed 2 slots meant the SAME products appeared
// in every pool, every day. They still enter pass 2 on merit.
const NO_FLOOR_SOURCES = new Set(['viator', 'getyourguide']);

function selectTop(scored, cap = 60) {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const picked = new Set();
  const perSource = new Map();

  // Pass 1: diversity floor — up to 2 best per source.
  for (const entry of sorted) {
    if (picked.size >= cap) break;
    const src = entry.candidate.source || 'unknown';
    if (NO_FLOOR_SOURCES.has(src)) continue;
    const count = perSource.get(src) || 0;
    if (count < 2) {
      picked.add(entry);
      perSource.set(src, count + 1);
    }
  }

  // Pass 2: fill the rest purely by score.
  for (const entry of sorted) {
    if (picked.size >= cap) break;
    picked.add(entry);
  }

  return sorted.filter(e => picked.has(e)).map(e => e.candidate);
}

// Great-circle distance in km, one decimal.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

module.exports = { scoreCandidates, selectTop, tokenize, haversineKm };
