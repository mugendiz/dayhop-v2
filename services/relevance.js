// services/relevance.js — DayHop V2
// Ranks the merged candidate pool against the user's prompt before it is
// capped and sent to Grok. Previously candidates were round-robin
// interleaved, so a highly relevant item from a late source could be
// trimmed while an unrelated event survived. Simple additive keyword/tag
// scoring — no embeddings, no network calls.

const { isAroundSpotlight, torontoToday } = require('./spotlight');
const seasons = require('../data/seasons');
const { parseConstraints } = require('./constraints');

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
    romantic: /\b(date|romantic|anniversary|partner|couple)\b/.test(p),
    // They asked for the outdoors in so many words. Seasonal and bad-weather
    // steering exists for people who did NOT say — once someone types "hike",
    // demoting trails in February is just refusing the request.
    outdoorAsk: /\b(hik(e|ing)|trail|trails|walk in the woods|forest|nature walk|outdoors|outside|ski|skiing|snowshoe|toboggan|sled|skat(e|ing)|fresh air)\b/.test(p),
    // A drive is the point, not a cost — the only case where something far
    // should outrank what is close.
    worthTrip: /\b(road ?trip|worth the drive|day ?trip|far|further|drive out|out of town|weekend away|worth a trip)\b/.test(p),
    // Narrower than outdoorAsk on purpose. outdoorAsk lifts the winter and
    // wet demotions — reasonable for "a hike". Earning a 58 km drive is a
    // bigger claim, and only asking for the winter activity itself makes it.
    winterAsk: /\b(ski|skiing|snowboard|snowshoe|toboggan(ing)?|sled(ding|ging)?|tubing|snow|winter)\b/.test(p)
  };
}

/**
 * Score candidates against the prompt, matched themes (data/themes.js
 * shapes), the active category filter, and the R&R/Adventure mode.
 * Returns [{ candidate, score }].
 */
