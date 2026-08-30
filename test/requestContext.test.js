// test/requestContext.test.js — the CF-Connecting-IP trust gate.
// The header is only believable when the connecting peer is a Cloudflare
// edge; from anywhere else it's attacker-controlled and must be ignored
// (rate limiters, ip-* bans and the internal-traffic exclusion all key on
// what clientIp returns).
const test = require('node:test');
const assert = require('node:assert');
const { clientIp, isCloudflarePeer } = require('../services/requestContext');

test('isCloudflarePeer: published v4 ranges match, others do not', () => {
  assert.equal(isCloudflarePeer('104.16.1.1'), true);      // 104.16.0.0/13
  assert.equal(isCloudflarePeer('172.71.9.9'), true);      // 172.64.0.0/13
  assert.equal(isCloudflarePeer('162.158.255.1'), true);   // 162.158.0.0/15
  assert.equal(isCloudflarePeer('::ffff:104.16.1.1'), true); // v4-mapped v6
  assert.equal(isCloudflarePeer('8.8.8.8'), false);
  assert.equal(isCloudflarePeer('10.0.0.1'), false);
  assert.equal(isCloudflarePeer('104.15.255.255'), false); // one below the /13
  assert.equal(isCloudflarePeer(''), false);
  assert.equal(isCloudflarePeer(null), false);
  assert.equal(isCloudflarePeer('not-an-ip'), false);
});

test('isCloudflarePeer: v6 prefixes', () => {
  assert.equal(isCloudflarePeer('2606:4700::1'), true);
  assert.equal(isCloudflarePeer('2400:cb00:2048::1'), true);
  assert.equal(isCloudflarePeer('2001:4860:4860::8888'), false); // Google DNS
});

test('clientIp: honours CF header only from a Cloudflare peer', () => {
  const viaCf = { ip: '104.16.1.1', headers: { 'cf-connecting-ip': '203.0.113.7' } };
  assert.equal(clientIp(viaCf), '203.0.113.7');

  // Direct-to-origin spoof attempt: header must be ignored.
  const direct = { ip: '198.51.100.9', headers: { 'cf-connecting-ip': '1.2.3.4' } };
  assert.equal(clientIp(direct), '198.51.100.9');

  const directTrueClient = { ip: '198.51.100.9', headers: { 'true-client-ip': '1.2.3.4' } };
  assert.equal(clientIp(directTrueClient), '198.51.100.9');
});

test('clientIp: garbage header values fall through even from CF', () => {
  const bad = { ip: '104.16.1.1', headers: { 'cf-connecting-ip': '<script>alert(1)</script>' } };
  assert.equal(clientIp(bad), '104.16.1.1');
});

test('clientIp: no headers → req.ip; nothing → null', () => {
  assert.equal(clientIp({ ip: '127.0.0.1', headers: {} }), '127.0.0.1');
  assert.equal(clientIp({ ip: undefined, headers: {} }), null);
});
