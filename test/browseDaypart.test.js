// test/browseDaypart.test.js — cost invariants for the browse pool.
// The pool (and therefore the metered Google searches behind it) must be the
// same all day: daypart is applied AFTER the fetch, as pure re-ordering.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.WARM_POOL = 'off';
const { cacheKey, syntheticPrompt, daypartOrder } = require('../routes/browse');

test('the pool cache key carries no daypart', () => {
  const a = cacheKey('Markham', null, 'rr', null);
  assert.equal(a, 'markham||rr|');
  assert.match(a, /^[^|]+\|[^|]*\|(rr|adventure)\|[^|]*$/);
  const withCoords = cacheKey('Markham', { lat: 43.8561, lng: -79.337 }, 'adventure', { start: '2026-09-05', end: '2026-09-06' });
  assert.equal(withCoords, 'markham|43.86,-79.34|adventure|2026-09-05..2026-09-06');
});

test('one synthetic prompt per mode, so one search set per city per TTL', () => {
  assert.equal(syntheticPrompt('rr'), syntheticPrompt('rr'));
  assert.notEqual(syntheticPrompt('rr'), syntheticPrompt('adventure'));
  assert.equal(syntheticPrompt('bogus'), syntheticPrompt('rr'));
  assert.equal(syntheticPrompt.length, 1); // no daypart argument any more
});

test('daypartOrder lifts time-of-day matches without reordering the rest', () => {
  const pool = [
    { id: 'a', title: 'Edwards Gardens' },
    { id: 'b', title: 'High Park trails' },
    { id: 'c', title: 'Rooftop patio dinner spot' },
    { id: 'd', title: 'Escape room downtown' },
    { id: 'e', title: 'Lakeside beach' }
  ];
  const evening = daypartOrder(pool, 'evening').map(c => c.id);
  assert.deepEqual(evening, ['c', 'd', 'a', 'b', 'e']);
  const morning = daypartOrder(pool, 'morning').map(c => c.id);
  assert.deepEqual(morning, ['a', 'b', 'c', 'd', 'e']);
  // Unknown daypart: identity. Input untouched either way.
  assert.deepEqual(daypartOrder(pool, 'noon').map(c => c.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(pool.map(c => c.id), ['a', 'b', 'c', 'd', 'e']);
});

test('the lift is bounded — a strong pick is never buried below rank 8 by a weak match', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: i === 11 ? 'sunset patio' : `Park ${i}` }));
  const out = daypartOrder(pool, 'evening').map(c => c.id);
  // Score 11 − 8 = 3 ties with rank 3, and ties keep original order — so
  // it lands at index 4: climbed 7 ranks, nowhere near the top.
  assert.equal(out.indexOf('11'), 4);
  assert.equal(out[0], '0');
});
