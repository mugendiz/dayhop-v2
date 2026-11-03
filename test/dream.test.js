// test/dream.test.js — Dream big: admins and localhost only, never the
// public; the /dream scroll; honest cards (credits, no invented events);
// house copy style.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const dream = require('../routes/dream');
const BOARD = require('../data/dreamBoard');
const { lint } = require('../services/copyStyle');

// user: what middleware/auth.js would have attached for this request.
async function withApp(fn, { user = null } = {}) {
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api/dream', dream.api);
  app.use(dream.page);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('production: the public gets 404 from the API and an empty shell from /dream', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await withApp(async base => {
      assert.equal((await fetch(`${base}/api/dream`)).status, 404);
      assert.equal((await fetch(`${base}/api/dream`, { headers: { 'X-Forwarded-Host': 'localhost' } })).status, 404, 'a forged host does not unlock it');
      const shell = await fetch(`${base}/dream`);
      const html = await shell.text();
      assert.match(shell.headers.get('x-robots-tag'), /noindex/);
      for (const d of BOARD) assert.ok(!html.includes(`id="${d.id}"`), `${d.id} is not in the public shell`);
    }, { user: { id: 'u1', email: 'someone@example.com' } });
    // An admin account (services/entitlements ADMIN_EMAILS) gets the dreams.
    await withApp(async base => {
      const j = await (await fetch(`${base}/api/dream?view=html`)).json();
      assert.deepEqual(j.dreams.filter(d => d.kind === 'vision').map(d => d.id), BOARD.map(d => d.id));
      assert.match(j.html, /dr-panel/);
    }, { user: { id: 'a1', email: 'mugendiz@gmail.com' } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
  }
});

test('localhost (not production): the scroll renders in full without signing in', async () => {
  delete process.env.NODE_ENV;
  // The test server answers on 127.0.0.1, which counts as local.
  await withApp(async base => {
    const page = await fetch(`${base}/dream`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    for (const d of BOARD) assert.ok(html.includes(`id="${d.id}"`), d.id);
    assert.equal((html.match(/class="dr-btn dr-btn--share"/g) || []).length, BOARD.length, 'every dream can be shared');
    assert.equal((await fetch(`${base}/api/dream`)).status, 200);
  });
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
