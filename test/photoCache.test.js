// test/photoCache.test.js — card photos are bought once per PLACE and
// shared: the per-place key, the in-feed inline of already-paid URIs, the
// gallery exception, and the nightly warm's target list. No network, no
// Supabase (service key absent → L1 only).
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
const apiCache = require('../services/apiCache');
const maps = require('../services/googleMaps');
const { warmTargets } = require('../services/photoWarm');

const url = (place, ref, extra = '') => `/api/photo?name=${encodeURIComponent(`places/${place}/photos/${ref}`)}${extra}`;

test.beforeEach(() => apiCache._reset());

test('two photo refs of one place share one card-photo key', () => {
  assert.equal(maps.leadKeyFromUrl(url('P1', 'refA')), maps.leadKeyFromUrl(url('P1', 'refB')));
  assert.notEqual(maps.leadKeyFromUrl(url('P1', 'refA')), maps.leadKeyFromUrl(url('P2', 'refA')));
});

test('gallery photos (g=1) and non-Google URLs are not card photos', () => {
  assert.equal(maps.leadKeyFromUrl(url('P1', 'refA', '&g=1')), null);
  assert.equal(maps.leadKeyFromUrl('https://img.evbuc.com/x.jpg'), null);
  assert.equal(maps.leadKeyFromUrl('/img/heroes/x.webp'), null);
  assert.notEqual(maps.photoCacheKey('places/P1/photos/a', { lead: false }), maps.photoCacheKey('places/P1/photos/b', { lead: false }));
});

test('peekMany returns only fresh entries and never fetches', async () => {
  await apiCache.cached({ key: 'k1', ttlMs: 60000, fetch: async () => 'v1' });
  await apiCache.cached({ key: 'k2', ttlMs: -1, fetch: async () => 'v2' });
  const got = await apiCache.peekMany(['k1', 'k2', 'k3']);
  assert.deepEqual([...got.entries()], [['k1', 'v1']]);
});

test('a paid card photo is inlined for every later feed, whatever ref it arrives with', async () => {
  const paid = 'https://lh3.googleusercontent.com/p/abc=w800';
  await apiCache.cached({ key: maps.leadKeyFromUrl(url('P1', 'old')), ttlMs: 60000, fetch: async () => paid });
  const ideas = [
    { id: 'a', image_url: url('P1', 'newRef') },        // same place, new ref from a later search
    { id: 'b', image_url: url('P2', 'x') },             // nobody paid yet: stays on the proxy
    { id: 'c', image_url: 'https://img.evbuc.com/e.jpg' }
  ];
  const n = await maps.inlineCachedPhotos(ideas);
  assert.equal(n, 1);
  assert.equal(ideas[0].image_url, paid);
  assert.equal(ideas[1].image_url, url('P2', 'x'));
  assert.equal(ideas[2].image_url, 'https://img.evbuc.com/e.jpg');
});

test('warm targets: core cells only, ranked round-robin, deduped by place', () => {
  const cells = [
    { id: 'a', lat: 43.6, lng: -79.4, radiusKm: 8, core: true },
    { id: 'b', lat: 43.8, lng: -79.4, radiusKm: 8, core: true },
    { id: 'far', lat: 45, lng: -75, radiusKm: 8, core: false }
  ];
  const places = cell => [1, 2, 3].map(i => ({ title: `${cell}${i}`, image_url: url(`${cell}${i}`, 'r') }))
    .concat([{ title: 'shared', image_url: url('SHARED', 'r') }, { title: 'no photo', image_url: null }]);
  const lookup = ({ queries, lat }) => {
    const cell = lat < 43.7 ? 'A' : lat < 44 ? 'B' : 'FAR';
    const byQuery = {};
    queries.forEach(q => { byQuery[q] = places(cell); });
    return { byQuery };
  };
  const t = warmTargets({ today: '2026-12-12', lookup, cells });
  const titles = t.map(x => x.title);
  assert.ok(!titles.some(x => x.startsWith('FAR')), 'non-core cells are not warmed');
  assert.equal(titles.filter(x => x === 'shared').length, 1, 'one place, one target');
  assert.deepEqual(titles.slice(0, 2), ['A1', 'B1'], 'rank 1 of every cell before rank 2 of any');
  assert.ok(!titles.includes('no photo'));
});
