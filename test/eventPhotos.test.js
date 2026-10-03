// test/eventPhotos.test.js — a curated event must be able to carry its own
// picture. upcomingCuratedEvents hard-coded image_url to null, so every
// curated event went through the Places photo lookup, and Places can only
// return the host venue: the Royal Duck pop-up in a mall parking lot came
// back as a photo of Upper Canada Mall.
const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichIdeaImages } = require('../services/ideaPhotos');
const events = require('../data/curatedEvents');

test('every curated event with an image carries a real https URL', () => {
  for (const e of events.filter(x => x.image_url)) {
    assert.match(e.image_url, /^https:\/\//, `${e.id}: image_url must be absolute https`);
  }
});

test('the Royal Duck no longer depends on a Places lookup', () => {
  const duck = events.find(e => e.id === 'cur-royal-duck-upper-canada-2026');
  assert.ok(duck, 'the entry should exist');
  assert.ok(duck.image_url, 'without its own image it falls through to a photo of the mall');
});

test('an idea that already has an image is never sent to the photo lookup', async () => {
  // The guarantee the fix rests on. If this ever changes, an explicit event
  // image would be silently overwritten by the host venue again.
  const prev = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key-never-used';
  const maps = require('../services/googleMaps');
  const real = maps.findPhotoUrl;
  let calls = 0;
  maps.findPhotoUrl = async () => { calls++; return '/api/photo?name=places%2Fx%2Fphotos%2Fy'; };
  try {
    const mine = 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9';
    const ideas = [{ id: 'a', title: 'Bounce park', venue: 'Upper Canada Mall', image_url: mine }];
    await enrichIdeaImages(ideas, { city: 'Newmarket' });
    assert.equal(calls, 0, 'an idea with its own image was sent to Places anyway');
    assert.equal(ideas[0].image_url, mine, 'the explicit image was overwritten');
  } finally {
    maps.findPhotoUrl = real;
    if (prev === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = prev;
  }
});
