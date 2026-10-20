// test/catalog.test.js — schema and data-quality gates for the curated
// catalog. Every entry that ships must be well-formed, unique, and
// coordinate-resolved (coord-less entries dodge distance ranking entirely —
// the original Niagara-Takes-Flight ubiquity bug).
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../data/curatedCatalog');
const coords = require('../data/catalogCoords.json');

const CATEGORIES = new Set(['worldcup', 'kids', 'patios', 'water', 'cruises', 'adventures', 'culture', 'food', 'general']);
const COST_TIERS = new Set(['free', '$', '$$', '$$$']);
const SEASONALS = new Set([null, 'summer', 'winter']);

test('ids are unique and cur- prefixed', () => {
  const ids = catalog.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  for (const id of ids) assert.match(id, /^cur-[a-z0-9-]+$/, `bad id: ${id}`);
});

test('every entry matches the documented shape', () => {
  for (const e of catalog) {
    assert.ok(e.title && typeof e.title === 'string', `${e.id}: title`);
    assert.ok(CATEGORIES.has(e.category), `${e.id}: category "${e.category}"`);
    assert.ok(Array.isArray(e.tags) && e.tags.length > 0, `${e.id}: tags`);
    assert.ok(e.location && e.venue, `${e.id}: location/venue`);
    assert.ok(typeof e.description === 'string' && e.description.length > 0 &&
      e.description.length <= 180, `${e.id}: description ${e.description.length} chars (max 180)`);
    assert.ok(COST_TIERS.has(e.cost_tier), `${e.id}: cost_tier "${e.cost_tier}"`);
    assert.ok(e.good_for_ages, `${e.id}: good_for_ages`);
    assert.match(String(e.maps_url), /^https:\/\//, `${e.id}: maps_url`);
    assert.ok(SEASONALS.has(e.seasonal ?? null), `${e.id}: seasonal "${e.seasonal}"`);
    assert.ok(typeof e.wow === 'boolean', `${e.id}: wow`);
  }
});

test('every entry has coordinates (inline or geocoded)', () => {
  const missing = catalog.filter(e =>
    !(e.lat != null && e.lng != null) &&
    !(coords[e.id] && coords[e.id].lat != null && coords[e.id].lng != null));
  assert.deepEqual(missing.map(e => e.id), [],
    'run: node scripts/geocode-catalog.js');
});

test('coordinates sit inside the southern-Ontario sanity box', () => {
  const BOX = { latMin: 41.6, latMax: 46.5, lngMin: -84.0, lngMax: -74.0 };
  for (const e of catalog) {
    const c = e.lat != null ? e : coords[e.id];
    assert.ok(c.lat >= BOX.latMin && c.lat <= BOX.latMax &&
      c.lng >= BOX.lngMin && c.lng <= BOX.lngMax,
      `${e.id}: ${c.lat},${c.lng} outside sanity box`);
  }
});

test('opened_at entries are real dates and not future', () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  for (const e of catalog) {
    if (!e.opened_at) continue;
    assert.match(e.opened_at, /^\d{4}-\d{2}-\d{2}$/, `${e.id}: opened_at "${e.opened_at}"`);
    assert.ok(e.opened_at <= today, `${e.id}: opened_at in the future`);
  }
});

test('adults-only spas sink for a kids prompt and lead a sauna prompt', () => {
  const { scoreCandidates } = require('../services/relevance');
  const spa = catalog.find(e => e.id === 'cur-thermea-whitby');
  const park = { title: 'Rouge Valley family trail', category: 'kids', tags: ['trail', 'family'], description: '', good_for_ages: 'all ages' };
  const run = prompt => scoreCandidates([{ ...spa }, { ...park }], { prompt }).map(c => c.score);
  const [spaKids, parkKids] = run('something with the kids this weekend');
  assert.ok(spaKids < parkKids, `kids prompt: spa ${spaKids} should trail park ${parkKids}`);
  const [spaSauna, parkSauna] = run('sauna this weekend');
  assert.ok(spaSauna > parkSauna, `sauna prompt: spa ${spaSauna} should lead park ${parkSauna}`);
});
