// Nearby-first feed order (Sept 2026).
//
// The complaint: with RICHMOND HILL in the header, the feed and the featured
// card still led with downtown and Toronto Islands, so half the list had to be
// deleted by hand. The cause was not a missing proximity signal — scoreCandidates
// has had one for months — it was that the signal could be out-voted. Its whole
// range is +6 to −6 and it separates 5 km from 25 km by only ~3.2 points, while
// one candidate can collect +3 theme, +3 filter, +4 newly-opened, +3 free and
// +2 mode words on content alone.
//
// So distance became a sort key instead: closest band first, relevance inside
// the band, nothing dropped. These tests pin that down.

const test = require('node:test');
const assert = require('node:assert');
const relevance = require('../services/relevance');

const at = (id, km, score) => ({ candidate: { id, distance_km: km, source: 'curated' }, score });
const ids = (list) => list.map(c => c.id);

test('distanceBand puts each km in the right bucket, edges included', () => {
  assert.deepEqual(relevance.DISTANCE_BANDS_KM, [15, 35, 70]);
  assert.equal(relevance.distanceBand(0), 0);
  assert.equal(relevance.distanceBand(15), 0);     // inclusive edge
  assert.equal(relevance.distanceBand(15.1), 1);
  assert.equal(relevance.distanceBand(35), 1);
  assert.equal(relevance.distanceBand(36), 2);
  assert.equal(relevance.distanceBand(70), 2);
  assert.equal(relevance.distanceBand(71), 3);
  // Unknown distance sits with the short-drive band: it must not crowd out
  // things we know are close, and must not be buried either.
  assert.equal(relevance.distanceBand(null), 1);
  assert.equal(relevance.distanceBand(undefined), 1);
});

test('a close place outranks a far one that scores much higher', () => {
  // This is the Richmond Hill / Ward's Island case, in miniature: the Islands
  // entry really is a better keyword match, and it still must not lead.
  const out = relevance.selectTop([
    at('islands', 34, 22),        // far, wins on every content signal
    at('bond-lake', 4, 6)         // close, modest score
  ], 60);
  assert.deepEqual(ids(out), ['bond-lake', 'islands']);
});

test('far ideas are ordered later, never dropped', () => {
  const out = relevance.selectTop([
    at('niagara', 120, 30),
    at('downtown', 30, 25),
    at('oak-ridges', 6, 3),
    at('hamilton', 60, 28)
  ], 60);
  assert.deepEqual(ids(out), ['oak-ridges', 'downtown', 'hamilton', 'niagara']);
  assert.equal(out.length, 4, 'nothing is filtered out by banding');
});

test('inside a band, relevance still decides', () => {
  const out = relevance.selectTop([
    at('near-dull', 2, 1),
    at('near-great', 14, 20),
    at('near-ok', 9, 8)
  ], 60);
  assert.deepEqual(ids(out), ['near-great', 'near-ok', 'near-dull']);
});

test('order is untouched when no location was shared', () => {
  const out = relevance.selectTop([
    { candidate: { id: 'b', source: 'curated' }, score: 5 },
    { candidate: { id: 'a', source: 'curated' }, score: 9 }
  ], 60);
  assert.deepEqual(ids(out), ['a', 'b'], 'pure relevance order survives');
  assert.equal(out[0].distance_band, undefined, 'no band is stamped without distances');
});

test('each candidate carries the band it was placed in', () => {
  const out = relevance.selectTop([at('x', 3, 5), at('y', 50, 5), at('z', 200, 5)], 60);
  assert.deepEqual(out.map(c => c.distance_band), [0, 2, 3]);
});

test('ties are broken deterministically, not by sort implementation', () => {
  const input = [at('first', 10, 5), at('second', 10, 5), at('third', 10, 5)];
  assert.deepEqual(ids(relevance.selectTop(input, 60)), ['first', 'second', 'third']);
  assert.deepEqual(ids(relevance.selectTop(input, 60)), ['first', 'second', 'third']);
});

// ---------- Seasonal destinations beat the nearby rule (Sept 2026) ----------
// Two true rules collide in winter. The feed shows nearest first, and winter
// should take people skiing — but from Richmond Hill every ski hill is ~58 km
// and every rink ~26 km, while a café is 800 m. Ranked on distance alone the
// skiing can never surface, so a place the season itself is the reason to drive
// to rides in the nearest band and is spared the far-distance penalty.
const seasons = require('../data/seasons');

