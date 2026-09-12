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
