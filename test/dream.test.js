// test/dream.test.js — Dream big (beta): the beta gate, the /dream scroll,
// honest cards (credits, no invented events) and house copy style.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const dream = require('../routes/dream');
const BOARD = require('../data/dreamBoard');
const { lint } = require('../services/copyStyle');

async function withApp(fn) {
  const app = express();
  app.use(dream.betaGate);
  app.use('/api/dream', dream.api);
  app.use(dream.page);
  app.get('/', (req, res) => res.send('home'));
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('not public: /dream and /api/dream are 404 without the beta cookie', async () => {
  await withApp(async base => {
    assert.equal((await fetch(`${base}/dream`)).status, 404);
    assert.equal((await fetch(`${base}/api/dream`)).status, 404);
  });
});

test('?beta=1 sets the cookie and unlocks the scroll; ?beta=0 clears it', async () => {
  await withApp(async base => {
    const on = await fetch(`${base}/?beta=1`);
    assert.match(on.headers.get('set-cookie'), /dh_beta=1/);
    const page = await fetch(`${base}/dream`, { headers: { cookie: 'dh_beta=1' } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('x-robots-tag'), /noindex/);
    const html = await page.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    for (const d of BOARD) assert.ok(html.includes(`id="${d.id}"`), d.id);
    assert.equal((html.match(/class="dr-btn dr-btn--share"/g) || []).length, BOARD.length, 'every dream can be shared');
    const off = await fetch(`${base}/?beta=0`);
    assert.match(off.headers.get('set-cookie'), /dh_beta=0/);
    const j = await (await fetch(`${base}/api/dream`, { headers: { cookie: 'x=1; dh_beta=1' } })).json();
    assert.deepEqual(j.dreams.filter(d => d.kind === 'vision').map(d => d.id), BOARD.map(d => d.id));
  });
  assert.equal(dream.isBeta({ headers: { cookie: 'dh_beta=10' } }), false);
});

test('every vision card has a self-hosted photo, a credit with a licence, and a real way to get a taste', () => {
  for (const d of BOARD) {
    assert.match(d.image, /^\/img\/dream\/[a-z]+\.jpg$/, d.id);
    assert.ok(require('fs').existsSync(require('path').join(__dirname, '..', 'public', d.image)), `${d.id} image file`);
    assert.match(d.credit.licence, /^CC/);
    assert.match(d.credit.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.doesNotMatch(d.credit.place, /\d+ \w+ (Ln|Lane|Rd|St)/, 'never a house number');
    assert.ok(d.taste && d.link && /^https:\/\//.test(d.link.url));
    for (const t of [d.title, d.line, d.taste, d.kicker]) assert.deepEqual(lint(t).map(v => v.detail), [], `${d.id}: ${t}`);
  }
  assert.match(BOARD.find(d => d.id === 'invite-only').taste, /invite-only/, 'says plainly the real parties are invite-only');
});

test('the scroll page has no dash punctuation', () => {
  const html = dream.scrollHtml(BOARD.slice());
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
  assert.deepEqual(lint(text).map(v => v.detail), []);
});
