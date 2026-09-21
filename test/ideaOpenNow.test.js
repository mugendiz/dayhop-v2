// test/ideaOpenNow.test.js — the "open now" card badge (discovery-quality-
// plan Issue 4a) depends on `open_now` surviving from the Google Places
// candidate into the idea object each feed surface hands to the client.
// Three call sites duplicate the same reattachment (browse, surprise,
// generate's Grok merge) — this pins that none of them drop the field.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toBrowseIdea } = require('../routes/browse');
const { toFeedIdea } = require('../routes/surprise');
const { mergeWithCandidates } = require('../routes/generate');

const candidate = (openNow) => ({
  id: 'venue-1', source: 'google_places', title: 'Test Venue',
  category: 'food', description: 'a spot', location: 'Toronto',
  open_now: openNow
});

test('browse feed carries open_now through to the card idea', () => {
  assert.equal(toBrowseIdea(candidate(true)).open_now, true);
  assert.equal(toBrowseIdea(candidate(false)).open_now, false);
  assert.equal(toBrowseIdea(candidate(null)).open_now, null);
});

test('surprise feed carries open_now through to the card idea', () => {
  assert.equal(toFeedIdea(candidate(true)).open_now, true);
  assert.equal(toFeedIdea(candidate(false)).open_now, false);
});

test('Grok-curated feed re-attaches the real open_now, not a Grok guess', () => {
  // Grok's own selected idea never carries open_now (it isn't given the
  // field) — mergeWithCandidates must pull the ground truth from the
  // original candidate rather than leaving it undefined.
  const grokIdea = { id: 'venue-1', title: 'Test Venue' };
  const [merged] = mergeWithCandidates([grokIdea], [candidate(true)]);
  assert.equal(merged.open_now, true);
});
