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

// ---------- Talk of the town + the Top-5 layout (2026-09-07) ----------
const tottPick = (n, over = {}) => Object.assign({
  id: `tott-${n}`, source: 'talk_of_town', tott: true, title: `Happening ${n}`,
  category: 'general', description: 'everyone is going', location: 'Toronto',
  date: '2026-07-15', date_end: '2026-07-19', distance_km: 4 + n, rank: n, image_url: 'https://img/x.jpg'
}, over);
const TOTT = Array.from({ length: 6 }, (_, i) => tottPick(i + 1));

test('full layout: Talk of the town is its own shelf, third from the top, five deep', () => {
  const ideas = buildSections(CANDIDATES, opts({ tott: TOTT }));
  const shelf = inSection(ideas, 'Talk of the town 🔥');
  assert.equal(shelf.length, 5);
  assert.ok(shelf.every(i => i.tott === true && i.date_end === '2026-07-19'));
  const sections = sectionsOf(ideas);
  assert.ok(sections.indexOf('Talk of the town 🔥') < sections.indexOf('Within 15 minutes 📍'));
  assert.ok(!ideas.some(i => i.fold), 'nothing folds in the full layout');
});

test('no picks → no Talk of the town shelf, and the feed is unchanged', () => {
  const ideas = buildSections(CANDIDATES, opts({ tott: [] }));
  assert.ok(!sectionsOf(ideas).includes('Talk of the town 🔥'));
  assert.deepEqual(ideas.map(i => i.id), buildSections(CANDIDATES, opts({})).map(i => i.id));
});

test('a pool candidate with a Talk of the town title leaves the pool (no double booking)', () => {
  const dup = Object.assign(local(20), { title: 'Happening 1' });
  const ideas = buildSections([...CANDIDATES, dup], opts({ tott: TOTT }));
  assert.equal(ideas.filter(i => i.title === 'Happening 1').length, 1);
  assert.equal(ideas.find(i => i.title === 'Happening 1').source, 'talk_of_town');
});

test('top5 layout: Top 5 → spotlight slot → Talk of the town, everything after folds', () => {
  const ideas = buildSections(CANDIDATES, opts({ tott: TOTT, layout: 'top5' }));
  const sections = sectionsOf(ideas);
  assert.deepEqual(sections.slice(0, 3), ['Top 5 picks 🏆', 'In the spotlight 📣', 'Talk of the town 🔥']);
  assert.equal(inSection(ideas, 'Top 5 picks 🏆').length, 5);
  const spot = inSection(ideas, 'In the spotlight 📣');
  assert.equal(spot.length, 1);
  assert.equal(spot[0].id, 'tott-1', 'the most talked-about pick takes the slot');
  const shelf = inSection(ideas, 'Talk of the town 🔥');
  assert.equal(shelf.length, 5, 'the shelf refills to five from rank 2-6');
  assert.ok(!shelf.some(i => i.id === 'tott-1'));
  const head = ideas.slice(0, 11);
  assert.ok(head.every(i => !i.fold), 'the first eleven cards are open');
  assert.ok(ideas.slice(11).length > 0 && ideas.slice(11).every(i => i.fold === true), 'the rest folds');
  const ids = ideas.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'a card never repeats across sections');
});

test('top5 layout: an active sponsor owns slot 6 and the spotlight steps aside', () => {
  const sponsor = { id: 'spon-a', source: 'sponsor', sponsored: true, title: 'Partner Place', category: 'general', description: 'x', location: 'Toronto', distance_km: 3 };
  const ideas = buildSections(CANDIDATES, opts({ tott: TOTT, layout: 'top5', sponsor }));
  const sections = sectionsOf(ideas);
  assert.deepEqual(sections.slice(0, 3), ['Top 5 picks 🏆', 'Partner pick · Sponsored ⭐', 'Talk of the town 🔥']);
  assert.ok(!sections.includes('In the spotlight 📣'));
  assert.equal(inSection(ideas, 'Talk of the town 🔥').length, 5);
});

test('top5 layout without picks: Top 5 then the classic shelves, all folded', () => {
  const ideas = buildSections(CANDIDATES, opts({ tott: [], layout: 'top5' }));
  assert.equal(sectionsOf(ideas)[0], 'Top 5 picks 🏆');
  assert.ok(!sectionsOf(ideas).includes('Talk of the town 🔥'));
  assert.ok(!sectionsOf(ideas).includes('In the spotlight 📣'));
  assert.ok(ideas.slice(5).every(i => i.fold === true));
});

test('top5 layout under a shelter advisory keeps Top 5 indoor and drops the sponsor slot', () => {
  const sheltered = CANDIDATES.map((c, i) => i % 2 ? Object.assign({}, c, { description: 'an indoor museum gallery' }) : c);
  const advisories = [{ severity: 'warning', effects: { avoid_outdoor: true } }];
  const sponsor = { id: 'spon-a', source: 'sponsor', sponsored: true, title: 'Partner Place', category: 'general', description: 'x', location: 'Toronto' };
  const ideas = buildSections(sheltered, opts({ tott: TOTT, layout: 'top5', advisories, sponsor }));
  assert.ok(!ideas.some(i => i.sponsored), 'sponsor suppressed under shelter');
  assert.equal(sectionsOf(ideas)[1], 'In the spotlight 📣');
});
