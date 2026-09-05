// test/planVotes.test.js — social vote MVP on shared guides.
// Flag off → both endpoints are invisible (404). Flag on → one vote per
// (voter, stop), toggling/clearing works, "going" never takes -1, and the
// tally the page renders comes back with the caller's own votes marked.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DB_BACKEND = 'memory';
process.env.SOCIAL_VOTE = 'on';

const memoryStore = require('../services/db/memoryStore');
const planVotes = require('../services/planVotes');
const guides = require('../routes/guides');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

async function api(base, method, path, body, query) {
  const res = await fetch(base + path + (query ? '?' + new URLSearchParams(query) : ''), {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('tally shapes rows into per-stop counts, going count and my votes', () => {
  const rows = [
    { stop_key: '0', voter_key: 'guest-aaaa', vote: 1 },
    { stop_key: '0', voter_key: 'guest-bbbb', vote: -1 },
    { stop_key: '2', voter_key: 'guest-aaaa', vote: 1 },
    { stop_key: 'going', voter_key: 'guest-aaaa', vote: 1 },
    { stop_key: 'going', voter_key: 'guest-cccc', vote: 1 }
  ];
  const t = planVotes.tally(rows, 'guest-aaaa');
  assert.deepEqual(t.stops, { '0': { up: 1, down: 1 }, '2': { up: 1, down: 0 } });
  assert.equal(t.going, 2);
  assert.deepEqual(t.mine, { going: true, stops: { '0': 1, '2': 1 } });
});

test('validation: stop keys and vote values', () => {
  assert.equal(planVotes.normalizeStopKey('going'), 'going');
  assert.equal(planVotes.normalizeStopKey(3), '3');
  assert.equal(planVotes.normalizeStopKey('19'), '19');
  assert.equal(planVotes.normalizeStopKey(20), null);
  assert.equal(planVotes.normalizeStopKey('x'), null);
  assert.equal(planVotes.normalizeVote(-1, '0'), -1);
  assert.equal(planVotes.normalizeVote(-1, 'going'), null);
  assert.equal(planVotes.normalizeVote(2, '0'), null);
  assert.equal(planVotes.normalizeVote(0, 'going'), 0);
});

test('endpoints: vote, toggle, clear, and the flag gate', async () => {
  const guide = await memoryStore.createGuide({
    ownerId: 'user-1', shareId: 'sharetest1', title: 'Test day', city: 'Toronto',
    guide: { title: 'Test day', stops: [{ title: 'A' }, { title: 'B' }] }
  });
  assert.equal(guide.share_id, 'sharetest1');

  const app = express();
  app.use(express.json());
  app.use('/api/guides', guides);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    // Fresh page: nothing yet, caller's votes empty.
    let r = await api(base, 'GET', '/api/guides/shared/sharetest1/votes', null, { v: 'guest-abcd1234' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { going: 0, stops: {}, mine: { going: false, stops: {} } });

    // Two voters on stop 0, one "I'm in".
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 0, vote: 1, voter: 'guest-abcd1234' });
    assert.equal(r.status, 200);
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: '0', vote: -1, voter: 'guest-zzzz9999' });
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 'going', vote: 1, voter: 'guest-abcd1234' });
    assert.equal(r.body.going, 1);
    assert.deepEqual(r.body.stops['0'], { up: 1, down: 1 });
    assert.equal(r.body.mine.going, true);

    // Same voter flips to -1: one row per (voter, stop), never two.
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 0, vote: -1, voter: 'guest-abcd1234' });
    assert.deepEqual(r.body.stops['0'], { up: 0, down: 2 });
    // Clear.
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 0, vote: 0, voter: 'guest-abcd1234' });
    assert.deepEqual(r.body.stops['0'], { up: 0, down: 1 });
    assert.equal(r.body.mine.stops['0'], undefined);

    // Bad input.
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 'going', vote: -1, voter: 'guest-abcd1234' });
    assert.equal(r.status, 400);
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 0, vote: 1, voter: 'not-a-guest' });
    assert.equal(r.status, 400);
    r = await api(base, 'POST', '/api/guides/shared/nope/vote', { stop: 0, vote: 1, voter: 'guest-abcd1234' });
    assert.equal(r.status, 404);

    // Flag off: invisible.
    process.env.SOCIAL_VOTE = 'off';
    r = await api(base, 'GET', '/api/guides/shared/sharetest1/votes', null, { v: 'guest-abcd1234' });
    assert.equal(r.status, 404);
    r = await api(base, 'POST', '/api/guides/shared/sharetest1/vote', { stop: 0, vote: 1, voter: 'guest-abcd1234' });
    assert.equal(r.status, 404);
    process.env.SOCIAL_VOTE = 'on';
  } finally {
    srv.close();
  }
});
