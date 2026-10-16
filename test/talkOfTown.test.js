// test/talkOfTown.test.js — the "Talk of the town" shelf's pure rules
// (services/talkOfTown.js): what a Grok candidate must look like to be
// considered, and what the request-path read serves for a point. No network:
// shapePick needs none, and active() takes its rows as an argument.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shapePick, active, weekStart, SHELF_SIZE, MAX_FAR, FAR_KM, FEED_MAX_KM } = require('../services/talkOfTown');
const { hubById } = require('../data/tottHubs');
const { addDays } = require('../services/spotlight');

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

// ---------- maxKm: the feeds cap at 80, the newsletter does not ----------
// The store reaches HUB_REACH_KM (180) on purpose. A Saturday-morning scroll
// wants somewhere to go today, so routes/browse.js and routes/surprise.js
// pass FEED_MAX_KM; the Monday newsletter goes out a week ahead, so
// services/tottDigest.js passes no ceiling and keeps the full list.

// Only two picks beyond FAR_KM: MAX_FAR caps those at 2 regardless of any
// ceiling, so a third would be dropped for a reason this test isn't about.
const SPREAD = [
  row('near', {}, { rank: 1 }),                                  // downtown, ~0 km
  row('barrie', {}, { rank: 2, lat: 44.39, lng: -79.69 }),       // ~85 km
  row('kitchener', {}, { rank: 3, lat: 43.45, lng: -80.49 })     // ~90 km
];

test('the feeds cap the shelf at 80 km from the user', () => {
  const out = active({ point: DOWNTOWN, today: TODAY, source: SPREAD, maxKm: FEED_MAX_KM });
  assert.deepEqual(out.map(c => c.id), ['near']);
  for (const c of out) {
    assert.ok(c.distance_km == null || c.distance_km <= FEED_MAX_KM,
      `${c.id} at ${c.distance_km} km cleared an 80 km ceiling`);
  }
});

test('the weekly newsletter keeps every pick the store reaches', () => {
  const out = active({ point: DOWNTOWN, today: TODAY, source: SPREAD });
  assert.deepEqual(out.map(c => c.id), ['near', 'barrie', 'kitchener'],
    'no ceiling means the full list, worth-the-drive picks included');
});

test('a bad maxKm falls back to the store reach rather than emptying the shelf', () => {
  for (const bad of [null, undefined, NaN, 'eighty']) {
    const out = active({ point: DOWNTOWN, today: TODAY, source: SPREAD, maxKm: bad });
    assert.equal(out.length, 3, `maxKm=${String(bad)} must not silently drop picks`);
  }
});

// ---------- the search horizon ----------
// A season of festivals went by without one reaching the shelf. The cause was
// WINDOW_DAYS, not the gates: pickerPrompt() asks Grok for happenings between
// today and today + WINDOW_DAYS, so nothing past that horizon is ever even
// requested, however permissive shapePick is. These pin the horizon and the
// invariant that keeps the two numbers from drifting apart again.

const { WINDOW_DAYS, MAX_START_AHEAD_DAYS } = require('../services/talkOfTown');

test('the gate can never be narrower than the search window', () => {
  // If it is, the system silently discards the far edge of its own results:
  // Grok is asked for N days, finds a fair on day N-1, shapePick drops it as
  // too_far_ahead, and nothing anywhere reports the loss.
  assert.ok(MAX_START_AHEAD_DAYS >= WINDOW_DAYS,
    `gate ${MAX_START_AHEAD_DAYS} is tighter than the window ${WINDOW_DAYS}`);
});

test('the window reaches far enough to catch a festival while it can be planned', () => {
  assert.ok(WINDOW_DAYS >= 21,
    'under three weeks and an announced fair is invisible until the week it runs');
});

test('an event inside the window is accepted, one past the gate is not', () => {
  const inWindow = addDays(TODAY, WINDOW_DAYS - 1);
  const wayOut = addDays(TODAY, MAX_START_AHEAD_DAYS + 10);
  const ok = shapePick(raw({ start_date: inWindow, end_date: inWindow }), { hub: TORONTO, today: TODAY });
  assert.equal(ok.ok, true, `a pick at day ${WINDOW_DAYS - 1} should survive: ${ok.reason}`);
  const far = shapePick(raw({ start_date: wayOut, end_date: wayOut }), { hub: TORONTO, today: TODAY });
  assert.equal(far.reason, 'too_far_ahead');
});

// The mid-week dead zone. Sunday's pass files its rows under the week that is
// ending, the hourly check re-runs Monday under the new week, and the old
// needsRefresh then said "this hub has rows this week" until Sunday even
// after every one of them had ended, so the shelf sat empty from about
// Thursday on: the run-up to every weekend.
const { needsRefresh, MIN_LIVE } = require('../services/talkOfTown');
const tottRow = (id, date_end, extra = {}) => Object.assign({
  id, hub: 'toronto', status: 'active', pinned: false, week_start: '2026-10-05',
  created_at: '2026-10-05T05:00:00Z', entry: { title: id, date: '2026-10-05', date_end }
}, extra);

test('a shelf whose picks have all ended mid-week asks for a fresh search', () => {
  const mondayPicks = ['a', 'b', 'c', 'd', 'e'].map(id => tottRow(id, '2026-10-06'));
  assert.equal(needsRefresh('toronto', '2026-10-08', { source: mondayPicks, last: null }), true);
});

test('a shelf with enough live picks does not re-buy a search', () => {
  const live = ['a', 'b', 'c'].map(id => tottRow(id, '2026-10-12'));
  assert.equal(MIN_LIVE, 3);
  assert.equal(needsRefresh('toronto', '2026-10-08', { source: live, last: null }), false);
});

test('the run-dry refresh happens at most once per Toronto day', () => {
  const dry = [tottRow('a', '2026-10-06')];
  // A run already happened today (remembered in memory)...
  assert.equal(needsRefresh('toronto', '2026-10-08', { source: dry, last: { at: '2026-10-08T14:00:00Z' } }), false);
  // ...or proven by a row it wrote, which survives a redeploy.
  const wroteToday = [tottRow('a', '2026-10-06'), tottRow('b', '2026-10-07', { created_at: '2026-10-08T14:00:00Z' })];
  assert.equal(needsRefresh('toronto', '2026-10-08', { source: wroteToday, last: null }), false);
  // The next day it may try again.
  assert.equal(needsRefresh('toronto', '2026-10-09', { source: dry, last: { at: '2026-10-08T14:00:00Z' } }), true);
});
