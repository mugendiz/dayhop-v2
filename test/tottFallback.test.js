// test/tottFallback.test.js — "Talk of the town" must never silently vanish.
// It had one supply line (the weekly Grok store) and no floor, so a failed
// refresh or a week whose picks all finished took the shelf off the page with
// nothing saying why. Observed live 2026-10-01 and 2026-10-02: zero picks, in
// the busiest month of the year. These pin the floor, and pin what must NOT
// be allowed to wear the shelf's name.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSections } = require('../routes/browse');
const { torontoToday, addDays } = require('../services/spotlight');

const TODAY = torontoToday();
const SOON = addDays(TODAY, 3);
const PAST = addDays(TODAY, -3);
const FAR = addDays(TODAY, 40);
const SHELF = 'Talk of the town 🔥';

const ev = (id, over) => Object.assign({
  id, source: 'ticketmaster', title: `Outdoor Fair ${id}`, category: 'general',
  description: 'a street festival in the park', location: 'Toronto',
  date: SOON, distance_km: 6, rating: null, rating_count: null, wow: false
}, over);

const filler = n => ({
  id: `local-${n}`, source: 'google_places', title: `Local Venue ${n}`,
  category: 'general', description: 'a spot in town', location: 'Toronto',
  distance_km: n, rating: 4.0, rating_count: 20, wow: false
});

const build = (candidates, opts = {}) => buildSections(candidates, Object.assign({
  near: true, weather: null, part: 'afternoon', mode: 'rr',
  advisories: [], dateWindow: { start: TODAY, end: TODAY }
}, opts));

const shelf = ideas => ideas.filter(i => i.section === SHELF).map(i => i.id);

test('the live store still wins when it has picks', () => {
  const tott = [1, 2, 3, 4].map(i => ev(`tott-${i}`, { source: 'talk_of_town', tott: true }));
  const ideas = build([...Array.from({ length: 6 }, (_, i) => filler(i + 1)), ev('pool-1'), ev('pool-2'), ev('pool-3')], { tott });
  const got = shelf(ideas);
  assert.ok(got.length > 0, 'the shelf should render from the store');
  for (const id of got) assert.ok(id.startsWith('tott-'), `${id} displaced a real store pick`);
});

test('an empty store falls back to real dated outdoor events', () => {
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    ev('fair-1'), ev('fair-2'), ev('fair-3')
  ], { tott: [] });
  const got = shelf(ideas);
  assert.equal(got.length, 3, 'the floor should carry the shelf');
  assert.deepEqual(got.sort(), ['fair-1', 'fair-2', 'fair-3']);
});

test('indoor listings never wear this shelf', () => {
  // October's dated pool is mostly gallery exhibits. A shelf promising the
  // talk of the town must not serve a room of paintings.
  const gallery = n => ev(`gallery-${n}`, {
    title: `Gallery Exhibit ${n}`, description: 'an indoor museum gallery exhibition'
  });
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    gallery(1), gallery(2), gallery(3), gallery(4)
  ], { tott: [] });
  assert.equal(shelf(ideas).length, 0, 'indoor exhibits reached the shelf');
});

test('below three the shelf is skipped rather than shipped thin', () => {
  for (const n of [0, 1, 2]) {
    const ideas = build([
      ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
      ...Array.from({ length: n }, (_, i) => ev(`fair-${i}`))
    ], { tott: [] });
    assert.equal(shelf(ideas).length, 0, `${n} event(s) must not render a shelf`);
  }
});

test('the floor respects the same 10-day window as the store', () => {
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    ev('over', { date: PAST }), ev('far', { date: FAR }), ev('far2', { date: FAR }),
    ev('ok-1'), ev('ok-2'), ev('ok-3')
  ], { tott: [] });
  const got = shelf(ideas);
  assert.ok(!got.includes('over'), 'a finished event reached the shelf');
  assert.ok(!got.includes('far') && !got.includes('far2'), 'an event 40 days out is not this week');
  assert.ok(got.includes('ok-1'), 'in-window events should carry it');
});

test('a card never appears on both the floor and the dated shelf', () => {
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    ev('fair-1'), ev('fair-2'), ev('fair-3'), ev('fair-4')
  ], { tott: [] });
  const ids = ideas.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'a card was served twice');
});
