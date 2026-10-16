// test/catalogReach.test.js — the curated catalog has to be able to REACH a
// feed. Before this, catalogCandidates cut ~120 entries down to 12 purely by
// text score against a fixed synthetic prompt, so the same twelve won every
// day and every worth_trip entry in the catalog scored outside the top 40.
// "Worth the drive" was therefore built from whatever a nearby Places search
// returned, which is by definition not day trips, and a hand-added entry was
// invisible forever. No network: pure over the catalog data plus a prompt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { catalogCandidates, SOURCE_CAPS } = require('../services/candidates');
const { buildSections } = require('../routes/browse');
const { MODE_PROMPTS } = require('../data/feedPrompts');
const catalog = require('../data/curatedCatalog');

const CAP = SOURCE_CAPS.curated_catalog;
const pick = mode => catalogCandidates(MODE_PROMPTS[mode], [], CAP, { isGta: true });

test('worth_trip survives normalization', () => {
  // It was set in data/curatedCatalog.js and read by relevance.js and
  // routes/browse.js, but dropped in between, so it was dead in both.
  const flagged = catalog.filter(e => e.worth_trip === true).map(e => e.id);
  assert.ok(flagged.length > 0, 'the catalog should have day-trip entries at all');

  const seen = [...pick('rr'), ...pick('adventure')];
  const carried = seen.filter(c => c.worth_trip === true);
  assert.ok(carried.length > 0, 'no candidate carried worth_trip out of normalization');
  for (const c of carried) {
    assert.ok(flagged.includes(c.id), `${c.id} carried worth_trip but is not flagged in the catalog`);
  }
});

test('every mode reserves day-trip picks the text score would have cut', () => {
  for (const mode of ['rr', 'adventure']) {
    const out = pick(mode);
    assert.ok(out.length <= CAP, `${mode}: ${out.length} exceeds the cap`);
    assert.ok(out.some(c => c.worth_trip === true),
      `${mode}: not one day-trip pick reached the pool, which is how the shelf starved`);
  }
});

test('the cut never returns duplicates across its three slot groups', () => {
  for (const mode of ['rr', 'adventure']) {
    const ids = pick(mode).map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${mode}: duplicate ids across slot groups`);
  }
});

test('relevance still leads: the best text fit is not displaced by a reserve', () => {
  // The reserves take the tail of the cap, never the head. If a reserve could
  // outrank the best fit, the feed would stop matching the mode it is in.
  const adventure = pick('adventure').map(c => c.id);
  assert.equal(adventure[0], 'cur-treetop-trekking',
    'the top adventure fit should still lead the catalog slice');
});

test('a reserved day-trip pick reaches the Worth the drive shelf', () => {
  // The other half of the chain: reaching the pool is worth nothing if the
  // shelf still will not take it.
  const filler = n => ({
    id: `local-${n}`, source: 'google_places', title: `Local Venue ${n}`,
    category: 'general', description: 'a spot in town', location: 'Toronto',
    distance_km: n, rating: 4.0, rating_count: 20, wow: false
  });
  const dayTrip = {
    id: 'cur-daytrip', source: 'curated_catalog', title: 'An Orchard An Hour Out',
    category: 'kids', description: 'apples and a train', location: 'Winona',
    distance_km: 60, rating: null, rating_count: null, wow: false, worth_trip: true
  };
  const ideas = buildSections([...Array.from({ length: 8 }, (_, i) => filler(i + 1)), dayTrip], {
    near: true, weather: null, part: 'afternoon', mode: 'rr',
    advisories: [], dateWindow: { start: '2026-09-28', end: '2026-09-28' }
  });
  const shelf = ideas.filter(i => i.section === 'Worth the drive 🚗').map(i => i.id);
  assert.ok(shelf.includes('cur-daytrip'),
    'worth_trip alone must earn the shelf, with no rating, exactly as isWorthDrive documents');
});
