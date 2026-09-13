// data/seasons.js — DayHop V2
// The seasonal engine: turns the Toronto calendar into ranking pressure so
// the feed follows the year. Trails and outdoor days lead from spring
// through fall (fall colours especially), outdoor WINTER activities —
// skating, tubing, snowshoeing, light trails — lead in winter, and
// warm-weather-only ideas (beaches, splash pads, river tubing) sink once
// the season is over. Pure functions, no network calls: relevance.js calls
// seasonAdjustment() per candidate, candidates.js uses catalogSeason() for
// the curated catalog's coarse seasonal tag.
//
// Season model (meteorological, Toronto):
//   spring Mar–May · summer Jun–Aug · fall Sep–Nov · winter Dec–Feb

function seasonOf(month) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

// ---------- vocabulary ----------
// Trails & green outdoors — the things that should lead spring through fall.
const TRAIL_OUTDOOR_RE = /\b(trail|hik(e|ing)|conservation|lookout|viewpoint|escarpment|bluffs|gorge|ravine|falls|boardwalk|forest|arboretum|botanical|garden|nature reserve|birdwatch|picnic|mountain bik)\b/i;

// Warm-weather-only: fine June–September, a broken promise in January.
const WARM_ONLY_RE = /\b(beach|splash pad|outdoor pool|wading|swim pond|paddleboard|paddle ?boat|kayak|canoe|river tubing|water ?park|wave pool|sandcastle|patio season|pick.?your.?own strawberr)\b/i;

// Indoor family destinations. The catalog is outdoor-first and the outdoors is
// seasonal, so from December these have to carry the weekend — but until now
// nothing lifted them: spring through fall TRAIL_OUTDOOR_RE gained +3 while
// indoor gained nothing, and in winter the only rule was a penalty on
// warm-weather ideas. So indoor sat three points behind a trail in January too.
// Deliberately narrower than "playground" on its own (most playgrounds are
// outdoor) and weaker than the snow-and-ice window, so "get outside" still
// leads a clear winter day and this is the answer for the other kind.
const INDOOR_FAMILY_RE = /\b(indoor|museum|gallery|aquarium|science cent(re|er)|planetarium|arcade|trampoline|climbing gym|boulder(ing)?|play ?caf[eé]|play ?cent(re|er)|soft play|bowling|conservatory|greenhouse|escape room|pottery|library|swimming pool)\b/i;

// Outdoor winter: what "get outside" means December–February.
const WINTER_OUTDOOR_RE = /\b(skat(e|ing)|ice rink|ice trail|toboggan|sledding|snow ?tub(e|ing)|snowshoe|cross.?country ski|xc ski|ski hill|ski resort|snowboard|winter (village|festival|lights?)|light (festival|trail|show)|ice fishing|winter hik(e|ing))\b/i;

// ---------- dated Ontario windows (MM-DD, inclusive; may wrap the year) ----------
const WINDOWS = [
  { label: 'maple syrup', from: '03-01', to: '04-15', weight: 3,
    re: /\b(maple|sugar ?bush|sugar shack|pancake house|syrup)\b/i },
  { label: 'blossoms', from: '04-20', to: '05-25', weight: 3,
    re: /\b(blossom|sakura|cherry tree|magnolia|tulip|lilac)\b/i },
  { label: 'strawberry season', from: '06-05', to: '07-10', weight: 3,
    re: /\b(strawberr|u.?pick|berry (farm|pick))\b/i },
  { label: 'beach & splash', from: '06-10', to: '09-07', weight: 3, re: WARM_ONLY_RE },
  { label: 'summer festivals', from: '06-20', to: '09-07', weight: 2,
    re: /\b(festival|fireworks|outdoor concert|open.?air (cinema|movie)|movie under the stars|night market|ribfest|carnival|midway|cne|canadian national exhibition|buskers?)\b/i },
  // Deliberately "falls boat"/"boat tour", never bare falls/cruise — those
  // already score via TRAIL_OUTDOOR_RE and would double-boost every harbour cruise.
  { label: 'big water & caves', from: '06-15', to: '09-15', weight: 2,
    re: /\b(boat (tour|cruise)|falls boat|cave|cavern|grotto|gorge|provincial park|scenic drive|beach town)\b/i },
  { label: 'fall colours', from: '09-20', to: '11-02', weight: 3,
    re: /\b(fall colours?|fall colors?|autumn|foliage|leaf|leaves|scenic (drive|lookout)|lookout|escarpment)\b/i },
  { label: 'apple & pumpkin', from: '09-01', to: '10-31', weight: 3,
    re: /\b(apple (pick|orchard|farm|cider)|orchard|pumpkin|corn maze|hayride|cider|fall fair)\b/i },
  { label: 'halloween', from: '10-05', to: '10-31', weight: 2,
    re: /\b(halloween|haunted|spooky|pumpkins? after dark)\b/i },
  { label: 'holiday season', from: '11-20', to: '12-31', weight: 3,
    re: /\b(christmas|holiday market|santa|nutcracker|menorah|winter (village|wonderland)|festive|tree lighting)\b/i },
  { label: 'snow & ice', from: '12-01', to: '03-10', weight: 3, re: WINTER_OUTDOOR_RE }
];

