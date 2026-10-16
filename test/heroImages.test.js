// test/heroImages.test.js — hardcoded photos are permanent and free, which is
// the point, but most of them are CC BY or CC BY-SA, and those licences are
// only satisfied if the author and licence travel with the image. These pin
// that nothing reaches a card without its credit, and that a staged but
// unreviewed photo is never served.
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../data/curatedCatalog');
const events = require('../data/curatedEvents');
const heroes = require('../data/catalogHeroes.json');
const { FREE_LICENCE_RE, stripHtml } = require('../scripts/hero-images');

// Unsplash's own licence needs no attribution, so its images are exempt.
// Everything else hardcoded must carry a full credit.
const needsCredit = url => typeof url === 'string' && !/^https:\/\/images\.unsplash\.com\//.test(url);

const assertCredit = (where, c) => {
  assert.ok(c, `${where}: hardcoded photo has no image_credit`);
  assert.ok(c.author && String(c.author).trim(), `${where}: credit has no author`);
  assert.ok(c.licence && FREE_LICENCE_RE.test(c.licence), `${where}: "${c.licence}" is not a free licence`);
  assert.match(String(c.source || ''), /^https:\/\//, `${where}: credit has no https source link`);
};

test('every hardcoded catalog photo is credited', () => {
  for (const e of catalog.filter(x => needsCredit(x.image_url))) assertCredit(e.id, e.image_credit);
});

test('every hardcoded event photo is credited', () => {
  for (const e of events.filter(x => needsCredit(x.image_url))) assertCredit(e.id, e.image_credit);
});

test('every approved hero is a real image, hotlinked over https or self-hosted, with a full credit', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const [id, h] of Object.entries(heroes).filter(([, h]) => h.verified === true)) {
    const url = String(h.image_url || '');
    if (url.startsWith('/img/heroes/')) {
      // Self-hosted: the file has to ship with the deploy, or the card breaks.
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', url)), `${id}: ${url} is not in public/`);
    } else {
      assert.match(url, /^https:\/\//, `${id}: hero image must be https or a self-hosted /img/heroes/ file`);
    }
    assertCredit(id, h.image_credit);
  }
});

test('no self-hosted hero file is orphaned', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'public', 'img', 'heroes');
  const used = new Set(Object.values(heroes).map(h => h.image_url));
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    assert.ok(used.has(`/img/heroes/${f}`), `public/img/heroes/${f} is not used by any hero`);
  }
});

test('every hero key is a real catalog entry', () => {
  const ids = new Set(catalog.map(e => e.id));
  for (const id of Object.keys(heroes)) assert.ok(ids.has(id), `${id}: hero for an entry that does not exist`);
});

test('the licence filter accepts free licences and refuses the rest', () => {
  for (const ok of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'cc-by-sa-3.0'])
    assert.ok(FREE_LICENCE_RE.test(ok), `${ok} should be accepted`);
  // NC and ND are the dangerous ones: they start with "CC BY", so a pattern
  // that only checks the prefix waves them straight through.
  for (const bad of ['Fair use', 'All rights reserved', 'Non-free', '', 'CC BY-NC 4.0',
    'CC BY-NC-SA 4.0', 'cc-by-nc-sa-3.0', 'CC BY-ND 4.0', 'CC BY-NC-ND 2.0'])
    assert.ok(!FREE_LICENCE_RE.test(bad), `${bad} must be refused`);
});

test('author HTML from Commons is reduced to plain text', () => {
  assert.equal(stripHtml('<a href="//commons.wikimedia.org/wiki/User:X">Jane Doe</a>'), 'Jane Doe');
});

// ---------- precedence ----------
// The heroes fixture is passed in through regionOpts.heroes rather than
// written over the real data file, so this cannot race other test processes
// or leave data/catalogHeroes.json dirty if a run is killed.
const { catalogCandidates } = require('../services/candidates');

const credit = { author: 'Jane Doe', licence: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:X.jpg' };
const TARGET = 'cur-hilton-falls';
const pick = heroes => catalogCandidates('waterfall hike', [], 200, { isGta: true, heroes })
  .find(c => c.id === TARGET);

test('an approved hero replaces the metered Places photo, credit and all', () => {
  const c = pick({ [TARGET]: { image_url: 'https://upload.wikimedia.org/x.jpg', image_credit: credit, verified: true } });
  assert.ok(c, `${TARGET} should be in the catalog slice`);
  assert.equal(c.image_url, 'https://upload.wikimedia.org/x.jpg');
  assert.deepEqual(c.image_credit, credit);
});

test('a staged but unreviewed hero is never served', () => {
  const c = pick({ [TARGET]: { image_url: 'https://upload.wikimedia.org/x.jpg', image_credit: credit, verified: false } });
  assert.ok(c, `${TARGET} should be in the catalog slice`);
  assert.notEqual(c.image_url, 'https://upload.wikimedia.org/x.jpg', 'an unreviewed photo reached a card');
  assert.equal(c.image_credit, null);
});

test('with no heroes at all, the baked Places photo still serves', () => {
  const c = pick({});
  assert.ok(c && c.image_url, 'removing heroes must not strip the existing photo');
});

test('self-hosted heroes are real JPEG files, never a logo PNG renamed', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const [id, h] of Object.entries(heroes).filter(([, h]) => h.verified && String(h.image_url).startsWith('/img/'))) {
    const head = fs.readFileSync(path.join(__dirname, '..', 'public', h.image_url)).subarray(0, 3);
    assert.deepEqual([...head], [0xff, 0xd8, 0xff], `${id}: ${h.image_url} is not a JPEG`);
  }
});

test('a rejected candidate is remembered and never served', () => {
  const rejected = Object.entries(heroes).filter(([, h]) => h.rejected);
  assert.ok(rejected.length > 0);
  for (const [id, h] of rejected) {
    assert.ok(!h.verified && !h.image_url, `${id}: a rejected hero must carry no image`);
  }
});
