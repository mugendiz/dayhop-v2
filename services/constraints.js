// services/constraints.js — DayHop V2
// Hard constraints read from the prompt. relevance.js scores by soft keyword
// overlap, which is the right tool for "a calm afternoon" and the wrong one
// for "playgrounds ... with a 4 year old": the tokenizer drops "4", "year"
// and "old", nothing ever parsed an age, and a climbing gym or a cafe could
// outscore a playground on mode boosts and ratings. On 2026-10-24 that
// query in Adventure mode returned cafes, climbing gyms, go-karting and
// library programs, with one tile that matched.
//
// What the user states explicitly is a filter, not a score:
//   - a child's age ("4 year old", "age 4", "toddler", "under 6"): anything
//     that clearly does not suit that age is removed, and anything whose
//     suitability is unknown ranks below proven matches;
//   - an activity noun ("playground", "splash pad"): only candidates that
//     are that kind of place stay in the pool.
// Mode boosts never override either (relevance.js reads `young`).

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};
const NUM = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const toNum = s => (NUMBER_WORDS[s] != null ? NUMBER_WORDS[s] : Number(s));

// Age phrases, most specific first. Every match is collected, so "my 4 and
// 7 year olds" yields both ages and the youngest decides what fits.
const AGE_PATTERNS = [
  { re: new RegExp(`\\b${NUM}\\s*(?:and|&|,)\\s*${NUM}[\\s-]*(?:years?|yrs?)[\\s-]*olds?\\b`, 'g'), ages: m => [toNum(m[1]), toNum(m[2])] },
  { re: new RegExp(`\\b${NUM}[\\s-]*(?:years?|yrs?)[\\s-]*olds?\\b`, 'g'), ages: m => [toNum(m[1])] },
  { re: new RegExp(`\\b${NUM}\\s*(?:yo|y\\/o|y\\.o\\.)(?=\\W|$)`, 'g'), ages: m => [toNum(m[1])] },
  { re: new RegExp(`\\b(?:aged?|ages)\\s+${NUM}\\b`, 'g'), ages: m => [toNum(m[1])] },
  { re: /\b(\d{1,2})[\s-]*(?:months?|mos?)[\s-]*olds?\b/g, ages: m => [Math.floor(Number(m[1]) / 12)] },
  // "under 6" / "under six": the children are younger than N.
  { re: new RegExp(`\\bunder\\s+(?:the\\s+age\\s+of\\s+)?${NUM}s?\\b`, 'g'), ages: m => [Math.max(0, toNum(m[1]) - 1)] }
];
const AGE_WORDS = [
  { re: /\b(babies|baby|infants?|newborns?)\b/, age: 1 },
  { re: /\btoddlers?\b/, age: 2 },
  { re: /\bpre-?school(?:ers?)?\b/, age: 4 },
  { re: /\bkindergart(?:en|ners?)\b/, age: 5 }
];

/** Every child age stated in the prompt, youngest first. [] when none. */
function parseChildAges(prompt) {
  const p = String(prompt || '').toLowerCase();
  const ages = [];
  for (const { re, ages: pick } of AGE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(p))) {
      for (const a of pick(m)) if (Number.isFinite(a) && a >= 0 && a <= 17) ages.push(a);
    }
  }
  for (const { re, age } of AGE_WORDS) if (re.test(p)) ages.push(age);
  return [...new Set(ages)].sort((a, b) => a - b);
}

// Activity nouns: the request side (what the user typed) and the candidate
// side (what a matching place says about itself). The playground family
// includes indoor play and splash pads: a parent asking for an adventurous
// playground is well served by either, and by nothing else.
const ACTIVITIES = [
  {
    id: 'playground',
    label: 'playgrounds and indoor play',
    ask: /\b(playgrounds?|play ?grounds?|play ?structures?|tot ?lots?|jungle ?gyms?|soft play|indoor play(?:grounds?|spaces?|cent(?:re|er)s?)?|play ?(?:cent(?:re|er)s?|spaces?|areas?|zones?|parks?))\b/,
    match: /\b(playgrounds?|play ?grounds?|play ?structures?|tot ?lots?|jungle ?gyms?|soft play|indoor play|play ?(?:cent(?:re|er)|space|area|zone|land|lab|park|cafe)|splash ?pads?|spray ?parks?)\b/,
    types: ['playground', 'indoor_playground']
  },
  {
    id: 'splash_pad',
    label: 'splash pads',
    ask: /\b(splash ?pads?|spray ?parks?|wading pools?)\b/,
    match: /\b(splash ?pads?|spray ?parks?|wading pools?|water play)\b/,
    types: []
  },
  {
    id: 'petting_zoo',
    label: 'petting zoos and farms',
    ask: /\b(petting zoos?|animal farms?)\b/,
    match: /\b(petting zoo|animal farm|farm animals|barnyard)\b/,
    types: ['farm']
  }
];

