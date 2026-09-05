// test/shortlists.test.js — named shortlists ("My Favs" pages) + the list-
// aware shortlist routes, on the in-memory store with the legacy owner-id
// fallback (TRUST_CLIENT_OWNER_ID) so no Supabase is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.DB_BACKEND = 'memory';
process.env.TRUST_CLIENT_OWNER_ID = 'true';

const shortlists = require('../routes/shortlists');
const shortlist = require('../routes/shortlist');
const analytics = require('../services/analytics');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

async function api(base, method, path, body, owner = 'user-a') {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${sep}ownerId=${owner}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(Object.assign({ ownerId: owner }, body)) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('event types for the favs grid are registered', () => {
  for (const t of ['favs_list_created', 'favs_list_renamed', 'tile_open', 'tile_swipe_plan', 'feed_swipe_shortlist']) {
    assert.equal(analytics.EVENT_TYPES.has(t), true, t);
  }
  for (const t of ['tile_open', 'tile_swipe_plan', 'feed_swipe_shortlist']) {
    assert.equal(analytics.CLIENT_EVENT_TYPES.has(t), true, t);
  }
});

test('autoName follows "<City> · <Mood>" with GTA as the fallback city', () => {
  assert.equal(shortlists.autoName('Markham', 'rr'), 'Markham · R&R');
  assert.equal(shortlists.autoName('Markham', 'adventure'), 'Markham · Adventure');
  assert.equal(shortlists.autoName(null, 'rr'), 'GTA · R&R');
  assert.equal(shortlists.autoName('Toronto', null), 'Toronto');
  assert.match(shortlists.torontoDayStartIso(), /T0[45]:00:00\.000Z$/);
});

test('lists: auto-name, same-day dedupe, rename, cap, delete cascades', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/shortlists', shortlists);
  app.use('/api/shortlist', shortlist);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let r = await api(base, 'GET', '/api/shortlists');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lists, []);

    // Auto-created by a generate.
    r = await api(base, 'POST', '/api/shortlists', { city: 'Markham', mood: 'rr' });
    assert.equal(r.status, 201);
    assert.equal(r.body.list.name, 'Markham · R&R');
    assert.equal(r.body.existed, false);
    const markham = r.body.list.id;

    // Same city+mood, same Toronto day → reused, not stacked.
    r = await api(base, 'POST', '/api/shortlists', { city: 'Markham', mood: 'rr' });
    assert.equal(r.status, 200);
    assert.equal(r.body.existed, true);
    assert.equal(r.body.list.id, markham);

    // Different mood → new list. Explicit name wins over auto-name.
    r = await api(base, 'POST', '/api/shortlists', { city: 'Markham', mood: 'adventure', name: '  Big   kids day  ' });
    assert.equal(r.status, 201);
    assert.equal(r.body.list.name, 'Big kids day');
    const kids = r.body.list.id;

    // Items land in a list; the same idea can live in two lists.
    const idea = { id: 'zoo', title: 'Toronto Zoo', image_url: 'x' };
    r = await api(base, 'POST', '/api/shortlist', { idea, list_id: markham });
    assert.equal(r.status, 201);
    assert.equal(r.body.item.shortlist_id, markham);
    r = await api(base, 'POST', '/api/shortlist', { idea, list_id: kids });
    assert.equal(r.status, 201);
    r = await api(base, 'POST', '/api/shortlist', { idea: { id: 'bluffs', title: 'Bluffs' }, list_id: markham });
    assert.equal(r.status, 201);
    r = await api(base, 'POST', '/api/shortlist', { idea, list_id: 'nope' });
    assert.equal(r.status, 404);

    r = await api(base, 'GET', `/api/shortlist?list=${markham}`);
    assert.deepEqual(r.body.items.map(i => i.idea_id).sort(), ['bluffs', 'zoo']);
    r = await api(base, 'GET', `/api/shortlist?list=${kids}`);
    assert.deepEqual(r.body.items.map(i => i.idea_id), ['zoo']);
    r = await api(base, 'GET', '/api/shortlist');
    assert.equal(r.body.items.length, 3);

    // Counts ride on the list rows.
    r = await api(base, 'GET', '/api/shortlists');
    const counts = Object.fromEntries(r.body.lists.map(l => [l.id, l.count]));
    assert.equal(counts[markham], 2);
    assert.equal(counts[kids], 1);

    // Move: bluffs → kids. Zoo already in kids → moving it drops the source.
    r = await api(base, 'POST', '/api/shortlist/bluffs/move', { list_id: kids });
    assert.equal(r.status, 200);
    assert.equal(r.body.item.shortlist_id, kids);
    r = await api(base, 'GET', `/api/shortlist?list=${kids}`);
    assert.equal(r.body.items.length, 2);

    // Rename: trimmed, capped, empty rejected.
    r = await api(base, 'PATCH', `/api/shortlists/${markham}`, { name: 'Sunday with the cousins' });
    assert.equal(r.body.list.name, 'Sunday with the cousins');
    r = await api(base, 'PATCH', `/api/shortlists/${markham}`, { name: '   ' });
    assert.equal(r.status, 400);
    r = await api(base, 'PATCH', `/api/shortlists/${markham}`, { name: 'x'.repeat(80) });
    assert.equal(r.body.list.name.length, 40);
    r = await api(base, 'PATCH', '/api/shortlists/ghost', { name: 'x' });
    assert.equal(r.status, 404);

    // Another owner sees nothing of this.
    r = await api(base, 'GET', '/api/shortlists', null, 'user-b');
    assert.deepEqual(r.body.lists, []);
    r = await api(base, 'PATCH', `/api/shortlists/${markham}`, { name: 'hijack' }, 'user-b');
    assert.equal(r.status, 404);

    // Delete-one-from-list vs delete-everywhere.
    r = await api(base, 'DELETE', `/api/shortlist/zoo?list=${kids}`);
    assert.equal(r.status, 204);
    r = await api(base, 'GET', '/api/shortlist');
    assert.deepEqual(r.body.items.map(i => i.idea_id).sort(), ['bluffs', 'zoo']);
    r = await api(base, 'DELETE', '/api/shortlist/zoo');
    assert.equal(r.status, 204);
    r = await api(base, 'GET', '/api/shortlist');
    assert.deepEqual(r.body.items.map(i => i.idea_id), ['bluffs']);

    // Deleting a list takes its items with it.
    r = await api(base, 'DELETE', `/api/shortlists/${kids}`);
    assert.equal(r.status, 204);
    r = await api(base, 'GET', '/api/shortlist');
    assert.deepEqual(r.body.items, []);
    r = await api(base, 'DELETE', `/api/shortlists/${kids}`);
    assert.equal(r.status, 404);

    // Cap: 20 lists per owner.
    for (let i = 0; i < 19; i++) {
      r = await api(base, 'POST', '/api/shortlists', { name: `List ${i}` });
      assert.equal(r.status, 201, `list ${i}`);
    }
    r = await api(base, 'POST', '/api/shortlists', { name: 'one too many' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'LIST_CAP');
  } finally {
    srv.close();
  }
});
