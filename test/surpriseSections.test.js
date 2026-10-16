// test/surpriseSections.test.js — "surprise never means road trip." The
// curated shelf leaked a 119 km catalog entry on 2026-08-15 (caught in
// manual verification, fixed same day); this pins the 80 km promise for
// every shelf the builder controls.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSurpriseSections, DRIVE_MAX_KM } = require('../routes/surprise');

const make = (id, over) => Object.assign({
  id, source: 'google_places', title: `Spot ${id}`, category: 'general',
  description: 'a spot', location: 'Toronto', distance_km: 5,
  rating: 4.6, rating_count: 120, wow: false
}, over);

// Enough in-band candidates that the MIN_FEED backstop rarely fires. The
// backstop draws from the whole pool rather than a shelf filter, but it is
// NOT exempt from the band — it used to be, and leaked a 119 km pick the
// moment the shelves above stopped consuming the near items first.
const POOL = [
  ...Array.from({ length: 10 }, (_, i) => make(`near-${i}`, { distance_km: i + 2 })),
  make('curated-near', { source: 'curated_catalog', distance_km: 8, wow: true, rating: null, rating_count: null }),
  make('curated-far', {
    source: 'curated_catalog', title: 'Far Icon Caves', distance_km: 119,
    wow: true, rating: null, rating_count: null
  }),
  make('buzzy', { buzz_score: 40, auto: true, distance_km: 6 })
];

test('no shelf serves anything beyond the 80 km promise', () => {
  for (const wider of [false, true]) {
    const ideas = buildSurpriseSections(POOL, { mode: 'rr', near: true, wider });
    for (const i of ideas) {
      assert.ok(i.distance_km == null || i.distance_km <= DRIVE_MAX_KM,
        `${i.id} at ${i.distance_km} km in "${i.section}" (wider=${wider})`);
    }
  }
});

test('the curated shelf keeps near catalog picks and drops far ones', () => {
  const ideas = buildSurpriseSections(POOL, { mode: 'rr', near: true, wider: false });
  const ids = ideas.map(i => i.id);
  assert.ok(ids.includes('curated-near'), 'near curated pick missing');
  assert.ok(!ids.includes('curated-far'), 'far curated pick leaked (the 2026-08-15 bug)');
});

test('coord-less candidates stay eligible for the curated shelf', () => {
  const noCoords = [
    ...Array.from({ length: 8 }, (_, i) => make(`n-${i}`, { distance_km: null })),
    make('curated-nocoords', { source: 'curated_catalog', distance_km: null, wow: true, rating: null, rating_count: null })
  ];
  const ideas = buildSurpriseSections(noCoords, { mode: 'rr', near: false, wider: false });
  assert.ok(ideas.some(i => i.id === 'curated-nocoords'),
    'unknown distance must not exclude curated picks (no-coords sessions)');
});

test('a card never repeats across surprise sections', () => {
  const ideas = buildSurpriseSections(POOL, { mode: 'rr', near: true, wider: false });
  const ids = ideas.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---------- Talk of the town replaces the buzz shelf ----------
// The shelf it replaced routinely rendered two cards under a headline
// promising the talk of the town. These pin the minimum, the 80 km band the
// weekly store does NOT enforce on its own (it reaches 180 km), and the
// title-ownership rule that stops one happening holding two slots.

const tottPick = (id, over) => Object.assign({
  id, source: 'talk_of_town', title: `Happening ${id}`, category: 'general',
  description: 'this week', location: 'Toronto', distance_km: 10,
  date: '2026-09-26', rating: null, rating_count: null
}, over);

const FOUR_TOTT = Array.from({ length: 4 }, (_, i) => tottPick(`tott-${i}`));

test('the talk of the town shelf leads the feed when it has enough picks', () => {
  const ideas = buildSurpriseSections(POOL, { mode: 'rr', near: true, wider: false, tott: FOUR_TOTT });
  const shelf = ideas.filter(i => i.section === 'Talk of the town 🔥');
  assert.equal(shelf.length, 4);
  assert.equal(ideas[0].section, 'Talk of the town 🔥', 'it must lead, not trail');
});

test('a thin shelf is skipped rather than shipped', () => {
  for (const n of [0, 1, 2, 3]) {
    const ideas = buildSurpriseSections(POOL, {
      mode: 'rr', near: true, wider: false, tott: FOUR_TOTT.slice(0, n)
    });
    assert.equal(ideas.filter(i => i.section === 'Talk of the town 🔥').length, 0,
      `${n} pick(s) must not render a shelf`);
  }
});

test('the weekly store reaches 180 km; this feed still promises 80', () => {
  // Three near + one at 150 km: the far one is dropped, which takes the
  // shelf under the minimum, so no shelf at all. Better thin than a lie.
  const withFar = [...FOUR_TOTT.slice(0, 3), tottPick('tott-far', { distance_km: 150 })];
  const ideas = buildSurpriseSections(POOL, { mode: 'rr', near: true, wider: false, tott: withFar });
  assert.ok(!ideas.some(i => i.id === 'tott-far'), 'a 150 km pick broke the 80 km promise');
  for (const i of ideas) {
    assert.ok(i.distance_km == null || i.distance_km <= DRIVE_MAX_KM,
      `${i.id} at ${i.distance_km} km in "${i.section}"`);
  }
});

test('a far pick releases its pool twin instead of taking it down too', () => {
  // A LONE pool candidate, not POOL: the local shelf runs its picks through
  // sample(), which shuffles, so against a crowded pool whether this one card
  // wins a slot is a coin toss and the assertion flakes (~30% of runs). With
  // one candidate the feed falls under MIN_FEED, the backstop takes the pool
  // in order, and "did it survive the ownership filter" is the only variable
  // left — which is the thing this test is actually about.
  const twin = make('cal-cne', { title: 'Happening tott-far', distance_km: 7 });
  const withFar = [...FOUR_TOTT.slice(0, 3), tottPick('tott-far', { distance_km: 150 })];
  const ideas = buildSurpriseSections([twin], {
    mode: 'rr', near: true, wider: false, tott: withFar
  });
  assert.ok(ideas.some(i => i.id === 'cal-cne'),
    'the pool candidate should survive when the tott pick it duplicates is dropped');
});

test('a shown pick still removes its twin from a lone-candidate pool', () => {
  // The mirror of the test above on the same minimal pool, so the pair can
  // only differ by the ownership rule and not by which shelf got lucky.
  const twin = make('cal-cne', { title: 'Happening tott-0', distance_km: 7 });
  const ideas = buildSurpriseSections([twin], {
    mode: 'rr', near: true, wider: false, tott: FOUR_TOTT
  });
  assert.ok(!ideas.some(i => i.id === 'cal-cne'), 'a shown pick must own its title');
});

test('a shown pick owns its title, so one happening never holds two slots', () => {
  const twin = make('cal-dupe', { title: 'Happening tott-0', distance_km: 7 });
  const ideas = buildSurpriseSections([...POOL, twin], {
    mode: 'rr', near: true, wider: false, tott: FOUR_TOTT
  });
  assert.ok(!ideas.some(i => i.id === 'cal-dupe'), 'duplicate happening held a second slot');
  assert.ok(ideas.some(i => i.id === 'tott-0'), 'the talk of the town pick itself is missing');
});
