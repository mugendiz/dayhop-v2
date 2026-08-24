// test/outdoorGate.test.js — the bar/restaurant outdoor-space gate: indoor-
// only bars and restaurants leave the pool; patio/rooftop evidence (Google's
// outdoorSeating flag or the copy itself) keeps them in.

const test = require('node:test');
const assert = require('node:assert');
const { isIndoorOnlyBarOrRestaurant } = require('../services/candidates');

const drop = c => assert.strictEqual(isIndoorOnlyBarOrRestaurant(c), true, JSON.stringify(c));
const keep = c => assert.strictEqual(isIndoorOnlyBarOrRestaurant(c), false, JSON.stringify(c));

test('typed restaurants/bars need outdoor evidence', () => {
  drop({ title: 'Casa Nostra', types: ['restaurant'], outdoor_seating: null });
  drop({ title: 'The Local', types: ['pub', 'restaurant'], outdoor_seating: false });
  drop({ title: 'Vinyl Room', types: ['night_club'] });
  keep({ title: 'Casa Nostra', types: ['restaurant'], outdoor_seating: true });
  keep({ title: 'Harbour Grill', types: ['restaurant'], description: 'Lakeside patio with sunset views.' });
  keep({ title: 'Sky Lounge', types: ['bar'], description: 'Rooftop cocktails above King West.' });
  keep({ title: 'Hofbrau', types: ['restaurant'], description: 'A classic beer garden under the chestnuts.' });
});

test('the copy itself can prove the space (title counts)', () => {
  keep({ title: 'Amsterdam BrewHouse lakefront patio', types: ['restaurant', 'brewery'] });
  keep({ title: 'Rooftop Bar at the Broadview', types: ['bar'] });
});

test('non-bar/restaurant places pass untouched', () => {
  keep({ title: 'High Park', types: ['park'] });
  keep({ title: 'Sweet Olenka\'s', types: ['ice_cream_shop'] });
  keep({ title: 'Quiet Corner Cafe', types: ['cafe'] });
  keep({ title: 'St. Lawrence Market', description: 'Historic food market.' });
});

test('untyped sources gate on their own copy', () => {
  drop({ title: 'Downtown steakhouse dinner', description: 'White-tablecloth steakhouse classic.' });
  keep({ title: 'Downtown steakhouse dinner', description: 'Steakhouse with a heated rooftop terrace.' });
  keep({ title: 'Forest bathing walk', description: 'Guided slow walk under old growth.' });
});

test('dated events at venues are experiences, not venue listings', () => {
  keep({ title: 'Comedy night at the Rec Room bar', date: '2099-01-01', types: ['bar'] });
});
