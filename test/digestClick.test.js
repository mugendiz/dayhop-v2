// test/digestClick.test.js — drives the real /api/digest routes with links
// built by the real signer. The Monday Talk of the town newsletter signs with
// a "tott-" issue id; the route capped the id at 10 chars and demanded a bare
// date, so every Monday link answered "Bad link." (live, 2026-10-05). Nothing
// tested a link end to end, which is how it shipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const digestLinks = require('../services/digestLinks');

function serve() {
  const app = express();
  app.use('/api/digest', require('../routes/digestTrack'));
  return new Promise(r => { const s = app.listen(0, () => r(s)); });
}
const get = (port, path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, res => {
    let body = ''; res.on('data', c => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
  }).on('error', reject);
});
const pathOf = full => full.slice(full.indexOf('/api/digest'));

const DEST = 'https://dayhop.quest/';
const sid = digestLinks.subscriberId('reader@example.com');

for (const issue of ['2026-10-08', 'tott-2026-10-05']) {
  test(`a signed ${issue.startsWith('tott') ? 'Monday' : 'Thursday'} link redirects to its destination`, async () => {
    const server = await serve();
    try {
      const link = digestLinks.clickUrl('https://x', { issue, sid, url: DEST, idx: 0 });
      const r = await get(server.address().port, pathOf(link));
      assert.equal(r.status, 302, `got ${r.status} "${r.body}"`);
      assert.equal(r.location, DEST);
    } finally { server.close(); }
  });
}

test('a tampered destination is still refused', async () => {
  const server = await serve();
  try {
    const link = digestLinks.clickUrl('https://x', { issue: 'tott-2026-10-05', sid, url: DEST });
    const evil = link.replace(encodeURIComponent(DEST), encodeURIComponent('https://evil.example/'));
    const r = await get(server.address().port, pathOf(evil));
    assert.equal(r.status, 400, 'the signature must still bind the destination');
  } finally { server.close(); }
});

test('only the exact tott- prefix is accepted, not any prefix', async () => {
  const server = await serve();
  try {
    const link = digestLinks.clickUrl('https://x', { issue: 'evil-2026-10-05', sid, url: DEST });
    const r = await get(server.address().port, pathOf(link));
    assert.equal(r.status, 400);
  } finally { server.close(); }
});
