// test/regionGate.test.js — the autopilot's geography gate. The two 2026-08
// production leaks (Golden B.C. canopy walk, Barrhaven play café) are pinned
// here forever, plus the deliberate edge cases: County-vs-Island, vague
// locations rejecting, and out-list winning ties.
const test = require('node:test');
const assert = require('node:assert/strict');
const { regionVerdict } = require('../services/regionGate');

const passes = input => assert.ok(regionVerdict(input).pass, JSON.stringify(input));
const rejects = input => assert.ok(!regionVerdict(input).pass, JSON.stringify(input));

test('coordinates are authoritative within 250 km of Toronto', () => {
  passes({ lat: 43.08, lng: -79.07 });   // Niagara Falls
  passes({ lat: 43.90, lng: -77.24 });   // Sandbanks
  passes({ lat: 45.54, lng: -78.71 });   // Canoe Lake, Algonquin
  rejects({ lat: 45.27, lng: -75.74 });  // Barrhaven (~340 km)
  rejects({ lat: 51.29, lng: -116.96 }); // Golden, B.C.
});

test('coordinates win over in-region text', () => {
  rejects({ lat: 51.29, lng: -116.96, text: 'Toronto' });
});

test('the two production leaks stay rejected on text alone', () => {
  rejects({ text: 'Barrhaven, Ottawa' });
  rejects({ text: 'Golden, B.C.' });
});

test('day-trip-belt locations pass on text', () => {
  passes({ text: 'Leslieville, Toronto' });
  passes({ text: 'near Toronto' });
  passes({ text: 'Vineland, Niagara' });
  passes({ text: 'Prince Edward County' });
  passes({ text: 'Huntsville, Muskoka' });
});

test('out-of-region text rejects', () => {
  rejects({ text: 'Plateau, Montreal' });
  rejects({ text: 'Kitsilano, Vancouver' });
  rejects({ text: 'Charlottetown, Prince Edward Island' }); // NOT the County
  rejects({ text: 'downtown Windsor' });
});

test('unplaceable locations reject (trust contract: verified is earned)', () => {
  rejects({ text: 'Somewhere, Canada' });
  rejects({ text: '' });
  rejects({});
});

test('out-list wins ties — conservative by design', () => {
  rejects({ text: 'Ottawa Street, Hamilton' }); // known, accepted false reject
});

test('DISCOVERY_MAX_KM env override widens the radius', () => {
  const prev = process.env.DISCOVERY_MAX_KM;
  process.env.DISCOVERY_MAX_KM = '400';
  try {
    passes({ lat: 45.27, lng: -75.74 }); // Barrhaven passes at 400 km
  } finally {
    if (prev === undefined) delete process.env.DISCOVERY_MAX_KM;
    else process.env.DISCOVERY_MAX_KM = prev;
  }
});
