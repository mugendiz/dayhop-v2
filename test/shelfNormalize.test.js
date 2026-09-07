// test/shelfNormalize.test.js — shelf labels are template strings with
// emoji and date-aware variants; CTR must aggregate on a stable key or it
// fragments across variants and the dashboard lies by dilution.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShelf } = require('../services/analytics');

test('emoji and whitespace strip to a stable key', () => {
  assert.equal(normalizeShelf('Worth the drive 🚗'), 'Worth the drive');
  assert.equal(normalizeShelf('Trail time 🥾'), 'Trail time');
  assert.equal(normalizeShelf('Hidden gems ✨'), 'Hidden gems');
  assert.equal(normalizeShelf('Within 15 minutes 📍'), 'Within 15 minutes');
  assert.equal(normalizeShelf('  Refuel   🍴 '), 'Refuel');
});

test('date-aware variants collapse to one key', () => {
  for (const label of ['On today 📅', 'On now 📅', 'On that day 📅', 'Those days 📅']) {
    assert.equal(normalizeShelf(label), 'On today', label);
  }
});

test('empty and emoji-only labels return null', () => {
  assert.equal(normalizeShelf(''), null);
  assert.equal(normalizeShelf('   '), null);
  assert.equal(normalizeShelf('✨'), null);
  assert.equal(normalizeShelf(null), null);
});

test('browse and surprise use of the same words agree', () => {
  // surprise.js's wider band and browse.js's summer shelf share the label —
  // they must roll up together.
  assert.equal(normalizeShelf('Worth the drive 🚗'), normalizeShelf('Worth the drive'));
});

test('the Top-5 layout shelves normalize to stable keys', () => {
  assert.equal(normalizeShelf('Top 5 picks 🏆'), 'Top 5 picks');
  assert.equal(normalizeShelf('Talk of the town 🔥'), 'Talk of the town');
  assert.equal(normalizeShelf('In the spotlight 📣'), 'In the spotlight');
});
