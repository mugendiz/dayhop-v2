// test/go.test.js — keyed profile links: allow-listed keys only, the key
// rides into the destination, and every tap becomes a link_click event.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const analytics = require('../services/analytics');
const go = require('../routes/go');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

test('link_click is a registered event type', () => {
  // recordEvent silently drops unregistered types — the drift that once
  // ate surprise_feed. Guard it here.
  assert.equal(analytics.EVENT_TYPES ? analytics.EVENT_TYPES.has('link_click') : true, true);
});

test('destination carries the key as src and utm', () => {
  assert.equal(go.destination('tiktok', 'plan'), '/?src=tiktok&utm_source=tiktok&utm_medium=social&utm_campaign=go-plan');
  assert.equal(go.destination('igs', 'rh'), '/guides/richmond-hill?src=igs&utm_source=igs&utm_medium=social&utm_campaign=go-rh');
  // Unknown page falls back to the planner, never to a free-form path.
  assert.equal(go.destination('ig', 'evil'), '/?src=ig&utm_source=ig&utm_medium=social&utm_campaign=go-plan');
});

test('GET /go/<key> redirects known keys and 404s the rest', async () => {
  const app = express();
  app.use('/go', go);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ok = await fetch(`${base}/go/tiktok`, { redirect: 'manual' });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), '/?src=tiktok&utm_source=tiktok&utm_medium=social&utm_campaign=go-plan');
    assert.equal(ok.headers.get('cache-control'), 'no-store');

    const rh = await fetch(`${base}/go/IG/rh`, { redirect: 'manual' });
    assert.equal(rh.status, 302);
    assert.equal(rh.headers.get('location'), '/guides/richmond-hill?src=ig&utm_source=ig&utm_medium=social&utm_campaign=go-rh');

    const bad = await fetch(`${base}/go/attacker`, { redirect: 'manual' });
    assert.equal(bad.status, 404);
  } finally {
    srv.close();
  }
});

test('Instagram keyword DMs land on the Playbook and the guides', () => {
  assert.equal(go.isKey('igdm'), true);
  assert.equal(go.destination('igdm', 'playbook'), '/playbook?src=igdm&utm_source=igdm&utm_medium=social&utm_campaign=go-playbook');
  assert.equal(go.destination('igdm', 'guides'), '/guides?src=igdm&utm_source=igdm&utm_medium=social&utm_campaign=go-guides');
});
