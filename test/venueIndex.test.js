// test/venueIndex.test.js — the pre-bought venue index answers feeds without
// Google. Pure: rows are injected, no network, no Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
const idx = require('../services/venueIndex');
const { MODE_PROMPTS, DINING_QUERY, CORRIDOR_QUERY } = require('../data/feedPrompts');
const { CELLS } = require('../data/venueCells');

const RH = CELLS.find(c => c.id === 'richmond-hill');
const MK = CELLS.find(c => c.id === 'markham');
const place = (id, lat, lng, title) => ({ place_id: id, title, lat, lng, rating: 4.5, rating_count: 200 });

test('the vocabulary is the feed prompts + theme queries, normalized, deduped', () => {
  assert.ok(idx.inVocabulary(MODE_PROMPTS.rr));
  assert.ok(idx.inVocabulary(DINING_QUERY.toUpperCase() + '  '));
  assert.ok(idx.inVocabulary('splash pad'));
  assert.ok(!idx.inVocabulary('rainy saturday with a 6 year old'));
  assert.equal(new Set(idx.VOCABULARY).size, idx.VOCABULARY.length);
  assert.ok(idx.VOCABULARY.length >= 40 && idx.VOCABULARY.length <= 60, `vocabulary size ${idx.VOCABULARY.length}`);
});

test('lookup unions covering cells, dedupes by place_id, keeps within radius', () => {
  idx._setRows([
    { cell: 'richmond-hill', query: DINING_QUERY, places: [place('a', 43.88, -79.44, 'A'), place('b', 43.87, -79.45, 'B'), place('far', 44.5, -79.7, 'Far')] },
    { cell: 'markham', query: DINING_QUERY, places: [place('b', 43.87, -79.45, 'B'), place('c', 43.86, -79.34, 'C')] }
  ]);
  const r = idx.lookup({ queries: [DINING_QUERY, 'rainy saturday'], lat: RH.lat, lng: RH.lng, radiusKm: 20 });
  assert.ok(r);
  assert.deepEqual(r.byQuery[DINING_QUERY].map(p => p.place_id), ['a', 'b', 'c']);
  assert.equal(r.byQuery['rainy saturday'], null, 'free text is not answered by the index');
  assert.ok(r.cells.includes('richmond-hill') && r.cells.includes('markham'));
  // Clones, not the stored objects.
  r.byQuery[DINING_QUERY][0].title = 'mutated';
  assert.equal(idx.lookup({ queries: [DINING_QUERY], lat: RH.lat, lng: RH.lng, radiusKm: 20 }).byQuery[DINING_QUERY][0].title, 'A');
});

test('outside the belt, or with nothing indexed nearby, lookup is null (live fallback)', () => {
  idx._setRows([{ cell: 'richmond-hill', query: DINING_QUERY, places: [place('a', 43.88, -79.44, 'A')] }]);
  assert.equal(idx.lookup({ queries: [DINING_QUERY], lat: 40.4168, lng: -3.7038, radiusKm: 20 }), null, 'Madrid');
  assert.equal(idx.lookup({ queries: [CORRIDOR_QUERY], lat: RH.lat, lng: RH.lng, radiusKm: 4 }), null, 'query not indexed here');
  assert.equal(idx.covers(RH.lat, RH.lng), true);
  assert.equal(idx.covers(40.4168, -3.7038), false);
});

test('a vocabulary query with no row nearby is reported null so the caller may buy it once', () => {
  idx._setRows([{ cell: 'markham', query: DINING_QUERY, places: [place('c', 43.86, -79.34, 'C')] }]);
  const r = idx.lookup({ queries: [DINING_QUERY, 'splash pad'], lat: MK.lat, lng: MK.lng, radiusKm: 10 });
  assert.ok(Array.isArray(r.byQuery[DINING_QUERY]));
  assert.equal(r.byQuery['splash pad'], null);
});

test('stale targets: missing rows first, core cells before the rest, then oldest', () => {
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const older = new Date(Date.now() - 50 * 24 * 3600 * 1000).toISOString();
  idx._setRows([
    { cell: 'richmond-hill', query: DINING_QUERY, places: [], fetched_at: old },
    { cell: 'hamilton', query: DINING_QUERY, places: [], fetched_at: older }
  ]);
  const t = idx.staleTargets({ cellIds: ['richmond-hill', 'hamilton'] });
  assert.equal(t.length, idx.VOCABULARY.length * 2);
  assert.ok(t[0].missing && t[0].cell.core, 'first target is a missing row in a core cell');
  const refreshes = t.filter(x => !x.missing);
  assert.deepEqual(refreshes.map(x => x.cell.id), ['hamilton', 'richmond-hill'], 'oldest existing row first');
});
