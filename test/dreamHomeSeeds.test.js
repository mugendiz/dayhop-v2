// test/dreamHomeSeeds.test.js — Dream Homes entered from chat
// (data/dreamHomeSeeds.js): each seed is saved once as an unpublished draft
// marked found_by "claude", never reaches the public rail on its own, and a
// draft an admin deletes stays deleted. Offline: in-memory store, no Maps key.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;

const dh = require('../services/dreamHomes');
const seeds = require('../data/dreamHomeSeeds');
const { lint } = require('../services/copyStyle');

test('every seed is a valid draft that only lacks what an admin must add', () => {
  const keys = new Set();
  for (const s of seeds) {
    assert.ok(s.key && !keys.has(s.key), `seed key "${s.key}" is missing or reused`);
    keys.add(s.key);
    assert.deepEqual(dh.normalize(s.home).errors, [], `${s.key} is not a valid draft`);
    // Publishing may only be blocked by a missing open house time: the
    // address, area, price and source link must already be there.
    const left = dh.normalize(s.home, { forPublish: true }).errors.filter(e => !/open house time/.test(e));
    assert.deepEqual(left, [], `${s.key} is missing facts an admin should not have to look up`);
    assert.match(s.home.source_url, /^https:\/\//);
    assert.doesNotMatch(s.home.source_url, /realtor\.ca|housesigma|zoocasa/i, 'a source the finder refuses');
    for (const text of [s.home.note || '', s.check || '']) {
      assert.deepEqual(lint(text).map(v => v.detail), [], `${s.key} copy breaks the house style`);
    }
  }
});

test('applySeeds saves each seed once, as a draft, and a deleted draft stays deleted', async () => {
  dh._mem.clear();
  dh._seedMem.clear();
  const one = [{ key: 'test-seed-1', home: { address: '1 Test Street, Testville', area: 'Test Heights', price: 1000001, source_url: 'https://example.com/1', windows: [] }, check: 'Check the price.' }];

  const added = await dh.applySeeds(one);
  assert.equal(added.length, 1);
  const draft = await dh.get(added[0]);
  assert.equal(draft.published, false);
  assert.equal(draft.found_by, 'claude');
  assert.equal(draft.found_check, 'Check the price.');
  assert.equal(dh.statusOf(draft), 'draft');
  assert.deepEqual(await dh.listPublic(), [], 'a seeded draft must not reach the public rail');

  assert.deepEqual(await dh.applySeeds(one), [], 'a second boot must not add it again');
  await dh.remove(added[0]);
  assert.deepEqual(await dh.applySeeds(one), [], 'a draft an admin deleted came back');
  assert.equal((await dh.listAdmin()).length, 0);
});

test('the shipped seeds load as drafts without errors', async () => {
  dh._mem.clear();
  dh._seedMem.clear();
  const added = await dh.applySeeds(seeds);
  assert.equal(added.length, seeds.length);
  const admin = await dh.listAdmin();
  assert.ok(admin.every(h => h.status === 'draft' && h.found_by === 'claude'));
  dh._mem.clear();
  dh._seedMem.clear();
});