const winter = { start: '2027-01-16' };
const summerish = { start: '2026-09-15' };
const mk = (id, title, description, km, category, tags) =>
  ({ id, title, description, tags: tags || [], category, distance_km: km, source: 'curated' });
const skiHill = () => mk('ski', 'Ski & snowboard day at Glen Eden', 'ski hill with rentals', 58.3, 'adventures', ['ski']);
const cafe = () => mk('cafe', 'Gate Cafe', 'coffee', 0.8, 'food', []);

test('isSeasonalDestination only fires on winter outdoors, in winter', () => {
  const jan = seasons.getSeasonContext('2027-01-16');
  const sep = seasons.getSeasonContext('2026-09-15');
  assert.equal(seasons.isSeasonalDestination(skiHill(), jan), true);
  assert.equal(seasons.isSeasonalDestination(skiHill(), sep), false, 'a ski hill is not a September destination');
  assert.equal(seasons.isSeasonalDestination(cafe(), jan), false);
});

// The exemption is capped at WORTH_TRIP_KM (40). "Take people skiing" and "no
// need to surface results 40+ km away" are both true; 40 km is where they meet.
const tobogganHill = () => mk('sled', 'Riverdale Park toboggan hill', 'sledding and snow forts', 5, 'general', ['toboggan']);
const rink = () => mk('rink', 'Community outdoor rink', 'free skating', 22, 'general', ['skating']);

test('nearby winter play rides in the nearest band — that is the point of winter', () => {
  const out = relevance.selectTop(
    relevance.scoreCandidates([tobogganHill(), rink(), cafe()], { prompt: 'a day out', mode: 'rr', dateWindow: winter }), 60);
  assert.equal(out[0].id, 'sled', 'the local hill leads a January feed');
  assert.equal(out.find(c => c.id === 'rink').distance_band, 0, 'a rink at 22 km is still a local outing');
  assert.equal(out.find(c => c.id === 'rink').seasonal_destination, true);
});

test('a 58 km ski hill is NOT surfaced unless it was asked for', () => {
  const unprompted = relevance.selectTop(
    relevance.scoreCandidates([skiHill(), cafe()], { prompt: 'a day out', mode: 'rr', dateWindow: winter }), 60);
  const ski = unprompted.find(c => c.id === 'ski');
  assert.equal(ski.distance_band, 2, 'past 40 km the drive is not assumed');
  assert.notEqual(ski.seasonal_destination, true);
  assert.equal(unprompted[0].id, 'cafe', 'what is close still leads');

  for (const prompt of ['somewhere to ski', 'a day trip worth the drive']) {
    const asked = relevance.selectTop(
      relevance.scoreCandidates([skiHill(), cafe()], { prompt, mode: 'rr', dateWindow: winter }), 60);
    assert.equal(asked.find(c => c.id === 'ski').distance_band, 0, `"${prompt}" earns the drive`);
  }
});

test('the far-distance penalty is waived only for an earned winter drive', () => {
  const ask = { prompt: 'somewhere to ski', mode: 'rr', dateWindow: winter };
  const janAsked = relevance.scoreCandidates([skiHill()], ask)[0];
  const sepAsked = relevance.scoreCandidates([skiHill()], { ...ask, dateWindow: summerish })[0];
  // Same prompt both times, so the only difference is the season: in January
  // the 58 km is forgiven, in September it is charged in full.
  assert.equal(janAsked.candidate.seasonal_destination, true);
  assert.notEqual(sepAsked.candidate.seasonal_destination, true, 'a ski hill is not a September destination');
  assert.ok(janAsked.score > sepAsked.score + 1.5,
    `January ski (${janAsked.score}) must clear September ski (${sepAsked.score}) by the waived penalty`);
});

test('asking for "a hike" does not unlock a 58 km ski hill', () => {
  // outdoorAsk lifts the winter trail demotion; it must not also buy a drive.
  const out = relevance.selectTop(
    relevance.scoreCandidates([skiHill(), cafe()], { prompt: 'a long hike', mode: 'rr', dateWindow: winter }), 60);
  assert.equal(out.find(c => c.id === 'ski').distance_band, 2);
});

test('outside winter nothing is exempt — bands behave exactly as before', () => {
  const out = relevance.selectTop(
    relevance.scoreCandidates([skiHill(), cafe()], { prompt: 'a day out', mode: 'rr', dateWindow: summerish }), 60);
  assert.equal(out.find(c => c.id === 'ski').distance_band, 2);
  assert.equal(out[0].id, 'cafe');
});
