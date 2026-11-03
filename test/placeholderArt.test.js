// test/placeholderArt.test.js — the illustrated placeholder for cards with
// no photo: valid SVG, the place's name only (no dash punctuation), safe
// with hostile input, and varied per place.
const test = require('node:test');
const assert = require('node:assert/strict');
const { placeholderSvg, wrap } = require('../routes/placeholderArt');
const { lint } = require('../services/copyStyle');

test('placeholder: name only, no dash punctuation, escaped', () => {
  const svg = placeholderSvg({ category: 'kids', title: 'Lil Play Cafe — play space and coffee' });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1200 750"/);
  assert.match(svg, />Lil Play Cafe</);
  assert.ok(!svg.includes('play space'), 'tagline after the dash is dropped');
  const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' ');
  assert.deepEqual(lint(text).map(v => v.detail), []);
  const hostile = placeholderSvg({ category: 'general', title: '<script>alert(1)</script>' });
  assert.ok(!hostile.includes('<script>'));
});

test('placeholder: unknown category falls back; different places look different', () => {
  assert.match(placeholderSvg({ category: 'nope', title: 'X' }), /DAY OUT/);
  const a = placeholderSvg({ category: 'water', title: 'Bluffer\'s Park Beach' });
  const b = placeholderSvg({ category: 'water', title: 'Sugar Beach' });
  assert.notEqual(a, b);
  assert.deepEqual(wrap('A very long place name that will not fit on one line at all', 22).length, 2);
});
