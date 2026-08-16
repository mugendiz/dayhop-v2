// test/sponsors.test.js — the trust contract around paid placements:
// at most one sponsor per feed, relevance-gated (distance/season/status),
// higher tier wins ties, shelter advisories suppress it, and the card is
// always flagged sponsored on a labeled shelf.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickFor } = require('../services/sponsors');
const { buildSections } = require('../routes/browse');

const rowWith = (id, over = {}, entry = {}) => Object.assign({
  id, tier: 'featured', status: 'active',
  starts_at: '2026-01-01T00:00:00Z', ends_at: null
}, over, {
  entry: Object.assign({
    title: `Sponsor ${id}`, category: 'kids', tags: ['indoor'],
    location: 'Vaughan', venue: `Venue ${id}`, description: 'a place',
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: 'https://maps.example', lat: 43.8, lng: -79.5, seasonal: null
  }, entry)
});

const TORONTO = { lat: 43.65, lng: -79.38 };

test('picks the one active, in-range sponsor and shapes it as a candidate', () => {
  const pick = pickFor({ coords: TORONTO, month: 8 }, [rowWith('spon-a')]);
  assert.ok(pick);
  assert.equal(pick.sponsored, true);
  assert.equal(pick.source, 'sponsor');
  assert.ok(pick.distance_km < 60);
});

test('gates: paused, expired, far, and out-of-season sponsors never show', () => {
  assert.equal(pickFor({ coords: TORONTO, month: 8 }, [rowWith('p', { status: 'paused' })]), null);
  assert.equal(pickFor({ coords: TORONTO, month: 8 }, [rowWith('e', { ends_at: '2026-01-02T00:00:00Z' })]), null);
  assert.equal(pickFor({ coords: TORONTO, month: 8 }, [rowWith('f', {}, { lat: 51.29, lng: -116.96 })]), null);
  assert.equal(pickFor({ coords: TORONTO, month: 1 }, [rowWith('s', {}, { seasonal: 'summer' })]), null);
});

test('higher tier wins the slot — that is what Anchor buys', () => {
  const pick = pickFor({ coords: TORONTO, month: 8 }, [
    rowWith('spon-feat', { tier: 'featured' }),
    rowWith('spon-anchor', { tier: 'anchor' }),
    rowWith('spon-spot', { tier: 'spotlight' })
  ]);
  assert.equal(pick.id, 'spon-anchor');
});

test('outdoor sponsors are suppressed under a shelter advisory', () => {
  const outdoor = rowWith('o', { tier: 'anchor' }, { category: 'water' });
  assert.equal(pickFor({ coords: TORONTO, month: 8, shelter: true }, [outdoor]), null);
  const indoor = rowWith('i', {}, { category: 'kids' });
  assert.ok(pickFor({ coords: TORONTO, month: 8, shelter: true }, [indoor]));
});

test('the feed renders exactly one labeled sponsored shelf', () => {
  const sponsor = pickFor({ coords: TORONTO, month: 7 }, [rowWith('spon-a')]);
  const locals = Array.from({ length: 8 }, (_, i) => ({
    id: `l${i}`, source: 'google_places', title: `Local Venue ${i}`,
    category: 'general', description: 'a spot', location: 'Toronto',
    distance_km: i + 1, rating: 4, rating_count: 20
  }));
  const ideas = buildSections(locals, {
    near: true, weather: null, part: 'morning', mode: 'rr',
    advisories: [], spotlight: null,
    dateWindow: { start: '2026-07-15', end: '2026-07-15' }, sponsor
  });
  const sponsored = ideas.filter(i => i.sponsored);
  assert.equal(sponsored.length, 1, 'exactly one sponsored card');
  assert.equal(sponsored[0].section, 'Partner pick · Sponsored ⭐');
});

test('a shelter advisory removes the sponsored shelf entirely', () => {
  const sponsor = pickFor({ coords: TORONTO, month: 7 }, [rowWith('spon-a')]);
  const ideas = buildSections([], {
    near: true, weather: null, part: 'morning', mode: 'rr',
    advisories: [{ severity: 'warning', effects: { avoid_outdoor: true } }],
    spotlight: null, dateWindow: { start: '2026-07-15', end: '2026-07-15' }, sponsor
  });
  assert.equal(ideas.filter(i => i.sponsored).length, 0);
});
