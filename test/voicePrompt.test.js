// Voice prompt (Sept 2026): the mic on the planner prompt.
//
// Two things are worth guarding here, and neither is the speech engine — that
// lives in the browser and is not testable from Node.
//
// 1. The analytics allowlist. `featured_event_open` once fired from the client
//    for weeks while the server 400'd every one of them, because the type was
//    never added to CLIENT_EVENT_TYPES. This test makes that class of drift
//    fail loudly instead of silently.
// 2. The place-name correction pass, which is the part that actually fixes
//    "court right" → "Kortright" (Chrome treats SpeechGrammarList as a no-op).
//    It is mirrored here so a careless edit to the list cannot start rewriting
//    ordinary words.

const test = require('node:test');
const assert = require('node:assert');
const analytics = require('../services/analytics');

test('voice prompt events are accepted from the client', () => {
  assert.equal(analytics.CLIENT_EVENT_TYPES.has('voice_prompt_started'), true);
  assert.equal(analytics.CLIENT_EVENT_TYPES.has('voice_prompt_committed'), true);
  assert.equal(analytics.EVENT_TYPES.has('voice_prompt_started'), true);
  assert.equal(analytics.EVENT_TYPES.has('voice_prompt_committed'), true);
});

// Mirror of VOICE_FIXES in public/app.js.
const VOICE_FIXES = [
  [/\bcourt\s?right\b/gi, 'Kortright'],
  [/\bcort\s?right\b/gi, 'Kortright'],
  [/\bkort\s?right\b/gi, 'Kortright'],
  [/\bvaughn\b/gi, 'Vaughan'],
  [/\bkleinberg\b/gi, 'Kleinburg'],
  [/\boak\s?ridge\b(?!s)/gi, 'Oak Ridges'],
  [/\bbonn?d\s?lake\b/gi, 'Bond Lake'],
  [/\bscarboro\b/gi, 'Scarborough'],
  [/\bsplash\s?pat\b/gi, 'splash pad']
];
const fix = (t) => VOICE_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), t);

test('voice fixes repair GTA place names the recogniser mishears', () => {
  assert.equal(fix('take us to court right conservation area'), 'take us to Kortright conservation area');
  assert.equal(fix('somewhere in vaughn with a splash pat'), 'somewhere in Vaughan with a splash pad');
  assert.equal(fix('a walk at bond lake or oak ridge'), 'a walk at Bond Lake or Oak Ridges');
  assert.equal(fix('the kleinberg galleries'), 'the Kleinburg galleries');
  assert.equal(fix('scarboro bluffs'), 'Scarborough bluffs');
});

test('voice fixes never touch ordinary words or correct spellings', () => {
  // Word boundaries: these must survive untouched.
  assert.equal(fix('the court ruled'), 'the court ruled');
  assert.equal(fix('right by the lake'), 'right by the lake');
  assert.equal(fix('Oak Ridges Moraine'), 'Oak Ridges Moraine'); // already plural
  assert.equal(fix('Kortright Centre'), 'Kortright Centre');     // already correct
  assert.equal(fix('Vaughan Mills'), 'Vaughan Mills');
  assert.equal(fix('a quiet splash pad'), 'a quiet splash pad');
});
