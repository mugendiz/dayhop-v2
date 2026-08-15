// test/digestLinks.test.js — the digest tracking links' security promises:
// signatures bind issue+subscriber+destination (no open-redirect service),
// the subscriber id is never the unsubscribe token, and verification is
// strict on tampering.
const test = require('node:test');
const assert = require('node:assert/strict');
const links = require('../services/digestLinks');

const ISSUE = '2026-08-20';
const EMAIL = 'reader@example.com';

test('subscriber id is stable, opaque, and email-derived', () => {
  const a = links.subscriberId(EMAIL);
  const b = links.subscriberId('Reader@Example.com  ');
  assert.equal(a, b, 'case/whitespace must not change the id');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(links.subscriberId('other@example.com'), a);
});

test('click urls verify, tampered ones do not', () => {
  const sid = links.subscriberId(EMAIL);
  const dest = 'https://www.niagaraparks.com/visit/';
  const url = new URL(links.clickUrl('https://dayhop.quest', { issue: ISSUE, sid, url: dest, idx: 0 }));
  const q = url.searchParams;
  assert.equal(url.pathname, '/api/digest/click');
  assert.equal(q.get('u'), dest);
  assert.ok(links.verifyClick(q.get('i'), q.get('s'), q.get('u'), q.get('sig')));
  // Swap the destination and the signature must die — this is the
  // open-redirect defence.
  assert.ok(!links.verifyClick(q.get('i'), q.get('s'), 'https://evil.example/', q.get('sig')));
  assert.ok(!links.verifyClick('2026-08-27', q.get('s'), q.get('u'), q.get('sig')));
  assert.ok(!links.verifyClick(q.get('i'), 'deadbeefdeadbeef', q.get('u'), q.get('sig')));
  assert.ok(!links.verifyClick(q.get('i'), q.get('s'), q.get('u'), ''));
});

test('open pixel urls verify and reject tampering', () => {
  const sid = links.subscriberId(EMAIL);
  const url = new URL(links.openPixelUrl('https://dayhop.quest', { issue: ISSUE, sid }));
  const q = url.searchParams;
  assert.equal(url.pathname, '/api/digest/open');
  assert.ok(links.verifyOpen(q.get('i'), q.get('s'), q.get('sig')));
  assert.ok(!links.verifyOpen('2026-08-27', q.get('s'), q.get('sig')));
  assert.ok(!links.verifyOpen(q.get('i'), q.get('s'), q.get('sig').slice(0, -1) + '0'));
});
