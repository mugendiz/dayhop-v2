// test/talkOfTown.test.js — the "Talk of the town" shelf's pure rules
// (services/talkOfTown.js): what a Grok candidate must look like to be
// considered, and what the request-path read serves for a point. No network:
// shapePick needs none, and active() takes its rows as an argument.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shapePick, active, weekStart, SHELF_SIZE, MAX_FAR, FAR_KM } = require('../services/talkOfTown');
const { hubById } = require('../data/tottHubs');

const TORONTO = hubById('toronto');
const TODAY = '2026-09-07';

const raw = over => Object.assign({
  rank: 1, title: 'Cabbagetown Festival', venue: 'Parliament Street', city: 'Toronto',
  start_date: '2026-09-12', end_date: '2026-09-13', official_url: 'https://cabbagetownfestival.ca',
  why: 'Two days of street stalls, buskers and a parade down Parliament.', price: 'free', family_ok: true, outdoor: true
}, over);

test('a well-formed outdoor pick shapes into a dated, id-stable entry', () => {
  const r = shapePick(raw(), { hub: TORONTO, today: TODAY });
  assert.equal(r.ok, true);
  assert.equal(r.pick.date, '2026-09-12');
  assert.equal(r.pick.date_end, '2026-09-13');
  assert.equal(r.pick.cost_tier, 'free');
  assert.match(r.pick.id, /^tott-toronto-cabbagetown-festival-2026-09-07$/);
});

test('events that already ended, start too far out, or run all year are rejected', () => {
  assert.equal(shapePick(raw({ start_date: '2026-08-20', end_date: '2026-09-06' }), { hub: TORONTO, today: TODAY }).reason, 'already_over');
  assert.equal(shapePick(raw({ start_date: '2026-10-15', end_date: '2026-10-16' }), { hub: TORONTO, today: TODAY }).reason, 'too_far_ahead');
  assert.equal(shapePick(raw({ start_date: '2026-09-01', end_date: '2027-06-01' }), { hub: TORONTO, today: TODAY }).reason, 'not_an_event');
  assert.equal(shapePick(raw({ start_date: 'soon' }), { hub: TORONTO, today: TODAY }).reason, 'no_date');
});

test('indoor-only and drinking-only picks never reach verification', () => {
  const indoor = shapePick(raw({ title: 'Cinema Classics Night', venue: 'Royal Cinema', why: 'A screening in the big room.', outdoor: false }),
    { hub: TORONTO, today: TODAY });
  assert.equal(indoor.reason, 'indoor_only');
  const taproom = shapePick(raw({ title: 'Taproom Patio Weekend', venue: 'Brewery Taproom', why: 'Pints on the patio all weekend.', outdoor: true }),
    { hub: TORONTO, today: TODAY });
  assert.equal(taproom.reason, 'drinking_only');
});

test('a food-and-drink festival on the street passes both gates', () => {
  const r = shapePick(raw({ title: 'Toronto Ribfest', venue: 'Centennial Park', why: 'Ribs, live music and a midway in the park.' }),
    { hub: TORONTO, today: TODAY });
  assert.equal(r.ok, true);
});

test('weekStart is the Toronto Monday of the week', () => {
  assert.equal(weekStart('2026-09-07'), '2026-09-07'); // a Monday
  assert.equal(weekStart('2026-09-10'), '2026-09-07');
  assert.equal(weekStart('2026-09-13'), '2026-09-07'); // Sunday still belongs to that week
});

// ---------- active(): the request-path read ----------
const row = (id, over = {}, entryOver = {}) => ({
  id, hub: 'toronto', status: 'active', pinned: false, week_start: '2026-09-07', created_at: '2026-09-06T05:00:00Z',
  entry: Object.assign({
    title: id, why: 'buzz', venue: 'Somewhere', city: 'Toronto', date: '2026-09-08', date_end: '2026-09-13',
    lat: 43.65, lng: -79.38, rank: 5, official_url: 'https://example.com', outdoor: true
  }, entryOver),
  ...over
});
const DOWNTOWN = { lat: 43.6532, lng: -79.3832 };

test('active serves the hub\'s live picks pinned-first then by rank, shaped as candidates', () => {
  const rows = [
    row('c', {}, { rank: 3 }),
    row('a', {}, { rank: 1 }),
    row('pinned', { pinned: true }, { rank: 9 }),
    row('over', {}, { rank: 0, date_end: '2026-09-06' }),
    row('retired', { status: 'retired' }, { rank: 0 })
  ];
  const out = active({ point: DOWNTOWN, today: TODAY, source: rows });
  assert.deepEqual(out.map(c => c.id), ['pinned', 'a', 'c']);
  assert.equal(out[0].source, 'talk_of_town');
  assert.equal(out[0].tott, true);
  assert.equal(out[0].date_end, '2026-09-13');
  assert.equal(out[0].booking_url, 'https://example.com');
  assert.ok(out[0].distance_km != null);
});

test('at most two far picks, nothing beyond the ~2 h reach, shelf capped at five', () => {
  const rows = [
    row('near1', {}, { rank: 1 }),
    row('far1', {}, { rank: 2, lat: 43.09, lng: -79.08 }),  // Niagara Falls ≈ 110 km
    row('far2', {}, { rank: 3, lat: 44.39, lng: -79.69 }),  // Barrie ≈ 85 km
    row('far3', {}, { rank: 4, lat: 43.45, lng: -80.49 }),  // Kitchener ≈ 90 km
    row('near2', {}, { rank: 5 }),
    row('near3', {}, { rank: 6 }),
    row('near4', {}, { rank: 7 }),
    row('too-far', {}, { rank: 0, lat: 45.42, lng: -75.70 }) // Ottawa ≈ 350 km
  ];
  const out = active({ point: DOWNTOWN, today: TODAY, source: rows });
  assert.equal(out.length, SHELF_SIZE);
  assert.ok(!out.some(c => c.id === 'too-far'));
  const far = out.filter(c => c.distance_km > FAR_KM);
  assert.equal(far.length, MAX_FAR);
  assert.deepEqual(out.map(c => c.id), ['near1', 'far1', 'far2', 'near2', 'near3']);
});

test('a point outside every hub gets no shelf', () => {
  const out = active({ point: { lat: 49.28, lng: -123.12 }, today: TODAY, source: [row('x')] }); // Vancouver
  assert.deepEqual(out, []);
});
