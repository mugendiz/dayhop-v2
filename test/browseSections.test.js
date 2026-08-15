// test/browseSections.test.js — invariants of the browse feed's shelf
// builder, pure function over candidate objects (no network, no cache).
// Pins the guarantees hand-verified on 2026-08-15: the "Worth the drive"
// shelf is summer-only and never outranks local shelves, "Within 15
// minutes" stays local, shelter advisories suppress outdoor shelves, and a
// card never repeats across sections.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSections } = require('../routes/browse');

// Titles deliberately avoid the trail/food/thrill/calm vocabularies so the
// classifier regexes don't reshuffle the pool under the test.
const local = n => ({
  id: `local-${n}`, source: 'google_places', title: `Local Venue ${n}`,
  category: 'general', description: 'a spot in town', location: 'Toronto',
  distance_km: n, rating: 4.0, rating_count: 20, wow: false
});
const farWow = {
  id: 'far-wow', source: 'curated_catalog', title: 'Big Icon Destination',
  category: 'general', description: 'a famous day out', location: 'Niagara',
  distance_km: 70, wow: true
};
const farRated = {
  id: 'far-rated', source: 'google_places', title: 'Acclaimed Far Spot',
  category: 'general', description: 'worth it', location: 'Collingwood',
  distance_km: 45, rating: 4.7, rating_count: 300, wow: false
};
const farMediocre = {
  id: 'far-meh', source: 'google_places', title: 'Distant Average Spot',
  category: 'general', description: 'fine', location: 'Barrie',
  distance_km: 60, rating: 3.9, rating_count: 12, wow: false
};

const CANDIDATES = [...Array.from({ length: 8 }, (_, i) => local(i + 1)), farWow, farRated, farMediocre];
const SUMMER = { start: '2026-07-15', end: '2026-07-15' };
const WINTER = { start: '2026-12-12', end: '2026-12-12' };
const opts = over => Object.assign(
  { near: true, weather: null, part: 'morning', mode: 'rr', advisories: [], spotlight: null, dateWindow: SUMMER },
  over);

const sectionsOf = ideas => [...new Set(ideas.map(i => i.section))];
const inSection = (ideas, label) => ideas.filter(i => i.section === label);

test('summer feed has a Worth the drive shelf with only genuine far picks', () => {
  const ideas = buildSections(CANDIDATES, opts({}));
  const wd = inSection(ideas, 'Worth the drive 🚗');
  assert.ok(wd.length > 0, 'shelf missing in summer');
  for (const i of wd) {
    assert.ok(i.distance_km > 40, `${i.id} at ${i.distance_km} km is not far`);
  }
  assert.ok(!wd.some(i => i.id === 'far-meh'), 'mediocre far spot slipped in');
});

test('Worth the drive never appears on a winter date', () => {
  const ideas = buildSections(CANDIDATES, opts({ dateWindow: WINTER }));
  assert.ok(!sectionsOf(ideas).includes('Worth the drive 🚗'));
});

test('Worth the drive sits below Within 15 minutes', () => {
  const ideas = buildSections(CANDIDATES, opts({}));
  const firstLocal = ideas.findIndex(i => i.section === 'Within 15 minutes 📍');
  const firstDrive = ideas.findIndex(i => i.section === 'Worth the drive 🚗');
  assert.ok(firstLocal !== -1 && firstDrive !== -1, 'both shelves must exist for this test');
  assert.ok(firstLocal < firstDrive, 'far shelf outranked the local shelf');
});

test('Within 15 minutes only holds candidates within 10 km', () => {
  const ideas = buildSections(CANDIDATES, opts({}));
  for (const i of inSection(ideas, 'Within 15 minutes 📍')) {
    assert.ok(i.distance_km != null && i.distance_km <= 10, `${i.id} at ${i.distance_km} km`);
  }
});

test('a card never repeats across sections', () => {
  for (const mode of ['rr', 'adventure']) {
    for (const near of [true, false]) {
      const ideas = buildSections(CANDIDATES, opts({ mode, near }));
      const ids = ideas.map(i => i.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate card (mode=${mode}, near=${near})`);
    }
  }
});

test('a shelter advisory suppresses the outdoor shelves', () => {
  const advisories = [{ severity: 'warning', effects: { avoid_outdoor: true } }];
  const ideas = buildSections(CANDIDATES, opts({ advisories }));
  const labels = sectionsOf(ideas);
  assert.ok(!labels.includes('Worth the drive 🚗'), 'drive shelf under shelter advisory');
  assert.ok(!labels.includes('Trail time 🥾'), 'trail shelf under shelter advisory');
});

test('adventure and R&R branches both gate the drive shelf on summer', () => {
  for (const mode of ['rr', 'adventure']) {
    const summer = buildSections(CANDIDATES, opts({ mode, near: false }));
    const winter = buildSections(CANDIDATES, opts({ mode, near: false, dateWindow: WINTER }));
    assert.ok(sectionsOf(summer).includes('Worth the drive 🚗'), `${mode}: missing in summer`);
    assert.ok(!sectionsOf(winter).includes('Worth the drive 🚗'), `${mode}: present in winter`);
  }
});
