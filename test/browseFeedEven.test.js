// test/browseFeedEven.test.js — the discovery feed's card count is always
// even. Past 720px wide (public/css/main.css) .card-feed becomes a genuine
// two-column grid, and a trailing odd card leaves an empty gap beside it in
// the last row while scrolling. evenOutIdeas (routes/browse.js) is the fix:
// top up from the leftover candidate pool, or drop the odd one out if the
// pool is exhausted.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evenOutIdeas } = require('../routes/browse');

const idea = (id) => ({ id, title: `Idea ${id}` });
const candidate = (id) => ({ id, source: 'google_places', title: `Candidate ${id}`, category: 'general', description: 'a spot', location: 'Toronto' });

test('an already-even feed is left untouched', () => {
  const ideas = [idea('a'), idea('b')];
  evenOutIdeas(ideas, [candidate('a'), candidate('b'), candidate('c')], 'full');
  assert.equal(ideas.length, 2);
  assert.deepEqual(ideas.map(i => i.id), ['a', 'b']);
});

test('an odd feed is padded from an unused candidate when one exists', () => {
  const ideas = [idea('a'), idea('b'), idea('c')];
  evenOutIdeas(ideas, [candidate('a'), candidate('b'), candidate('c'), candidate('d')], 'full');
  assert.equal(ideas.length, 4);
  assert.equal(ideas[3].id, 'd');
  assert.equal(ideas[3].section, 'More to explore 🧭');
});

test('the padding card is flagged fold:true under the top5 layout', () => {
  const ideas = [idea('a'), idea('b'), idea('c')];
  evenOutIdeas(ideas, [candidate('a'), candidate('b'), candidate('c'), candidate('d')], 'top5');
  assert.equal(ideas[3].fold, true);
});

test('the padding card is NOT flagged fold under the full layout', () => {
  const ideas = [idea('a'), idea('b'), idea('c')];
  evenOutIdeas(ideas, [candidate('a'), candidate('b'), candidate('c'), candidate('d')], 'full');
  assert.equal(ideas[3].fold, undefined);
});

test('an odd feed with no leftover candidates drops the odd one out instead', () => {
  const ideas = [idea('a'), idea('b'), idea('c')];
  evenOutIdeas(ideas, [candidate('a'), candidate('b'), candidate('c')], 'full');
  assert.equal(ideas.length, 2);
  assert.deepEqual(ideas.map(i => i.id), ['a', 'b']);
});

test('an empty feed stays empty (nothing to pad, nothing to drop)', () => {
  const ideas = [];
  evenOutIdeas(ideas, [candidate('a')], 'full');
  assert.equal(ideas.length, 0);
});
