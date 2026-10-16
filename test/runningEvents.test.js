// test/runningEvents.test.js — a multi-day event is on until it ENDS. The
// candidate pool's past-event filter compared the start date alone, so the
// Royal Duck (Oct 3 to Nov 1) vanished from every feed on Oct 4 and
// Pumpkins After Dark (Sep 26 to Oct 31) never appeared, even though
// upcomingCuratedEvents had already been fixed to keep them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isEventOver, overlapsWindow } = require('../services/candidates');
const events = require('../data/curatedEvents');

const duck = events.find(e => e.id === 'cur-royal-duck-upper-canada-2026');
const pumpkins = events.find(e => e.id === 'cur-pumpkins-after-dark-milton-2026');

test('a run that started earlier is still on until its end date', () => {
  assert.equal(isEventOver(duck, '2026-10-15'), false);
  assert.equal(isEventOver(pumpkins, '2026-10-15'), false);
  assert.equal(isEventOver(pumpkins, '2026-10-31'), false, 'last day still counts');
  assert.equal(isEventOver(pumpkins, '2026-11-01'), true);
});

test('one day events and undated candidates behave as before', () => {
  assert.equal(isEventOver({ date: '2026-10-14' }, '2026-10-15'), true);
  assert.equal(isEventOver({ date: '2026-10-15' }, '2026-10-15'), false);
  assert.equal(isEventOver({ title: 'A park' }, '2026-10-15'), false);
  assert.equal(isEventOver({ date: '2026-10-14', date_end: 'not a date' }, '2026-10-15'), true);
  assert.equal(isEventOver({ date: '2026-10-14', date_end: '2026-10-01' }, '2026-10-15'), true, 'an end before the start is ignored');
});

test('a run is in a date window when any day of it falls inside', () => {
  const sat = { start: '2026-10-24', end: '2026-10-24' };
  assert.equal(overlapsWindow(duck, sat), true);
  assert.equal(overlapsWindow(pumpkins, { start: '2026-11-07', end: '2026-11-08' }), false);
  assert.equal(overlapsWindow({ date: '2026-10-24' }, sat), true);
  assert.equal(overlapsWindow({ date: '2026-10-25' }, sat), false);
  assert.equal(overlapsWindow({ title: 'A trail' }, sat), true);
});
