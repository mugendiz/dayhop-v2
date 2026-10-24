// test/plannerFeed.test.js — the planner feed that failed on 2026-10-24.
//
// "The most adventurous playgrounds near me to go with a 4 year old", near
// you in Richmond Hill, Adventure mode on, served cafes, climbing gyms,
// go-karting, a night market, horseback riding and library programs, padded
// to 32 tiles, with a "Distance unknown" shelf and one tile that matched.
// These pin the fixes: stated constraints filter instead of nudging scores,
// the diversity floor needs relevance, "more finds" are capped and labeled,
// a near-me search never shows a place it cannot locate, and tiles never
// repeat a picture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const constraints = require('../services/constraints');
const relevance = require('../services/relevance');
const { matchThemes } = require('../data/themes');
const { PROMPT, ORIGIN, pool } = require('./fixtures/playgroundQuery');

// ---------- age and activity parsing ----------

test('child ages are read from the ways parents write them', () => {
  const ages = p => constraints.parseChildAges(p);
  assert.deepEqual(ages(PROMPT), [4]);
  assert.deepEqual(ages('something fun for my four-year-old'), [4]);
  assert.deepEqual(ages('indoor play, 4yo and a baby'), [1, 4]);
  assert.deepEqual(ages('splash pad for a 3 y/o'), [3]);
  assert.deepEqual(ages('farm visit, kids aged 5'), [5]);
  assert.deepEqual(ages('a walk with our 18 month old'), [1]);
  assert.deepEqual(ages('day out with my 4 and 7 year olds'), [4, 7]);
  assert.deepEqual(ages('rainy day with a toddler'), [2]);
  assert.deepEqual(ages('preschooler friendly museum'), [4]);
  assert.deepEqual(ages('things to do with kids under 6'), [5]);
});

test('numbers that are not ages are left alone', () => {
  const ages = p => constraints.parseChildAges(p);
  assert.deepEqual(ages('a 40 minute drive at most'), []);
  assert.deepEqual(ages('4 hours with the kids'), []);
  assert.deepEqual(ages('top 10 patios open until 9'), []);
  assert.deepEqual(ages('our 2 year anniversary dinner'), []);
  assert.deepEqual(ages('a 100 year old church'), [], 'not a child');
  assert.deepEqual(ages(''), []);
});

test('the failing prompt states a young child and the playground activity', () => {
  const c = constraints.parseConstraints(PROMPT);
  assert.equal(c.active, true);
  assert.equal(c.age, 4);
  assert.equal(c.young, true);
  assert.equal(c.activity, 'playground');
  assert.equal(constraints.describeConstraints(c), 'playgrounds and indoor play, suitable for a 4 year old');
  assert.equal(constraints.parseConstraints('a calm afternoon by the water').active, false);
});

test('age suitability: explicit ages decide, then what the place is', () => {
  const fit = (c) => constraints.ageSuitability(c, 4);
  const byTitle = Object.fromEntries(pool().map(c => [c.title, c]));
  assert.equal(fit(byTitle['Hub Climbing Markham']), false);
  assert.equal(fit(byTitle['Drift Zone Aurora']), false);
  assert.equal(fit(byTitle['RC Paradise']), false);
  assert.equal(fit(byTitle['Guided Horseback Trail Ride']), false);
  assert.equal(fit(byTitle['Toronto Night Market']), false);
  assert.equal(fit(byTitle['Escape Room Richmond Hill']), false, '12+');
  assert.equal(fit(byTitle['Taproom with a patio']), false);
  assert.equal(fit(byTitle['Game On Board Games']), false, 'teens');
  assert.equal(fit(byTitle['Knitting Circle']), false, 'adults');
  assert.equal(fit(byTitle['Family Story Time']), true, '"0 to 5" includes 4');
  assert.equal(fit(byTitle['Mill Pond Park adventure playground']), true);
  assert.equal(fit(byTitle['Kidz Kingdom indoor playground']), true, '"Toddlers to 10" includes 4');
  assert.equal(constraints.ageSuitability({ title: 'Ages 6+ ninja course', good_for_ages: '6+' }, 4), false);
  assert.equal(constraints.ageSuitability({ title: 'Richmond Hill Heritage Centre', description: 'Local history museum.' }, 4), null, 'unknown, not proven');
});