/** The constraints a prompt states. `active` is false when it states none. */
function parseConstraints(prompt) {
  const ages = parseChildAges(prompt);
  const p = String(prompt || '').toLowerCase();
  const activity = ACTIVITIES.find(a => a.ask.test(p)) || null;
  const age = ages.length ? ages[0] : null;
  return {
    active: age != null || Boolean(activity),
    ages,
    age,
    // Young enough that age minimums, thrill rides and adult venues matter.
    young: age != null && age <= 6,
    activity: activity ? activity.id : null,
    activityLabel: activity ? activity.label : null
  };
}

// ---------- candidate side ----------
const textOf = c => [c.title, c.description, c.venue, (c.tags || []).join(' '), c.category]
  .filter(Boolean).join(' ').toLowerCase();

// Places a young child cannot use or should not be taken to, by what the
// listing says it is. Specific phrases on purpose: "climbing structures" is
// a playground, "climbing gym" and "bouldering" are not.
const YOUNG_UNSUITABLE_RE = /\b(climbing gym|bouldering|boulders|rock climbing|climbing wall|top rope|go-?karts?|karting|drift karts?|rc (?:car|racing|track)s?|paintball|laser tag|axe throwing|escape rooms?|horseback|trail rides?|ziplines?|zip-lines?|aerial (?:park|course)s?|ropes course|treetop|skydiv\w*|bungee|night markets?|nightclubs?|bars?|lounges?|pubs?|brewery|breweries|taprooms?|winery|wine bar|cocktails?|hookah|casino|spa)\b/;
const KID_EVIDENCE_RE = /\b(kids?|children|child|toddlers?|preschool|family|families|all ages|little ones|playgrounds?|soft play|indoor play|splash ?pad|story ?time)\b/;

/**
 * Does this candidate suit a child of `age`? true (proven), false (clearly
 * not), or null (unknown). Explicit age data on the listing wins over
 * keyword evidence either way.
 */
function ageSuitability(c, age) {
  if (age == null) return true;
  const ages = String(c.good_for_ages || '').toLowerCase();
  const text = textOf(c);
  // Adults only: 16+, 18+, 19+, "adults".
  if (/^\s*(1[6-9]|[2-9]\d)\s*\+/.test(ages) || /\b(adults?( only)?|19\+|18\+|21\+)\b/.test(ages)) return false;
  if (/\b(19|18|21)\s*\+/.test(text)) return false;
  if (/\bteens?\b/.test(ages) && age < 12) return false;
  // A stated range ("0 to 5", "3-10") or minimum ("ages 6+", "6 and up").
  const range = /(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})/.exec(ages);
  if (range) return age >= Number(range[1]) && age <= Number(range[2]);
  const min = /(?:ages?\s*)?(\d{1,2})\s*(?:\+|and up|and older|or older)/.exec(`${ages} ${text}`);
  if (min) return age >= Number(min[1]);
  const toddlersTo = /\btoddlers?\s+to\s+(\d{1,2})\b/.exec(ages);
  if (toddlersTo) return age <= Number(toddlersTo[1]);
  if (age <= 6 && YOUNG_UNSUITABLE_RE.test(text)) return false;
  if (age <= 6 && (c.types || []).some(t => ['bar', 'night_club', 'casino', 'liquor_store'].includes(t))) return false;
  if (KID_EVIDENCE_RE.test(`${ages} ${text}`) || c.category === 'kids') return true;
  return null;
}

function activityMatch(c, activityId) {
  if (!activityId) return true;
  const a = ACTIVITIES.find(x => x.id === activityId);
  if (!a) return true;
  if ((c.types || []).some(t => a.types.includes(t))) return true;
  return a.match.test(textOf(c));
}

/**
 * Apply the constraints to scored entries ([{ candidate, score }]). Entries
 * that fail are removed; the rest carry a `tier` (0 proven, 1 suitability
 * unknown) that selectTop sorts on before score, so an unknown can never
 * outrank a proven match on boosts alone. Returns { entries, dropped }.
 */
function applyHardConstraints(scored, constraints) {
  if (!constraints || !constraints.active) return { entries: scored, dropped: [] };
  const entries = [];
  const dropped = [];
  for (const e of scored) {
    const c = e.candidate;
    if (!activityMatch(c, constraints.activity)) { dropped.push({ title: c.title, reason: 'activity' }); continue; }
    const fit = ageSuitability(c, constraints.age);
    if (fit === false) { dropped.push({ title: c.title, reason: 'age' }); continue; }
    const tier = fit === true ? 0 : 1;
    c.constraint_fit = tier === 0 ? 'proven' : 'unknown';
    entries.push(Object.assign({}, e, { tier }));
  }
  return { entries, dropped };
}

/** Plain-language summary for Grok and for the results header. */
function describeConstraints(c) {
  if (!c || !c.active) return null;
  const parts = [];
  if (c.activityLabel) parts.push(c.activityLabel);
  if (c.age != null) parts.push(c.age <= 1 ? 'suitable for a baby' : `suitable for a ${c.age} year old`);
  return parts.join(', ');
}

module.exports = {
  parseChildAges, parseConstraints, ageSuitability, activityMatch, applyHardConstraints, describeConstraints,
  YOUNG_UNSUITABLE_RE, ACTIVITIES
};
