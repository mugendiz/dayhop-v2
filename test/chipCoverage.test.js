// test/chipCoverage.test.js — every filter chip opens onto something
// (routes/browse.js chipCoverage): thin categories are topped up from the
// pool, then the in-season curated catalog.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
const { chipCoverage } = require('../routes/browse');

test('an empty feed gets two in-season cruises in November (the Cruises chip was always empty)', () => {
  const out = chipCoverage([], [], 'rr', { isGta: true, dateWindow: { start: '2026-11-07', end: '2026-11-08' } });
  const cruises = out.filter(i => i.category === 'cruises').map(i => i.id);
  assert.equal(cruises.length, 2);
  assert.ok(!cruises.includes('cur-tall-ship-kajama'), 'the summer tall ship stays out in November');
  for (const i of out) assert.equal(i.section, 'More to explore 🧭', 'catch-all shelf, renamed by category on the page');
});

test('a chip that already has two ideas gets nothing, and nothing is duplicated', () => {
  const ideas = [{ id: 'a', category: 'water' }, { id: 'b', category: 'water' }];
  const pool = [{ id: 'a', category: 'water', title: 'A' }, { id: 'c', category: 'culture', title: 'C' }];
  const out = chipCoverage(ideas, pool, 'rr', { isGta: true, dateWindow: { start: '2026-11-07' } });
  assert.ok(!out.some(i => i.category === 'water'));
  assert.equal(out.filter(i => i.id === 'c').length, 1, 'the pool is used before the catalog');
  assert.equal(new Set(out.map(i => i.id)).size, out.length);
});
