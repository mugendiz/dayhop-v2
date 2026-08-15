// test/seasons.test.js — the seasonal engine's promises, pinned.
// Every season must have ranking pressure: summer windows exist (June–August
// had none until 2026-08-15), warm-only ideas sink in winter, and stacked
// windows stay clamped.
const test = require('node:test');
const assert = require('node:assert/strict');
const seasons = require('../data/seasons');

const beachEntry = { title: 'Wasaga Beach', tags: ['beach', 'swim'], description: '', category: 'water' };

test('July has the three summer windows', () => {
  const ctx = seasons.getSeasonContext('2026-07-15');
  const labels = ctx.windows.map(w => w.label);
  for (const want of ['beach & splash', 'summer festivals', 'big water & caves']) {
    assert.ok(labels.includes(want), `missing window: ${want} (got ${labels.join(', ')})`);
  }
  assert.equal(ctx.season, 'summer');
});

test('January has no summer windows and boosts snow & ice', () => {
  const ctx = seasons.getSeasonContext('2026-01-15');
  const labels = ctx.windows.map(w => w.label);
  assert.ok(labels.includes('snow & ice'));
  for (const not of ['beach & splash', 'summer festivals', 'big water & caves']) {
    assert.ok(!labels.includes(not), `window out of season: ${not}`);
  }
});

test('a beach entry scores positive in July, negative in January', () => {
  const july = seasons.seasonAdjustment(beachEntry, seasons.getSeasonContext('2026-07-15'));
  const january = seasons.seasonAdjustment(beachEntry, seasons.getSeasonContext('2026-01-15'));
  assert.ok(july >= 3, `July beach delta ${july} < 3`);
  assert.ok(january <= -3, `January beach delta ${january} > -3`);
});

test('stacked windows stay clamped to [-4, +6]', () => {
  // Deliberately hits trail + beach&splash + big-water regexes at once.
  const stacked = {
    title: 'Gorge trail to a beach with a boat tour and cave',
    tags: ['beach', 'splash pad', 'kayak', 'festival', 'fireworks'],
    description: 'provincial park scenic drive', category: 'water'
  };
  const delta = seasons.seasonAdjustment(stacked, seasons.getSeasonContext('2026-07-15'));
  assert.ok(delta <= 6 && delta >= -4, `clamp broken: ${delta}`);
});

test('every window is well-formed (MM-DD dates, weight, regex)', () => {
  for (const w of seasons.WINDOWS) {
    assert.match(w.from, /^\d{2}-\d{2}$/, `${w.label} from`);
    assert.match(w.to, /^\d{2}-\d{2}$/, `${w.label} to`);
    assert.ok(Number.isFinite(w.weight) && w.weight > 0, `${w.label} weight`);
    assert.ok(w.re instanceof RegExp, `${w.label} regex`);
  }
});

test('catalog season eligibility: summer serves Apr–Oct, winter Nov–Mar', () => {
  assert.ok(seasons.isCatalogSeasonEligible('summer', 7));
  assert.ok(seasons.isCatalogSeasonEligible('summer', 4));
  assert.ok(seasons.isCatalogSeasonEligible('summer', 10));
  assert.ok(!seasons.isCatalogSeasonEligible('summer', 12));
  assert.ok(seasons.isCatalogSeasonEligible('winter', 1));
  assert.ok(!seasons.isCatalogSeasonEligible('winter', 7));
  assert.ok(seasons.isCatalogSeasonEligible(null, 1));
});