function scoreCandidates(candidates, { prompt, themes = [], filter, mode, advisoryPressure, spotlight, dateWindow, weather, constraints } = {}) {
  const tokens = tokenize(prompt);
  const intent = readIntent(prompt);
  // Stated constraints (services/constraints.js). The age guard: Adventure
  // mode's thrill boosts exist to steer an open request, not to reinterpret
  // "playgrounds with a 4 year old" as a climbing-gym request. With a young
  // child named, the thrill category and thrill vocabulary get nothing.
  const stated = constraints || parseConstraints(prompt);
  const thrillGuard = mode === 'adventure' && stated.young;
  // Seasonal pressure follows the PLANNED day when the date picker is set —
  // a February browse planned for May scores like May.
  const seasonCtx = seasons.getSeasonContext((dateWindow && dateWindow.start) || torontoToday());
  const modeBoost = MODE_CATEGORY_BOOST[mode] || null;
  const modeWords = thrillGuard ? null : (mode === 'adventure' ? ADVENTURE_WORDS : (mode === 'rr' ? RR_CALM_WORDS : null));
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

    // A place the season itself is the reason to drive to (winter: ski hills,
    // tubing, skating and ice trails). Computed up front because both the
    // proximity term and the feed ordering have to agree about it.
    // A winter outing is exempt from the distance rules — but only up to a
    // point. "Take people skiing" and "no need to surface results 40+ km away"
    // are both true, and WORTH_TRIP_KM is where they meet: a toboggan hill or
    // rink within 40 km rides in the nearest band because the whole idea is to
    // get outside nearby, while a 58 km ski hill has to be asked for. A hill
    // 40 km away is not a plan, it is the same hill with a drive attached.
    const seasonalDestination = seasons.isSeasonalDestination(candidate, seasonCtx)
      && (candidate.distance_km == null
        || candidate.distance_km <= WORTH_TRIP_KM
        || intent.worthTrip
        || intent.winterAsk
        || candidate.worth_trip === true);
    if (seasonalDestination) candidate.seasonal_destination = true;

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
    const tokenHits = 2 * textHits(tokens, candidate.title)
      + textHits(tokens, candidate.description)
      + textHits(tokens, candidate.venue)
      + textHits(tokens, candidate.category);
    score += tokenHits;

    // Theme vocabulary: candidate tags/category vs matched theme tags.
    const candTags = (candidate.tags || []).map(t => String(t).toLowerCase());
    const themeMatch = candTags.some(t => themeTags.has(t)) || themeCategories.has(candidate.category);
    if (themeMatch) score += 3;
    // Curated tags also count against raw prompt tokens.
    const tagHits = Math.min(2, candTags.filter(t => tokens.has(t)).length);
    score += tagHits;

    // Came from a theme-expanded Places query — already intent-matched.
    if (candidate.theme_hit) score += 3;

    // Active category chip.
    const filterMatch = Boolean(filter && filter !== 'all' && candidate.category === filter);
    if (filterMatch) score += 3;

    // Does this candidate answer the request at all? selectTop only hands a
    // source its guaranteed slots for candidates that do, and "more finds"
    // only draws from them (routes/generate.js).
    const matched = tokenHits > 0 || tagHits > 0 || themeMatch || Boolean(candidate.theme_hit) || filterMatch;
    candidate.prompt_match = matched;

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
    if (modeBoost && modeBoost[candidate.category] && !(thrillGuard && candidate.category === 'adventures')) {
      score += modeBoost[candidate.category];
    }
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
    // A family that asked for the kids must not be handed a 19+ spa: the
    // Nordic spas carry a cold-season boost that would otherwise float them
    // into exactly that feed. 16+ and up counts as adults-only here.
    if (intent.kids && /^\s*(1[6-9]|[2-9]\d)\s*\+/.test(candidate.good_for_ages || '')) score -= 6;
    if (intent.romantic) {
      if (['patios', 'food', 'culture'].includes(candidate.category)) score += 1.5;
      if (/\b(romantic|sunset|view|rooftop|wine|live music|candlelit|stroll|garden)\b/i
        .test(`${candidate.title || ''} ${candidate.description || ''}`)) score += 2;
    }
    if (intent.indoor && /\b(museum|gallery|aquarium|indoor|arcade|science|library|market|conservatory)\b/i
      .test(`${candidate.title || ''} ${candidate.description || ''} ${candidate.category || ''}`)) score += 2;

    // Proximity (set when the user shared their location). A top-tier
    // signal, not a tiebreaker: for family and R&R days, "20 minutes away"
    // IS relevance. Continuous decay instead of the old step bands — 12 km
    // and 19 km no longer score identically, and the far penalty keeps
    // growing (capped at −6), so a 130 km attraction can't coast on other
    // boosts the way it could against a flat −2.
    if (candidate.distance_km != null) {
      const d = candidate.distance_km;
      // The far penalty is what "too far for a Tuesday" means — but it is
      // nonsense applied to a ski hill, where the drive is the plan. Exempting
      // banding without exempting this would have left the skiing marked
      // near-band and still scored 1.5 points under a coffee shop.
      const far = seasonalDestination ? 0 : Math.min(6, Math.max(0, (d - 35) / 15));
      score += 6 * Math.exp(-d / 12) - far;
    }

    // Seasonal pressure (data/seasons.js): trails and green outdoors lead
    // spring through fall (fall-colour weeks especially), outdoor winter
    // activities lead December–February, and warm-weather-only ideas sink
    // out of season. Applied to EVERY source — the feed follows the year.
    // Wet = the forecast argues against being outside at all. Passed into the
    // seasonal pass so a rainy day does not also collect the +3 green-outdoors
    // boost — without that the penalty below only cancels part of a lift the
    // feed should never have given, and the trail still leads in the rain.
    const wet = Boolean(weather && (weather.is_rainy || weather.is_extreme_cold)) && !intent.outdoorAsk;
    score += seasons.seasonAdjustment(candidate, seasonCtx, { outdoorAsk: intent.outdoorAsk, wet });

    // Today's weather, when the plan IS for today (candidates.js only passes
    // it then — applying it to a future date would be a quiet lie). Advisories
    // already handle smoke, extreme heat and high wind; this is the ordinary
    // case they never fire for: it is raining, so do not send anyone up a
    // trail. Skipped entirely when they asked for the outdoors anyway.
    if (weather && !intent.outdoorAsk) {
      // Deep cold is the element of a toboggan hill, not a reason to avoid it.
      // Rain is bad for everything outside, the hill included.
      const localPlay = seasons.isLocalWinterPlay(candidate);
      if (weather.is_rainy || (weather.is_extreme_cold && !localPlay)) {
        const text = `${candidate.title || ''} ${candidate.description || ''} ${candidate.category || ''}`;
        if (OUTDOOR_WORDS.test(text)) score -= 3;
        if (INDOOR_REFUGE_WORDS.test(text)) score += 2.5;
      }
      // Snow is the one "bad" forecast that makes an outing better: it ruins a
      // hike and it is the entire point of a toboggan hill.
      if (weather.condition === 'Snow' && localPlay) score += 3;
    }

    // Active advisories (smoke, extreme heat/cold, high wind) push the day
    // indoors: exposed candidates sink, indoor refuges rise.
    score += advisoryAdjustment(candidate, advisoryPressure);

    return { candidate, score, matched };
  });
}

/**
 * Pick the top `cap` candidates by score while guaranteeing every source
 * that returned anything keeps at least a small voice (up to 2 entries),
 * so the pool Grok sees stays diverse. Output is relevance-ordered.
 */
