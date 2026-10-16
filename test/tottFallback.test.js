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

// ---------- a run is not a day ----------
// The Royal Duck pop-up at Upper Canada Mall runs 2026-10-03 to 2026-11-01.
// A 29-day run is the first thing in the data long enough to expose three
// places that treated an event as finished the morning after it opened,
// because each filtered on the START date: the curated-events pool filter,
// this floor, and the floor's hard-coded horizon that stopped matching
// WINDOW_DAYS when the window moved to 21.
const talkOfTown = require('../services/talkOfTown');

const run = (id, start, end) => ({
  id, source: 'curated', title: `Bounce Park ${id}`, category: 'kids',
  description: 'giant inflatable castles in the parking lot, outdoor',
  location: 'Newmarket', date: start, date_end: end,
  distance_km: 46, rating: null, rating_count: null, wow: false
});

test('a multi-week run still shows once it has started', () => {
  const started = addDays(TODAY, -9);          // opened over a week ago
  const ends = addDays(TODAY, 20);             // still on for weeks
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    run('duck', started, ends), run('b', started, ends), run('c', started, ends)
  ], { tott: [] });
  assert.ok(shelf(ideas).includes('duck'),
    'an event in the middle of its run was treated as over');
});

test('a run that has genuinely ended does not show', () => {
  const ended = addDays(TODAY, -2);
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    run('over', addDays(TODAY, -30), ended),
    run('a', TODAY, addDays(TODAY, 5)), run('b', TODAY, addDays(TODAY, 5)),
    run('c', TODAY, addDays(TODAY, 5))
  ], { tott: [] });
  assert.ok(!shelf(ideas).includes('over'), 'a finished run reached the shelf');
});

test('the floor borrows its horizon from the store instead of restating it', () => {
  // Hard-coding this is how the floor and the shelf came to disagree about
  // "this week" when WINDOW_DAYS moved from 10 to 21.
  const nearEdge = addDays(TODAY, talkOfTown.WINDOW_DAYS - 1);
  const pastEdge = addDays(TODAY, talkOfTown.WINDOW_DAYS + 5);
  const ideas = build([
    ...Array.from({ length: 6 }, (_, i) => filler(i + 1)),
    run('edge', nearEdge, nearEdge), run('a', TODAY, TODAY), run('b', TODAY, TODAY),
    run('far', pastEdge, pastEdge)
  ], { tott: [] });
  const got = shelf(ideas);
  assert.ok(got.includes('edge'), 'a pick inside the store window was refused by the floor');
  assert.ok(!got.includes('far'), 'a pick past the window reached the floor');
});

// Observed live on 2026-10-15: the loose outdoor test let these wear the
// shelf's name. "park" matched inside other words and nothing checked for a
// class, a competition or a virtual venue.
test('classes, competitions, virtual and gallery listings never make the floor', () => {
  const junk = [
    ev('coding', { source: 'eventbrite', title: 'Community Sundays: Kids Coding', venue: '34 Hanover Rd', description: 'Free parking behind the building. Laptops provided.' }),
    ev('compete', { source: 'toronto_open_data', title: 'International Architectural Design Competition 2026-2027', venue: 'Toronto (virtual)', description: 'Design a new waterfront park.' }),
    ev('gallery', { source: 'toronto_open_data', title: '"DEEP ROOTS" by Nancy L. Moore', venue: 'Riverdale Hub', description: 'Paintings with a signature palette of garden scenes.' })
  ];
  const ideas = build([...Array.from({ length: 6 }, (_, i) => filler(i + 1)), ...junk, ev('real-1'), ev('real-2')]);
  const got = shelf(ideas);
  for (const id of ['coding', 'compete', 'gallery']) assert.ok(!got.includes(id), `${id} made the floor`);
});

test('real outdoor events with the evidence in the title or venue still make the floor', () => {
  const real = [
    ev('pumpkins', { source: 'curated', title: 'Pumpkins After Dark', venue: 'Country Heritage Park, Milton', description: 'An evening walk past glowing pumpkins.' }),
    ev('market', { source: 'curated', title: 'Fall Harvest Market at Sugar Beach', venue: 'Sugar Beach', description: 'Vendors and music.' }),
    ev('duck', { source: 'curated', title: 'The Royal Duck bounce park', venue: 'Upper Canada Mall, south lot', description: 'Inflatables.' })
  ];
  const ideas = build([...Array.from({ length: 6 }, (_, i) => filler(i + 1)), ...real]);
  const got = shelf(ideas);
  // An earlier shelf may claim one of them first; then the floor has two
  // left and must stand down rather than show a two card shelf.
  if (got.length) assert.deepEqual(got.sort(), ['duck', 'market', 'pumpkins']);
  else assert.ok(ideas.some(i => ['duck', 'market', 'pumpkins'].includes(i.id)), 'they still reach the feed');
  const withMore = shelf(build([...Array.from({ length: 6 }, (_, i) => filler(i + 1)), ...real,
    ev('lights', { source: 'curated', title: 'Lantern Festival', venue: 'Ontario Place', description: 'Lights.' })]));
  assert.ok(withMore.length >= 3, 'with a fourth real event the floor stands');
  assert.ok(withMore.every(id => ['duck', 'market', 'pumpkins', 'lights'].includes(id)));
});

test('the floor never shows fewer than three cards', () => {
  for (let extra = 0; extra <= 4; extra++) {
    const pool = [...Array.from({ length: 6 }, (_, i) => filler(i + 1)), ...Array.from({ length: extra }, (_, i) => ev(`e${i}`))];
    const n = shelf(build(pool)).length;
    assert.ok(n === 0 || n >= 3, `${extra} events gave a ${n} card shelf`);
  }
});
