// test/affiliates.test.js — affiliate links are off without an ID, match
// Stay22's documented format with one, and always carry a disclosure.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const { stayLink, stay22Aid, DISCLOSURE } = require('../services/affiliates');
const { lint } = require('../services/copyStyle');

test('no affiliate ID, no link', () => {
  assert.equal(stay22Aid({}), null);
  assert.equal(stayLink({ lat: 44.5, lng: -80.2 }, {}), null);
  assert.equal(stay22Aid({ STAY22_AID: 'bad id with spaces' }), null);
});

test('with an ID: the documented allez/roam format, dates checked, campaign cleaned', () => {
  const env = { STAY22_AID: 'dayhop' };
  const u = new URL(stayLink({ lat: 44.50084, lng: -80.28928, checkin: '2026-11-06', checkout: '2026-11-09', campaign: 'trip-guide kingston!' }, env));
  assert.equal(u.origin + u.pathname, 'https://www.stay22.com/allez/roam');
  assert.equal(u.searchParams.get('aid'), 'dayhop');
  assert.equal(u.searchParams.get('lat'), '44.50084');
  assert.equal(u.searchParams.get('checkin'), '2026-11-06');
  assert.equal(u.searchParams.get('checkout'), '2026-11-09');
  assert.equal(u.searchParams.get('campaign'), 'trip_guide_kingston_');
  const noOut = new URL(stayLink({ lat: 1, lng: 2, checkin: '2026-11-09', checkout: '2026-11-06' }, env));
  assert.equal(noOut.searchParams.get('checkout'), null, 'a checkout before checkin is dropped');
  assert.equal(stayLink({}, env), null, 'Stay22 needs a location');
  assert.deepEqual(lint(DISCLOSURE).map(v => v.detail), []);
});

test('place pages: a stay link only far from Toronto, only with an ID, always disclosed', async () => {
  process.env.STAY22_AID = 'dayhop';
  try {
    const app = express();
    app.use('/places', require('../routes/placePages').router);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const far = await (await fetch(`${base}/places/scandinave-blue-mountain`)).text();
      assert.match(far, /href="https:\/\/www\.stay22\.com\/allez\/roam\?aid=dayhop[^"]*" rel="sponsored nofollow"/);
      assert.ok(far.includes(DISCLOSURE));
      const near = await (await fetch(`${base}/places/wave-pool-rh`)).text();
      assert.ok(!near.includes('stay22.com'), 'a place in town gets no stay link');
    } finally { server.close(); }
  } finally { delete process.env.STAY22_AID; }
});
