// test/dream.test.js — Dream big, Toronto's winter showcase: admins and
// localhost only; only announced, current dreams show; every card cites
// its source and check date; house copy style.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');

delete process.env.SUPABASE_SERVICE_KEY;
const dream = require('../routes/dream');
const BOARD = require('../data/dreamBoard');
const { lint } = require('../services/copyStyle');

async function withApp(fn, { user = null } = {}) {
  const app = express();
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api/dream', dream.api);
  app.use(dream.page);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());

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
    await withApp(async base => {
      const j = await (await fetch(`${base}/api/dream?view=html`)).json();
      assert.deepEqual(j.dreams.filter(d => d.kind === 'vision').map(d => d.id), BOARD.visibleDreams(TODAY).map(d => d.id));
      assert.match(j.html, /dr-panel/);
      assert.ok(j.share.some(s => s.id === 'dream-end'));
    }, { user: { id: 'a1', email: 'mugendiz@gmail.com' } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
  }
});

test('localhost: the showcase renders in full, with a ticket per dream and an end card', async () => {
  delete process.env.NODE_ENV;
  await withApp(async base => {
    const page = await fetch(`${base}/dream`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    const shown = BOARD.visibleDreams(TODAY);
    for (const d of shown) assert.ok(html.includes(`id="${d.id}"`), d.id);
    assert.ok(!html.includes('id="invite-only"'), 'unannounced Casa Loma dates keep that dream hidden');
    assert.equal((html.match(/class="dr-ticket"/g) || []).length, shown.length);
    assert.match(html, /id="dream-end"/);
    assert.match(html, /fonts\.googleapis\.com\/css2\?family=Big\+Shoulders\+Display/);
  });
});

test('only announced, current dreams show, soonest first, year-round last', () => {
  const nov = BOARD.visibleDreams('2026-11-03').map(d => d.id);
  assert.equal(nov[0], 'gallery-night', 'the AGO free night on Nov 4 comes first');
  assert.ok(!nov.includes('invite-only'));
  assert.deepEqual(nov.slice(-3), ['nordic-spa', 'afternoon-tea', 'helicopter']);
  const jan = BOARD.visibleDreams('2027-01-20').map(d => d.id);
  assert.ok(!jan.includes('horse-show') && !jan.includes('ballet'), 'past shows drop off');
  assert.ok(jan.includes('boat-show'), 'a show in progress stays');
  assert.equal(dream.whenLabel({ when: { start: '2027-01-16', end: '2027-01-24' } }), 'Jan 16 to 24, 2027');
  assert.equal(dream.whenLabel({ when: { start: '2026-11-12', end: '2027-01-03' } }), 'Nov 12 to Jan 3');
  assert.equal(dream.whenLabel({ when: null }), 'Year-round');
});

test('every dream cites a source and check date; photos are self-hosted and credited; no guessed prices', () => {
  for (const d of BOARD) {
    assert.match(d.source, /^https:\/\//, `${d.id} source`);
    assert.match(d.verified_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['official', 'press', 'listing', 'tba'].includes(d.status), d.id);
    assert.ok(d.link && /^https:\/\//.test(d.link.url), `${d.id} link`);
    if (d.image) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', d.image)), `${d.id} image file`);
      assert.match(d.credit.licence, /^(CC|Public domain)/);
      assert.match(d.credit.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.doesNotMatch(d.credit.place, /\d+ \w+ (Ln|Lane|Rd|St)\b/, 'never a house number');
    }
    // A dollar figure only where the source posted one.
    if (/\$\d/.test(d.cost)) assert.ok(['winterlicious', 'nordic-spa'].includes(d.id), `${d.id} shows a price`);
    for (const t of [d.title, d.line, d.taste, d.kicker, d.cost]) assert.deepEqual(lint(t).map(v => v.detail), [], `${d.id}: ${t}`);
  }
  assert.match(BOARD.find(d => d.id === 'invite-only').taste, /invite-only/);
});

test('the showcase page has no dash punctuation', () => {
  const html = dream.scrollHtml(BOARD.visibleDreams('2026-11-03').map(d => Object.assign(d, { when_label: dream.whenLabel(d) })));
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
  assert.deepEqual(lint(text).map(v => v.detail), []);
});
