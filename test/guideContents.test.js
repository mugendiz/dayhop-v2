// test/guideContents.test.js — the numbers the guide pages sell on.
// "33 pages, 38 places, 15 stops" only builds trust while it is true, so
// every number is checked against the authored data and a real PDF build,
// and reader quotes are checked for consent before they can render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cityGuides = require('../services/cityGuides');
const { lint } = require('../services/copyStyle');
const pageCounts = require('../data/cityGuides/pageCounts.json');
const testimonials = require('../data/testimonials');

const live = cityGuides.GUIDES.filter(g => g.status === 'live');
const pagesOf = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test('guide contents: recorded page counts match a fresh PDF build', async () => {
  for (const g of live) {
    const rec = pageCounts[g.slug];
    assert.ok(rec, `${g.slug} has no page count; run node scripts/guide-page-counts.js`);
    const pages = pagesOf(await cityGuides.getPdf(g.slug));
    assert.equal(rec.pages, pages, `${g.slug} is ${pages} pages now; run node scripts/guide-page-counts.js`);
    assert.equal(rec.places, cityGuides.contentsOf(g).places, `${g.slug} places changed; run node scripts/guide-page-counts.js`);
  }
});

test('guide contents: every live card carries pages, places, days, and stops', () => {
  const rows = cityGuides.list();
  for (const g of live) {
    const row = rows.find(r => r.slug === g.slug);
    assert.ok(row.contents.pages > 0, g.slug);
    assert.ok(row.contents.places > 0, g.slug);
    assert.ok(row.contents.day_plans > 0, g.slug);
    assert.ok(row.contents.stops >= row.contents.day_plans, g.slug);
  }
});

test('guide contents: the collection anchor is the real one-at-a-time total', () => {
  const b = cityGuides.list().find(r => r.type === 'bundle');
  assert.equal(b.includes, live.length);
  assert.equal(b.separate_price, live.length * cityGuides.PRICE_CENTS / 100);
  assert.ok(b.separate_price > b.price, 'the collection must cost less than its guides bought singly');
  const each = live.map(cityGuides.contentsOf);
  assert.equal(b.contents.places, each.reduce((n, c) => n + c.places, 0));
  assert.equal(b.contents.pages, each.reduce((n, c) => n + c.pages, 0));
  assert.equal(b.contents.stops, each.reduce((n, c) => n + c.stops, 0));
});

test('guide contents: the Richmond Hill letter states its numbers correctly', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'guide-richmond-hill.html'), 'utf8');
  const c = cityGuides.contentsOf(cityGuides.bySlug('richmond-hill'));
  assert.ok(html.includes(c.pages + ' pages'), `letter should say ${c.pages} pages`);
  assert.ok(html.includes(c.pages + '-page'), `letter should say ${c.pages}-page`);
  assert.ok(html.includes(c.places + ' field-checked'), `letter should say ${c.places} field-checked places`);
  assert.ok(html.includes(c.stops + ' stops'), `letter should say ${c.stops} stops`);
  assert.ok(html.includes(c.places + ' places'), `sticky bar should say ${c.places} places`);
});

test('testimonials: only real, consented, well-formed quotes', () => {
  const slugs = new Set(cityGuides.GUIDES.map(g => g.slug).concat(cityGuides.BUNDLE.slug));
  for (const t of testimonials) {
    const who = t && t.name ? t.name : JSON.stringify(t);
    assert.equal(t.consent, true, `${who}: no publish consent on file`);
    assert.ok(t.consent_note, `${who}: say where they agreed (consent_note)`);
    assert.ok(typeof t.quote === 'string' && t.quote.trim().length >= 12, `${who}: quote missing`);
    assert.ok(t.quote.length <= 280, `${who}: trim the quote to 280 characters`);
    assert.ok(typeof t.name === 'string' && t.name.trim(), 'every quote needs a credited name');
    assert.ok(!t.guide || slugs.has(t.guide), `${who}: unknown guide ${t.guide}`);
    assert.match(String(t.date), /^\d{4}-\d{2}-\d{2}$/, `${who}: date as YYYY-MM-DD`);
    assert.deepEqual(lint(t.quote).map(v => v.detail), [], `${who}: quote breaks the house copy style`);
  }
});

test('testimonials: the API only ships consented quotes, and only display fields', () => {
  const router = require('../routes/cityGuides');
  const file = require.resolve('../data/testimonials');
  const saved = require.cache[file].exports;
  require.cache[file].exports = [
    { quote: 'Used it three Saturdays running.', name: 'A. Reader', city: 'Markham', guide: 'markham', date: '2026-10-01', source: 'email', consent: true, consent_note: 'reply 2026-10-02' },
    { quote: 'Not cleared to publish this one.', name: 'B. Reader', date: '2026-10-01', consent: false }
  ];
  try {
    const out = router.publishableTestimonials();
    assert.deepEqual(out, [{ quote: 'Used it three Saturdays running.', name: 'A. Reader', city: 'Markham', guide: 'markham' }]);
  } finally {
    require.cache[file].exports = saved;
  }
});
