// test/apiCache.test.js — the cost-control invariants for metered APIs.
// No network, no Supabase (service key absent → L1 + in-flight only).
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
const apiCache = require('../services/apiCache');

test.beforeEach(() => { apiCache._reset(); delete process.env.MAPS_DAILY_BUDGET_USD; });

test('concurrent callers of one key share a single upstream fetch', async () => {
  let fetches = 0;
  const fetch = () => new Promise(resolve => setTimeout(() => { fetches++; resolve({ n: fetches }); }, 20));
  const results = await Promise.all(
    Array.from({ length: 25 }, () => apiCache.cached({ key: 'k', ttlMs: 60000, fetch }))
  );
  assert.equal(fetches, 1);
  assert.ok(results.every(r => r.n === 1));
});

test('a fresh entry is served from memory without refetching', async () => {
  let fetches = 0;
  const fetch = async () => ++fetches;
  await apiCache.cached({ key: 'a', ttlMs: 60000, fetch });
  await apiCache.cached({ key: 'a', ttlMs: 60000, fetch });
  assert.equal(fetches, 1);
});

test('null is a cacheable answer (a stable miss is not re-bought)', async () => {
  let fetches = 0;
  const fetch = async () => { fetches++; return null; };
  assert.equal(await apiCache.cached({ key: 'miss', ttlMs: 60000, fetch }), null);
  assert.equal(await apiCache.cached({ key: 'miss', ttlMs: 60000, fetch }), null);
  assert.equal(fetches, 1);
});

test('an expired entry is served stale when the refetch fails', async () => {
  let calls = 0;
  const fetch = async () => { calls++; if (calls > 1) throw new Error('upstream down'); return 'v1'; };
  assert.equal(await apiCache.cached({ key: 's', ttlMs: 1, fetch }), 'v1');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(await apiCache.cached({ key: 's', ttlMs: 1, fetch }), 'v1');
  assert.equal(calls, 2);
});

test('a failed fill does not stick — the next caller retries', async () => {
  let calls = 0;
  const fetch = async () => { calls++; if (calls === 1) throw new Error('boom'); return 'ok'; };
  await assert.rejects(apiCache.cached({ key: 'f', ttlMs: 60000, fetch }));
  assert.equal(await apiCache.cached({ key: 'f', ttlMs: 60000, fetch }), 'ok');
});

test('spend() enforces the daily USD budget and reports usage', () => {
  process.env.MAPS_DAILY_BUDGET_USD = '0.1';
  apiCache.spend('text_search_ent_atm'); // 0.04
  apiCache.spend('text_search_ent_atm'); // 0.08
  assert.throws(() => apiCache.spend('text_search_ent_atm'), err => err.code === 'BUDGET_EXCEEDED');
  apiCache.spend('place_photo'); // 0.087 — cheaper SKUs still fit under the cap
  const s = apiCache.usageStatus();
  assert.equal(s.calls.text_search_ent_atm, 2);
  assert.equal(s.calls.place_photo, 1);
  assert.equal(s.blocked, 1);
  assert.ok(s.spent_usd > 0.08 && s.spent_usd < 0.1);
});

test('a budget-blocked refetch still serves the stale value', async () => {
  process.env.MAPS_DAILY_BUDGET_USD = '0.05';
  const fetch = async () => { apiCache.spend('text_search_ent_atm'); return 'bought'; };
  assert.equal(await apiCache.cached({ key: 'b', ttlMs: 1, fetch }), 'bought');
  await new Promise(r => setTimeout(r, 5));
  // Second buy would cross the cap → BUDGET_EXCEEDED → stale served.
  assert.equal(await apiCache.cached({ key: 'b', ttlMs: 1, fetch }), 'bought');
  assert.equal(apiCache.usageStatus().blocked, 1);
});