// "MM-DD in [from, to]" with year-wrap support (e.g. 12-01 → 03-10).
function inWindow(mmdd, w) {
  return w.from <= w.to
    ? (mmdd >= w.from && mmdd <= w.to)
    : (mmdd >= w.from || mmdd <= w.to);
}

/**
 * Build the season context once per scoring pass. `ymd` is Toronto-local
 * YYYY-MM-DD — pass the planned date's when the user picked one, so a
 * February browse planned for May scores like May.
 */
function getSeasonContext(ymd) {
  const month = Number(String(ymd).slice(5, 7)) || 1;
  const mmdd = String(ymd).slice(5, 10);
  return {
    ymd,
    season: seasonOf(month),
    windows: WINDOWS.filter(w => inWindow(mmdd, w))
  };
}

/**
 * Per-candidate seasonal score delta. Additive with everything else in
 * relevance.js; a nudge of ±3 per signal, capped so stacked windows can't
 * drown relevance entirely.
 */
function seasonAdjustment(candidate, ctx) {
  if (!ctx) return 0;
  const text = `${candidate.title || ''} ${candidate.description || ''} ` +
    `${(candidate.tags || []).join(' ')} ${candidate.category || ''}`;
  let delta = 0;

  if (ctx.season === 'winter') {
    // Winter: outdoor-winter first (via the snow-and-ice window below),
    // warm-only ideas out of the way, and indoor promoted to the bench it
    // has to be — at +2.5 it sits just under the +3 snow-and-ice window, so
    // skating still leads a crisp Saturday and this leads the other kind.
    if (WARM_ONLY_RE.test(text)) delta -= 3;
    if (INDOOR_FAMILY_RE.test(text)) delta += 2.5;
    // Green-season outdoors sink. Losing the +3 was not enough on its own —
    // trails carry strong base scores, so a promptless January browse still
    // opened on ravines and arboretums, which is a bleak recommendation in
    // February and the reason winter had nothing to offer.
    //
    // The guard is the whole point: a place that is ALSO a winter destination
    // keeps its footing. Durham Regional Forest (xc ski) and Hardwood Ski and
    // Bike both match the trail vocabulary and would otherwise be demoted in
    // the one season they are best. Skating, tubing, snowshoe and ski still
    // gain +3 from the snow-and-ice window on top.
    if (TRAIL_OUTDOOR_RE.test(text) && !WINTER_OUTDOOR_RE.test(text)) delta -= 2.5;
  } else {
    // Spring/summer/fall: trails and green outdoors lead.
    if (TRAIL_OUTDOOR_RE.test(text)) delta += 3;
    // Warm-only ideas belong to summer (and late spring), not November.
    if (ctx.season === 'fall' && WARM_ONLY_RE.test(text)) delta -= 2;
  }

  for (const w of ctx.windows) {
    if (w.re.test(text)) delta += w.weight;
  }

  return Math.max(-4, Math.min(6, delta));
}

/**
 * Coarse eligibility for the curated catalog's `seasonal: 'summer'|'winter'`
 * tag. Wider than the old binary May–Sep split: shoulder months keep both
 * kinds available (an unseasonably warm April Saturday can still hold a
 * splash-pad entry; ski hills stay listed into March).
 *   'summer' entries: April–October
 *   'winter' entries: November–March
 */
function isCatalogSeasonEligible(tag, month) {
  if (!tag) return true;
  if (tag === 'summer') return month >= 4 && month <= 10;
  if (tag === 'winter') return month >= 11 || month <= 3;
  return true;
}

/**
 * A place you drive to on purpose because of the season — right now that means
 * winter outdoors: ski hills, tubing, skating trails, snowshoe, ice trails.
 *
 * This exists because two true rules collide. The feed shows nearest first, and
 * in winter it should take people skiing — but from Richmond Hill every ski hill
 * is 58 km and every rink 26 km, while a café is 800 m. Ranked on distance alone
 * the skiing can never surface. Nobody means "nearby" to apply to a ski hill;
 * the drive IS the plan. relevance.js lets these into the nearest band so they
 * compete on merit instead of being filed behind the coffee shops.
 */
function isSeasonalDestination(candidate, ctx) {
  if (!ctx || ctx.season !== 'winter') return false;
  const text = `${candidate.title || ''} ${candidate.description || ''} ` +
    `${(candidate.tags || []).join(' ')} ${candidate.category || ''}`;
  return WINTER_OUTDOOR_RE.test(text);
}

module.exports = { seasonOf, getSeasonContext, seasonAdjustment, isCatalogSeasonEligible, isSeasonalDestination, WINDOWS };