// Affiliate feeds originally lost the guaranteed floor because a small
// fixed catalog meant the SAME products led every pool, every day. Viator
// has since moved to a deep top-20 fetch with a daily-rotating window of 6
// (candidates.js), which fixes the repetition at the source — so it gets
// the standard floor back. Without it, generic tour copy never out-scored
// local venues and Viator (the only commission-bearing source) appeared in
// exactly zero feeds. getyourguide keeps the exclusion until it rotates too.
// Past this, "nearby" stops being a courtesy and starts being the product.
// Only an explicit ask ("worth the drive", "ski") or a flagged entry earns it.
const WORTH_TRIP_KM = 40;

const NO_FLOOR_SOURCES = new Set(['getyourguide']);

// Feed order bands, in km from the chosen location. WHICH candidates make the
// pool is still decided by relevance alone (below) — this only decides the
// order they are shown in, and closer always comes first.
//
// A weight could not do this job. The proximity term in scoreCandidates spans
// +6 to −6, but it separates 5 km from 25 km by only ~3.2 points, while a
// single well-tagged candidate can pick up +3 theme, +3 filter, +4 newly
// opened, +3 free and +2 mode words. That is how a Richmond Hill search ended
// up featuring Ward's Island: the Islands entry genuinely was more relevant to
// the words, and proximity could not out-vote it. Banding makes "near" a sort
// key rather than one opinion among ten, which is what "prioritize nearby,
// others later" actually means. Far ideas are never dropped — they queue up
// behind the close ones.
const DISTANCE_BANDS_KM = [15, 35, 70];
// No coords: after every known band. This used to be band 1, so an unplaced
// library program or night market rode above a 20 km playground in the
// server's order while the client's nearest-first sort put it last; the two
// orders disagreed about the same feed. A place we cannot locate is not
// nearby, so it goes last on both.
const UNKNOWN_DISTANCE_BAND = DISTANCE_BANDS_KM.length + 1;
function distanceBand(km) {
  if (km == null) return UNKNOWN_DISTANCE_BAND;
  for (let i = 0; i < DISTANCE_BANDS_KM.length; i++) {
    if (km <= DISTANCE_BANDS_KM[i]) return i;
  }
  return DISTANCE_BANDS_KM.length;
}

// The diversity floor is for keeping good sources audible, not for keeping
// irrelevant ones alive. A source's guaranteed slots only go to candidates
// that answer the request (a prompt token, a theme tag, a theme search, the
// active chip) or that score within FLOOR_MARGIN of the best candidate in
// the pool. That gate is how library knitting circles and cafes stopped
// riding into a playground query on a guaranteed slot.
const FLOOR_MARGIN = 4;

/**
 * opts.floor: 'gated' applies the relevance gate above (the planner, which
 * answers a typed request); 'open' (default) keeps the unconditional floor
 * for browse, surprise and the digest, which answer no specific request and
 * want every source's events on their shelves.
 * Entries may carry `tier` (services/constraints.js): lower tiers always
 * rank first, whatever the score.
 */
function selectTop(scored, cap = 60, opts = {}) {
  const tierOf = e => (e.tier == null ? 0 : e.tier);
  const sorted = [...scored].sort((a, b) => (tierOf(a) - tierOf(b)) || (b.score - a.score));
  const picked = new Set();
  const perSource = new Map();
  const gated = opts.floor === 'gated';
  const topScore = sorted.length ? Math.max(...sorted.map(e => e.score)) : 0;
  const earnsFloor = e => !gated || e.matched === true || e.score >= topScore - FLOOR_MARGIN;

  // Pass 1: diversity floor — up to 2 best per source, among the relevant.
  for (const entry of sorted) {
    if (picked.size >= cap) break;
    const src = entry.candidate.source || 'unknown';
    if (NO_FLOOR_SOURCES.has(src)) continue;
    if (!earnsFloor(entry)) continue;
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

  const chosen = sorted.filter(e => picked.has(e));

  // No location shared, or nothing geocoded: leave the order exactly as it was.
  if (!chosen.some(e => e.candidate.distance_km != null)) {
    return chosen.map(e => e.candidate);
  }

  // Nearest band first; relevance still decides the order inside a band, and
  // the original index breaks exact ties so the sort stays deterministic.
  // A constraint tier outranks distance: a proven playground 20 km out still
  // comes before one whose suitability is unknown 2 km out.
  return chosen
    .map((entry, index) => ({
      entry,
      index,
      // Seasonal destinations ride in the nearest band: the drive is the plan.
      band: entry.candidate.seasonal_destination ? 0 : distanceBand(entry.candidate.distance_km)
    }))
    .sort((a, b) => (tierOf(a.entry) - tierOf(b.entry)) || (a.band - b.band) || (b.entry.score - a.entry.score) || (a.index - b.index))
    .map(x => Object.assign(x.entry.candidate, { distance_band: x.band }));
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

module.exports = { scoreCandidates, selectTop, tokenize, readIntent, haversineKm, distanceBand, DISTANCE_BANDS_KM, UNKNOWN_DISTANCE_BAND, FLOOR_MARGIN };
