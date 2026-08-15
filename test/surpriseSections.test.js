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

// Enough in-band candidates that the MIN_FEED backstop never fires — the
// backstop deliberately draws from the raw pool and is exempt from the band.
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
