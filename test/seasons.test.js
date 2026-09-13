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

// ---------- Indoor bench (Sept 2026) ----------
// The catalog is outdoor-first and the outdoors is seasonal. Until now nothing
// ever lifted indoor: spring-to-fall a trail gained +3 and indoor gained 0, and
// the only winter rule was a penalty on warm-weather ideas — so indoor sat three
// points behind a trail in January too, and the feed had nothing to offer once
// the trails went cold.
const indoorPlay = {
  title: 'OceanLoop — indoor playground in Aurora',
  description: 'Ocean-themed indoor playground open late into the evening.',
  tags: ['indoor', 'play centre', 'kids'],
  category: 'kids'
};
const trail = { title: 'Kortright Centre conservation trails', description: 'forest trail loops', tags: ['trail'], category: 'general' };
const skating = { title: 'Outdoor skating rink', description: 'skate the loop under the lights', tags: ['skating'], category: 'general' };

test('indoor play is promoted in winter, but never above getting outside', () => {
  const jan = seasons.getSeasonContext('2026-01-15');
  assert.equal(jan.season, 'winter');
  const indoor = seasons.seasonAdjustment(indoorPlay, jan);
  const skate = seasons.seasonAdjustment(skating, jan);
  assert.ok(indoor > 0, 'indoor gets a winter lift');
  assert.ok(skate > indoor, 'outdoor winter still leads a crisp Saturday');
});

test('indoor stays on the bench spring through fall — the app is outdoor-first', () => {
  for (const day of ['2026-05-15', '2026-07-15', '2026-09-15']) {
    const ctx = seasons.getSeasonContext(day);
    assert.equal(seasons.seasonAdjustment(indoorPlay, ctx), 0, `${day}: no indoor lift`);
    assert.ok(seasons.seasonAdjustment(trail, ctx) >= 3, `${day}: trails lead`);
  }
});

test('the indoor rule does not fire on ordinary outdoor wording', () => {
  const jan = seasons.getSeasonContext('2026-01-15');
  const outdoorPlayground = { title: 'Mill Pond Park playground', description: 'swings and a big field', tags: ['park'], category: 'kids' };
  assert.equal(seasons.seasonAdjustment(outdoorPlayground, jan), 0,
    '"playground" alone must not read as indoor — most playgrounds are outside');
});

// ---------- Winter sends people to winter things (Sept 2026) ----------
// Losing the +3 was not enough on its own: trails carry strong base scores, so
// a promptless January browse still opened on ravines and arboretums. Green
// outdoors now sink in winter — but only if the place is not ALSO a winter
// destination, or the app would bury cross-country skiing for containing the
// word "trail".
const greenTrail = { title: 'Maple Nature Reserve Trail', description: 'forest trail and ravine loop', tags: ['trail'], category: 'general' };
const arboretum = { title: 'Aurora Community Arboretum', description: 'gardens and paths', tags: ['garden'], category: 'general' };
const skiHill = { title: 'Ski & snowboard day at Glen Eden', description: 'ski hill with rentals', tags: ['ski'], category: 'adventures' };
const skatingTrail = { title: 'Colonel Sam Smith figure-8 skating trail', description: 'skate the loop', tags: ['skating'], category: 'general' };
const xcInForest = { title: "Durham Regional Forest — the GTA's trail capital", description: 'trails, cross-country ski in winter', tags: ['trail', 'ski'], category: 'general' };

test('winter demotes green parks and trails', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  assert.ok(seasons.seasonAdjustment(greenTrail, jan) < 0, 'a ravine trail sinks in January');
  assert.ok(seasons.seasonAdjustment(arboretum, jan) < 0, 'an arboretum sinks in January');
});

test('winter leads with skiing, skating and tubing', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  const green = seasons.seasonAdjustment(greenTrail, jan);
  for (const c of [skiHill, skatingTrail]) {
    const d = seasons.seasonAdjustment(c, jan);
    assert.ok(d >= 3, 'winter outdoor keeps the top boost');
    assert.ok(d > green + 5, 'and clears a green trail by a wide margin');
  }
  // The order the founder asked for: outside-in-winter, then indoor, then green.
  const indoor = seasons.seasonAdjustment(
    { title: 'OceanLoop indoor playground', description: 'indoor play centre', tags: ['indoor'], category: 'kids' }, jan);
  assert.ok(seasons.seasonAdjustment(skiHill, jan) > indoor && indoor > green);
});

test('a trail that is also a winter destination is not demoted', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  assert.ok(seasons.seasonAdjustment(xcInForest, jan) > 0,
    'cross-country skiing must not sink for containing the word "trail"');
});

test('the winter penalty does not leak into the other three seasons', () => {
  for (const day of ['2026-05-15', '2026-07-15', '2026-09-15']) {
    const ctx = seasons.getSeasonContext(day);
    assert.ok(seasons.seasonAdjustment(greenTrail, ctx) >= 3, `${day}: trails still lead`);
  }
});

// ---------- Local winter play + bad weather (Sept 2026) ----------
// "As winter approaches we want NEARBY winter activities to surface — sledding,
// tobogganing, snowmen, forts — where these are done communally, get people
// outdoors." And: don't take people hiking in winter or in bad weather, unless
// they ask for it.
const toboggan = { title: 'Riverdale Park toboggan hill', description: 'sledding and snow forts all winter', tags: ['toboggan'], category: 'general' };
const rinkLocal = { title: 'Community outdoor rink', description: 'free skating', tags: ['skating'], category: 'general' };

test('local winter play outranks both the indoor bench and the ski drive', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  const sled = seasons.seasonAdjustment(toboggan, jan);
  const ski = seasons.seasonAdjustment(skiHill, jan);
  const inside = seasons.seasonAdjustment(indoorPlay, jan);
  assert.ok(sled > ski, 'the local hill beats the two-hour ski drive');
  assert.ok(sled > inside, 'and beats staying indoors');
  assert.equal(seasons.isLocalWinterPlay(toboggan), true);
  assert.equal(seasons.isLocalWinterPlay(rinkLocal), true);
  assert.equal(seasons.isLocalWinterPlay(skiHill), false, 'a ski hill is a destination, not neighbourhood play');
});

test('rain cancels the green-outdoors boost, not just offsets it', () => {
  const sep = seasons.getSeasonContext('2026-09-15');
  const dry = seasons.seasonAdjustment(greenTrail, sep, {});
  const wet = seasons.seasonAdjustment(greenTrail, sep, { wet: true });
  assert.ok(dry >= 3, 'a dry September trail still leads');
  assert.ok(wet < dry, 'a wet one does not collect the boost');
});

test('an explicit outdoor ask overrides both the winter and the wet rules', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  assert.ok(seasons.seasonAdjustment(greenTrail, jan, { outdoorAsk: true }) >
    seasons.seasonAdjustment(greenTrail, jan, {}), 'they said hike, so stop arguing');
  const sep = seasons.getSeasonContext('2026-09-15');
  assert.equal(seasons.seasonAdjustment(greenTrail, sep, { outdoorAsk: true, wet: false }),
    seasons.seasonAdjustment(greenTrail, sep, {}));
});