test('driving venues that call themselves playgrounds stay out for a 4 year old (live run, 2026-10-24)', () => {
  // After the first fix shipped, the live feed for the same prompt still
  // carried these two: the Places listing for Drift Zone reads like an
  // indoor playground, and the catalog calls RC Paradise one. The brief
  // classes both as go-karting.
  const rc = require('../data/curatedCatalog').find(c => c.id === 'cur-rc-paradise');
  assert.equal(constraints.ageSuitability(rc, 4), false);
  assert.equal(constraints.ageSuitability({ title: 'Drift Zone Aurora', category: 'kids',
    description: 'Spacious indoor playground with toddler zones and gentle play structures' }, 4), false);
  assert.equal(constraints.ageSuitability(rc, 9), true, 'an older child can drive');
  // Neighbours that must not be caught by the wider words.
  assert.equal(constraints.ageSuitability({ title: 'Driftwood beach playground', category: 'kids' }, 4), true);
  assert.equal(constraints.ageSuitability({ title: 'R.C. Harris Water Treatment Plant', description: 'Family friendly landmark' }, 4), true);
});

// ---------- the fixture through the production ranking ----------

// Stub geocoder: the library branch, downtown and Treetop Trekking resolve
// (so no-distance is not what keeps them out), anything else is not found.
function stubGeocode(t) {
  const maps = require('../services/googleMaps');
  const prevKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevGeocode = maps.geocode;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key-never-used';
  maps.geocode = async (text) => {
    if (/steeles library/i.test(text)) return { lat: 43.8105, lng: -79.4510 };
    if (/downtown toronto/i.test(text)) return { lat: 43.6532, lng: -79.3832 };
    if (/treetop trekking/i.test(text)) return { lat: 43.7315, lng: -79.7624 };
    const err = new Error('not found'); err.code = 'GEOCODE_NOT_FOUND'; throw err;
  };
  t.after(() => {
    maps.geocode = prevGeocode;
    if (prevKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = prevKey;
  });
}

const OFFENDERS = /cafe|coffee|lounge|\bbar\b|taproom|brewery|library|knitting|board games|crafturday|story time|saturday morning|go-?kart|drift|rc paradise|climbing gym|bouldering|boulders|rockhaus|night market|horseback|treetop|escape room/i;

async function rankFixture({ mode = 'adventure', withLocation = true, prompt = PROMPT } = {}) {
  const { rankPool } = require('../services/candidates');
  return rankPool(pool(), {
    prompt, themes: matchThemes(prompt), mode,
    origin: withLocation ? ORIGIN : null,
    opts: Object.assign({ diversityFloor: 'gated' }, withLocation ? { nearMeKm: 60, requireDistance: true } : {})
  });
}

test('adventure mode, Richmond Hill: the top 10 are playgrounds or indoor play for a 4 year old', async (t) => {
  stubGeocode(t);
  const ranked = await rankFixture();
  assert.ok(ranked.length >= 10, `only ${ranked.length} candidates survived`);
  for (const c of ranked.slice(0, 10)) {
    assert.ok(constraints.activityMatch(c, 'playground'), `${c.title} is not a playground or indoor play`);
    assert.equal(c.constraint_fit, 'proven', `${c.title} is not proven suitable for a 4 year old`);
  }
  const offenders = ranked.filter(c => OFFENDERS.test(`${c.title} ${c.description || ''}`)).map(c => c.title);
  assert.deepEqual(offenders, [], 'off-target candidates reached the pool');
  assert.ok(ranked.every(c => c.distance_km != null), 'a near-me pool must have a distance on every candidate');
  assert.ok(ranked.every(c => !c.wildcard), 'no random wildcards on a request with stated constraints');
});

test('R&R mode and no location: the same constraints hold and nothing crashes', async (t) => {
  stubGeocode(t);
  for (const opts of [{ mode: 'rr' }, { mode: 'adventure', withLocation: false }, { mode: 'rr', withLocation: false }]) {
    const ranked = await rankFixture(opts);
    assert.ok(ranked.length >= 10, `${JSON.stringify(opts)}: only ${ranked.length} candidates`);
    assert.ok(ranked.every(c => constraints.activityMatch(c, 'playground')), `${JSON.stringify(opts)}: a non-playground got in`);
    if (opts.withLocation === false) assert.ok(ranked.every(c => c.distance_km == null), 'no origin, no distances');
  }
});

test('an open prompt is not filtered: constraints only apply when stated', async (t) => {
  stubGeocode(t);
  const ranked = await rankFixture({ mode: 'rr', prompt: 'a calm afternoon with coffee and a walk' });
  assert.ok(ranked.some(c => /cafe|coffee/i.test(c.title)), 'a coffee request should still find cafes');
  assert.ok(ranked.every(c => c.constraint_fit === undefined));
});

test('mode guard: Adventure mode thrill boosts do not apply when a young child is stated', () => {
  const gym = pool().find(c => c.id === 'gp-hub-climbing');
  const score = (young) => relevance.scoreCandidates([Object.assign({}, gym)], {
    prompt: PROMPT, mode: 'adventure',
    constraints: Object.assign(constraints.parseConstraints(PROMPT), { young })
  })[0].score;
  assert.ok(score(true) < score(false), 'the adventures category and thrill words still lifted a climbing gym');
});

// ---------- the diversity floor ----------

const entry = (id, source, score, matched, km) => ({ candidate: { id, source, distance_km: km }, score, matched });

test('gated floor: a source keeps its guaranteed slots only for relevant candidates', () => {
  const top = 20;
  const scored = [
    entry('a1', 'google_places', top, true), entry('a2', 'google_places', top - 1, true),
    entry('a3', 'google_places', top - 2, true),
    entry('lib-far', 'tpl_events', top - relevance.FLOOR_MARGIN - 0.5, false),
    entry('cafe-far', 'yelp', top - relevance.FLOOR_MARGIN - 6, false)
  ];
  const ids = list => list.map(c => c.id);
  // Open (browse): every source gets a floor slot whatever its relevance,
  // so the library program pushes out the third relevant place, and with
  // one more slot the cafe does too.
  assert.deepEqual(ids(relevance.selectTop(scored, 3)), ['a1', 'a2', 'lib-far']);
  assert.deepEqual(ids(relevance.selectTop(scored, 4)), ['a1', 'a2', 'lib-far', 'cafe-far']);
  // Gated (planner): unmatched entries below the margin earn no floor slot;
  // they still compete on score for whatever room is left.
  assert.deepEqual(ids(relevance.selectTop(scored, 3, { floor: 'gated' })), ['a1', 'a2', 'a3']);
  assert.deepEqual(ids(relevance.selectTop(scored, 4, { floor: 'gated' })), ['a1', 'a2', 'a3', 'lib-far']);
});

test('gated floor threshold: within FLOOR_MARGIN of the top, or matched, earns the slot', () => {
  const top = 20;
  const ids = list => list.map(c => c.id);
  const atEdge = [entry('a1', 'google_places', top, true), entry('a2', 'google_places', top - 1, true),
    entry('a3', 'google_places', top - 1.5, true), entry('edge', 'tpl_events', top - relevance.FLOOR_MARGIN, false)];
  assert.ok(ids(relevance.selectTop(atEdge, 3, { floor: 'gated' })).includes('edge'), 'exactly at the margin counts');
  const lowButMatched = [entry('a1', 'google_places', top, true), entry('a2', 'google_places', top - 1, true),
    entry('a3', 'google_places', top - 1.5, true), entry('match', 'tpl_events', 2, true)];
  assert.ok(ids(relevance.selectTop(lowButMatched, 3, { floor: 'gated' })).includes('match'), 'a prompt match keeps its source slot');
});

test('a constraint tier outranks score and distance', () => {
  const scored = [
    Object.assign(entry('unknown-close', 'google_places', 30, true, 2), { tier: 1 }),
    Object.assign(entry('proven-far', 'google_places', 5, true, 30), { tier: 0 })
  ];
  assert.deepEqual(relevance.selectTop(scored, 60).map(c => c.id), ['proven-far', 'unknown-close']);
});

// ---------- null distances ----------

test('an unknown distance sorts after every known band, server side', () => {
  const out = relevance.selectTop([entry('nowhere', 'curated', 50, true, null), entry('far', 'curated', 1, true, 65)], 60);
  assert.deepEqual(out.map(c => c.id), ['far', 'nowhere']);
});

test('near-me pool: one cap for every source, and no candidate without a distance', async (t) => {
  stubGeocode(t);
  const { rankPool } = require('../services/candidates');
  const P = [
    { id: 'near', source: 'curated_catalog', title: 'Near playground', category: 'kids', lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng },
    { id: 'far-curated', source: 'curated_catalog', title: 'Far playground', category: 'kids', lat: ORIGIN.lat + 1, lng: ORIGIN.lng },
    { id: 'unplaceable', source: 'ticketmaster', title: 'Playground pop-up', category: 'kids', venue: 'TBA', lat: null, lng: null }
  ];
  const ranked = await rankPool(P, { prompt: 'playgrounds near me', mode: 'rr', origin: ORIGIN, opts: { nearMeKm: 60, requireDistance: true } });
  assert.deepEqual(ranked.map(c => c.id), ['near']);
});

test('without a location nothing is dropped for having no distance', async () => {
  const { rankPool } = require('../services/candidates');
  const P = [{ id: 'x', source: 'curated_catalog', title: 'Splash pad at the park', category: 'kids', lat: null, lng: null }];
  const ranked = await rankPool(P, { prompt: 'splash pads', mode: 'rr', origin: null });
  assert.deepEqual(ranked.map(c => c.id), ['x']);
});

// ---------- "more finds" ----------

test('more finds: capped, prompt matches only, every one labeled', () => {
  const { appendMoreFinds, MAX_MORE_FINDS } = require('../routes/generate');
  const cands = Array.from({ length: 30 }, (_, i) => ({
    id: `c${i}`, source: 'google_places', title: `Place ${i}`, prompt_match: i % 2 === 0, wildcard: i === 4 || undefined
  }));
  const picks = [{ id: 'c0', title: 'Place 0' }];
  const feed = appendMoreFinds(picks, cands);
  const more = feed.filter(i => i.more_find);
  assert.equal(MAX_MORE_FINDS, 6);
  assert.equal(more.length, 6);
  assert.equal(feed.length, 7, 'no padding to 32');
  assert.ok(more.every(i => cands.find(c => c.id === i.id).prompt_match), 'an unmatched candidate was appended');
  assert.ok(!more.some(i => i.id === 'c4'), 'a wildcard was appended');
  assert.deepEqual(appendMoreFinds(picks, cands.map(c => Object.assign({}, c, { prompt_match: false }))), picks,
    'nothing relevant left means nothing appended');
});

test('more finds on a constrained request: proven matches count, unknown suitability does not', () => {
  // The live run got zero more finds: playgrounds found by their Places type
  // passed the constraints but did not repeat the prompt's words.
  const { appendMoreFinds } = require('../routes/generate');
  const cands = [
    { id: 'pick', title: 'Picked playground', prompt_match: true, constraint_fit: 'proven' },
    { id: 'typed', title: 'Toogood Pond Park', prompt_match: false, constraint_fit: 'proven' },
    { id: 'unsure', title: 'Heritage Centre', prompt_match: false, constraint_fit: 'unknown' }
  ];
  const more = appendMoreFinds([{ id: 'pick', title: 'Picked playground' }], cands).filter(i => i.more_find);
  assert.deepEqual(more.map(i => i.id), ['typed']);
});

// ---------- price tier ----------

test('cost_tier is one lowercase enum, filled from price when the source gave none', () => {
  const { normalizeCostTier } = require('../services/candidates');
  assert.equal(normalizeCostTier('Free'), 'free');
  assert.equal(normalizeCostTier(' $$ '), '$$');
  assert.equal(normalizeCostTier('$$$$'), '$$$');
  assert.equal(normalizeCostTier(null, 0), 'free');
  assert.equal(normalizeCostTier(null, 18), '$');
  assert.equal(normalizeCostTier(null, 45), '$$');
  assert.equal(normalizeCostTier(null, 89), '$$$');
  assert.equal(normalizeCostTier('cheap', null), null);
  assert.equal(normalizeCostTier(undefined, undefined), null);
  const { mergeWithCandidates } = require('../routes/generate');
  const [merged] = mergeWithCandidates([{ id: 'v', cost_tier: 'Moderate' }], [{ id: 'v', price_from: 89 }]);
  assert.equal(merged.cost_tier, '$$$', 'the source price fills the tier');
});

// ---------- client: public/app.js ----------

// public/app.js is one IIFE with no exports. Pull the named top-level
// declarations out of the shipped file and run them in a sandbox, so these
// tests exercise the real code rather than a copy of it.
const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function declaration(head) {
  const start = APP_SRC.indexOf(head);
  assert.ok(start >= 0, `public/app.js no longer has "${head.trim()}"`);
  if (/;\s*$/.test(head)) return head;
  let depth = 0;
  for (let i = APP_SRC.indexOf('{', start); i < APP_SRC.length; i++) {
    if (APP_SRC[i] === '{') depth++;
    else if (APP_SRC[i] === '}' && --depth === 0) return APP_SRC.slice(start, i + 1) + (head.includes('const ') ? ';' : '');
  }
  throw new Error(`unbalanced braces after "${head}"`);
}
function loadClient(heads, exportNames) {
  const code = heads.map(declaration).join('\n') + `\n({ ${exportNames.join(', ')} })`;
  return vm.runInNewContext(code, { encodeURIComponent });
}
const client = loadClient([
  '  const CATEGORY_LABELS = {', '  const CATEGORY_IMAGES = {', '  function categoryImage(', '  function proxiedImage(',
  '  function tileGlyph(', '  let tileArtUsed = new Set();', '  let tileArtDrawn = 0;', '  function resetTileArt(',
  '  function pickTileArt(', '  function illustratedTile(', "  const COST_TIERS = ['free', '$', '$$', '$$$'];",
  '  function costLabel(', '  function distanceSections('
], ['resetTileArt', 'pickTileArt', 'costLabel', 'distanceSections']);

test('client, distance sort: more finds keep their labeled section, nearest first', () => {
  const ideas = [
    { id: 'p1', distance_km: 6.1 }, { id: 'p2', distance_km: 1.6 },
    { id: 'w1', distance_km: 3, wow_reason: 'You asked for playgrounds...' },
    { id: 'm1', distance_km: 9, more_find: true }, { id: 'm2', distance_km: 2, more_find: true },
    { id: 'n1', section: 'Further out', distance_km: 40 }
  ];
  const { sections, unplaced } = client.distanceSections(ideas, false);
  const byLabel = Object.fromEntries(Array.from(sections, s => [s.label, s]));
  const idsOf = label => Array.from(byLabel[label].ideas, i => i.id); // out of the sandbox realm
  assert.deepEqual(idsOf('Right on target'), ['p2', 'p1']);
  assert.deepEqual(idsOf('More great finds nearby'), ['m2', 'm1']);
  assert.equal(byLabel['More great finds nearby'].headers, true, 'the more-finds header must show in distance sort');
  assert.deepEqual(idsOf('Further out'), ['n1']);
  assert.equal(unplaced, 0);
});

test('client, distance sort: places without a distance are counted, never shelved as "Distance unknown"', () => {
  const ideas = [{ id: 'a', distance_km: 3 }, { id: 'b', distance_km: null }, { id: 'c' }, { id: 'd', distance_km: 1, more_find: true }];
  for (const browse of [false, true]) {
    const { sections, unplaced } = client.distanceSections(ideas, browse);
    assert.equal(unplaced, 2);
    assert.ok(!sections.some(s => /unknown/i.test(s.label)), 'a "Distance unknown" section came back');
    assert.ok(sections.every(s => s.ideas.every(i => i.distance_km != null)));
  }
  const none = client.distanceSections([{ id: 'x' }, { id: 'y', distance_km: undefined }], false);
  assert.equal(none.unplaced, 2, 'no distances at all must not crash');
});

test('client tiles: no two tiles in a feed share a picture', () => {
  client.resetTileArt();
  const ideas = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `gp-playground-${i}`, category: 'kids' })),
    { id: 'same-1', category: 'kids', image_url: '/api/photo?name=places%2Fa%2Fphotos%2F1' },
    { id: 'same-2', category: 'kids', image_url: '/api/photo?name=places%2Fa%2Fphotos%2F1' },
    { id: 'own', category: 'kids', image_url: '/api/photo?name=places%2Fb%2Fphotos%2F2' },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `cafe-${i}`, category: 'food' }))
  ];
  const art = ideas.map(i => client.pickTileArt(i, 360));
  assert.equal(new Set(art.map(a => a.src)).size, art.length, 'two tiles share an image');
  assert.equal(art.filter(a => a.kind === 'stock').length, 2, 'each category stock shot at most once');
  assert.ok(art.every(a => a.src), 'every tile has art: no bare gradient');
  assert.equal(art[10].kind, 'illustration', 'a repeated photo falls back instead of repeating');
  // A new feed starts over.
  client.resetTileArt();
  assert.equal(client.pickTileArt({ id: 'z', category: 'kids' }, 360).kind, 'stock');
});

test('client tiles: every tile has a price badge, "price varies" when unknown', () => {
  assert.equal(client.costLabel('Free'), 'free');
  assert.equal(client.costLabel('$$'), '$$');
  assert.equal(client.costLabel(null), 'price varies');
  assert.equal(client.costLabel(undefined), 'price varies');
  assert.equal(client.costLabel('Moderate'), 'price varies');
});

test('new feed copy follows the house style and is what the app ships', () => {
  const { lint } = require('../services/copyStyle');
  const copy = [
    'price varies', 'Illustrative photo, not this place', 'No photo of this place yet',
    'Show all in recommended order', 'no distance and', ' mode`]', 'Only ${state.lastConstraints.summary}'
  ];
  for (const s of copy) assert.ok(APP_SRC.includes(s), `"${s}" is not in public/app.js`);
  const rendered = [
    ...copy.slice(0, 4), '3 places have no distance and are not in this list.', 'Adventure mode',
    `Only ${constraints.describeConstraints(constraints.parseConstraints(PROMPT))}`
  ];
  for (const s of rendered) assert.deepEqual(lint(s).map(v => v.detail), [], `"${s}" breaks the house style`);
});
