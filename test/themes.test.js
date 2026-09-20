// test/themes.test.js — regression guard for the matchThemes() relevance bug:
// a generic setting word ("outdoors") sitting in one theme's trigger list
// let it win ties against more specific themes it had no real claim to.
const test = require('node:test');
const assert = require('node:assert/strict');

const { matchThemes } = require('../data/themes');

test('themes: "food and drinks outdoors" matches food/patios, not nature', () => {
  const matched = matchThemes('food and drinks outdoors').map(t => t.theme);
  assert.ok(matched.includes('patios'), `expected 'patios' in ${JSON.stringify(matched)}`);
  assert.ok(matched.includes('food'), `expected 'food' in ${JSON.stringify(matched)}`);
  assert.ok(!matched.includes('nature'), `'nature' should not match a bare "outdoors" mention: ${JSON.stringify(matched)}`);
});

test('themes: "outdoors" alone matches nothing (too generic to own any theme)', () => {
  const matched = matchThemes('somewhere outdoors').map(t => t.theme);
  assert.deepEqual(matched, []);
});

test('themes: real nature triggers still work', () => {
  const matched = matchThemes('a hiking trail with a nice picnic spot').map(t => t.theme);
  assert.ok(matched.includes('nature'), `expected 'nature' in ${JSON.stringify(matched)}`);
});
