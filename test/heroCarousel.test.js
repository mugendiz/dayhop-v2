// test/heroCarousel.test.js — the homepage carousel (routes/heroCarousel.js),
// the pages its slides open, and the share sheet copy. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');

delete process.env.SUPABASE_SERVICE_KEY;
const carousel = require('../routes/heroCarousel');
const { lint } = require('../services/copyStyle');

test('slide order: fall colours, Talk of the town when it has picks, then Santa parades', () => {
  const none = carousel.slides([]);
  assert.deepEqual(none.map(s => s.key), ['fall', 'parades'], 'an empty shelf hides the Talk of the town slide');
  const withTott = carousel.slides([{ title: 'Toronto Christmas Market — Distillery', image_url: null }, { title: 'B' }]);
  assert.deepEqual(withTott.map(s => s.key), ['fall', 'tott', 'parades']);
  assert.equal(withTott[1].title, 'Toronto Christmas Market, Distillery', 'dashes become commas');
  for (const s of withTott) {
    assert.ok(s.thumb, `${s.key} has a thumbnail`);
    assert.match(s.url, /^\//);
    assert.ok(s.share && s.title && s.sub);
    for (const t of [s.title, s.sub, s.share, s.kicker]) assert.deepEqual(lint(t).map(v => v.detail), [], `${s.key}: ${t}`);
  }
  assert.ok(carousel.fallEntries().length >= 5, 'enough tagged fall colour places');
});

async function withApp(fn) {
  const app = express();
  app.use('/api/carousel', carousel.api);
  app.use(carousel.page);
  app.use(require('../routes/issues').router);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('API and /fall-colours page', async () => {
  await withApp(async base => {
    const j = await (await fetch(`${base}/api/carousel`)).json();
    assert.equal(j.slides[0].key, 'fall');
    assert.equal(j.slides[j.slides.length - 1].key, 'parades');
    const html = await (await fetch(`${base}/fall-colours`)).text();
    for (const e of carousel.fallEntries()) assert.ok(html.includes(`/places/${e.id.replace(/^cur-/, '')}`), e.id);
    const body = html.slice(html.indexOf('<body>'), html.indexOf('<footer>')).replace(/<style[\s\S]*?<\/style>/g, '');
    assert.deepEqual(lint(body.replace(/<[^>]+>/g, ' ')).map(v => v.detail), []);
  });
});

test('/talk-of-the-town with no saved issue: live picks when the shelf has them, else not found', async () => {
  await withApp(async base => {
    const empty = await fetch(`${base}/talk-of-the-town`, { redirect: 'manual' });
    assert.equal(empty.status, 404, 'empty shelf: honest not found');
  });
});

test('share sheet and carousel copy have no dash punctuation', () => {
  for (const f of ['public/share-sheet.js', 'public/hero-carousel.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const strings = (src.match(/'[^'\n]{12,}'/g) || []).map(s => s.slice(1, -1)).filter(s => /[a-z] [a-z]/i.test(s) && !/[<>{}]/.test(s));
    for (const s of strings) assert.deepEqual(lint(s).map(v => v.detail), [], `${f}: ${s}`);
  }
});
