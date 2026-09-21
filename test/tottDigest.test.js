// test/tottDigest.test.js — the Monday "Talk of the town" newsletter
// (services/tottDigest.js) builds its content straight from
// talkOfTown.active(), so retirement is automatic here too: an event that
// has fallen out of active()'s date filter never reaches the email, with no
// separate cleanup step. Pins subject-line shape, the refuse-to-send-empty
// guard, and HTML escaping of Grok-sourced pick text.
const test = require('node:test');
const assert = require('node:assert/strict');

const talkOfTown = require('../services/talkOfTown');
const tottDigest = require('../services/tottDigest');

const pick = (over) => Object.assign({
  id: 'tott-toronto-etobicoke-ribfest', title: 'Etobicoke Ribfest',
  venue: 'Colonel Samuel Smith Park', location: 'Colonel Samuel Smith Park',
  description: 'Ribs, live music and a midway on the lake.',
  date: '2026-09-25', date_end: '2026-09-27', cost_tier: 'free',
  booking_url: null, maps_url: 'https://maps.example/ribfest'
}, over);

test('buildTottDigest refuses to send when the shelf is empty', async () => {
  const orig = talkOfTown.active;
  talkOfTown.active = () => [];
  try {
    await assert.rejects(() => tottDigest.buildTottDigest(), /no live picks/);
  } finally {
    talkOfTown.active = orig;
  }
});

test('buildTottDigest leads the subject with the top pick', async () => {
  const orig = talkOfTown.active;
  talkOfTown.active = () => [pick(), pick({ id: 'x', title: 'Roncesvalles Polish Festival' })];
  try {
    const d = await tottDigest.buildTottDigest();
    assert.match(d.subject, /^Talk of the town: Etobicoke Ribfest \+ 1 more this week$/);
    assert.equal(d.picks.length, 2);
  } finally {
    talkOfTown.active = orig;
  }
});

test('previewTottDigest escapes pick text and dedupes an identical venue/location', async () => {
  const orig = talkOfTown.active;
  talkOfTown.active = () => [pick({ title: 'Fest <script>alert(1)</script>' })];
  try {
    const { html } = await tottDigest.previewTottDigest();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must not appear unescaped');
    assert.ok(html.includes('&lt;script&gt;'), 'title should be HTML-escaped');
    // venue === location for this pick — must appear once, not "X · X".
    assert.ok(!html.includes('Colonel Samuel Smith Park · Colonel Samuel Smith Park'));
  } finally {
    talkOfTown.active = orig;
  }
});
