// test/socialMonth.test.js — the monthly social formula. The calendar is
// pure date math over data/socialFormula.js, so a month can be pinned
// exactly: which day carries which pillar, where a holiday takes over the
// weekend slot, and that every photo post carries the credit its licence
// requires.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sm = require('../services/socialMonth');
const { videoSlots, groundingPlaces, checkPost } = require('../services/socialBatch');
const { lint } = require('../services/copyStyle');
const { FREE_LICENCE_RE } = require('../scripts/hero-images');

test('November 2026 follows the weekly rhythm plus the first Monday app moment', () => {
  const slots = sm.monthSlots('2026-11');
  const byDay = d => slots.filter(s => s.date === d).map(s => s.pillar);
  assert.deepEqual(byDay('2026-11-01'), ['postcard']);        // Sunday
  assert.deepEqual(byDay('2026-11-02'), ['app']);             // first Monday
  assert.deepEqual(byDay('2026-11-03'), ['hidden']);          // Tuesday
  assert.deepEqual(byDay('2026-11-04'), ['postcard']);        // Wednesday
  assert.deepEqual(byDay('2026-11-05'), ['weekend']);         // Thursday
  assert.deepEqual(byDay('2026-11-06'), []);                  // Friday is a rest day
  assert.deepEqual(byDay('2026-11-07'), ['drive']);           // Saturday
  assert.deepEqual(byDay('2026-11-09'), [], 'only the first Monday carries the app moment');
  assert.equal(slots.filter(s => s.format === 'video').length, 13);
  assert.equal(slots.filter(s => s.format === 'photo').length, 9);
  assert.ok(slots.every((s, i) => i === 0 || (slots[i - 1].date + slots[i - 1].time) <= (s.date + s.time)), 'sorted by date and time');
});

test('a holiday turns the Thursday before its weekend into the long weekend post', () => {
  const thu = (ym, date) => sm.monthSlots(ym).find(s => s.date === date);
  const thanks = thu('2026-10', '2026-10-08'); // Thanksgiving Mon Oct 12, weekend starts Sat Oct 10
  assert.equal(thanks.pillar, 'holiday');
  assert.equal(thanks.holiday.name, 'Thanksgiving');
  assert.equal(thu('2026-10', '2026-10-15').pillar, 'weekend');
  assert.equal(thu('2026-12', '2026-12-24').holiday.name, 'Christmas', 'Christmas and Boxing Day share one Thursday');
  assert.equal(thu('2026-12', '2026-12-31').holiday.name, "New Year's Day", 'next year\'s holiday reaches back into December');
});

test('every photo post is a real file with an attribution line and a free licence', () => {
  const pool = sm.photoPool();
  assert.ok(pool.length >= 18, 'enough spot photos for two months without repeats');
  for (const p of pool) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'photos', p.file)), p.file);
    assert.match(p.license, FREE_LICENCE_RE, `${p.key}: ${p.license} is not a licence we can post under`);
    assert.match(sm.creditLine(p), new RegExp(`^Photo: .+, ${p.license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
  const nov = sm.photoPicks('2026-11', 9).map(p => p.key);
  const dec = sm.photoPicks('2026-12', 9).map(p => p.key);
  assert.equal(new Set(nov).size, 9);
  assert.deepEqual(nov.filter(k => dec.includes(k)), [], 'consecutive months use different photos');
});

test('captions are checked against the house style and the fact they were given', () => {
  assert.deepEqual(sm.checkCaption('A lighthouse at the end of a five km walk into the lake.', 'a lighthouse at the end'), []);
  assert.match(sm.checkCaption('The tallest falls in Hamilton.', 'A ribbon waterfall.').join(), /"tallest" is not in the catalog fact/);
  assert.match(sm.checkCaption('Open since 1820, still free.', '').join(), /"1820" is not in the catalog fact/);
  assert.ok(sm.checkCaption('Quiet trails — no crowds.', '').length, 'a dash breaks the house style');
  assert.match(sm.checkCaption('Go now #hike', '').join(), /links or tags/);
});

test('a month builds without Grok: photo posts flag their placeholder, videos are briefed', async () => {
  const prev = process.env.GROK_API_KEY;
  delete process.env.GROK_API_KEY;
  try {
    const plan = await sm.buildMonth('2026-11', { useGrok: false });
    assert.equal(plan.label, 'November 2026');
    assert.equal(plan.rows.length, 22);
    const photo = plan.rows.find(r => r.format === 'photo');
    assert.equal(photo.status, 'FIX CAPTION');
    assert.match(photo.caption, /\n\nPhoto: .+, CC|\n\nPhoto: .+, Public domain|\n\nPhoto: .+, CC0/);
    assert.ok(photo.hashtags.length >= 5 && photo.hashtags.length <= 8);
    assert.ok(!photo.hashtags.includes('#fyp'));
    const video = plan.rows.find(r => r.format === 'video');
    assert.equal(video.status, 'FILM');
    assert.ok(video.suggestion, 'every video slot names a place or a next step');
  } finally {
    if (prev !== undefined) process.env.GROK_API_KEY = prev;
  }
});

test('suggested filming spots are outdoor places that are open that month', async () => {
  const plan = await sm.buildMonth('2026-11', { useGrok: false });
  const named = plan.rows.filter(r => r.pillar === 'hidden' || r.pillar === 'drive').map(r => r.suggestion);
  for (const s of named) assert.doesNotMatch(s, /indoor|karting|kart|climbing|playground|ski|snow ?tubing/i, s);
});

test('the CSV has one row per post and survives quotes and line breaks', async () => {
  const plan = await sm.buildMonth('2026-11', { useGrok: false });
  plan.rows[0].caption = 'Say "hi"\n\nPhoto: Someone, CC BY 2.0';
  const csv = sm.toCsv(plan);
  assert.match(csv, /^Date,Day,Time \(Toronto\),Format,Pillar,Channels,Status/);
  assert.match(csv, /"Say ""hi""\n\nPhoto: Someone, CC BY 2\.0"/);
  // Count records, not lines: quoted captions contain newlines.
  let rows = 0, quoted = false;
  for (let i = 0; i < csv.length; i++) {
    if (csv[i] === '"') quoted = !quoted;
    else if (csv[i] === '\n' && !quoted) rows++;
  }
  assert.equal(rows, plan.rows.length + 1);
});

test('the plan email\'s fixed instructions follow the house style', async () => {
  const plan = await sm.buildMonth('2026-11', { useGrok: false });
  const text = sm.formatMonth(plan);
  const fixed = text.split('\n').filter(l => /^(DayHop|\d+ posts|The CSV|How to|  \d\.)/.test(l)).join('\n');
  assert.ok(fixed.split('\n').length >= 7);
  assert.deepEqual(lint(fixed), []);
});

test('nextMonth rolls over the year', () => {
  assert.equal(sm.nextMonth(new Date('2026-10-24T14:00:00Z')), '2026-11');
  assert.equal(sm.nextMonth(new Date('2026-12-24T15:00:00Z')), '2027-01');
});

test('the Tuesday batch drafts exactly the formula\'s video slots for the coming week', () => {
  const slots = videoSlots(new Date('2026-10-20T13:00:00Z')); // Tue Oct 20
  assert.deepEqual(slots.map(s => `${s.post_day} ${s.pillar}`), [
    'Thu Oct 22 This weekend', 'Sat Oct 24 Worth the drive', 'Tue Oct 27 Hidden in plain sight'
  ]);
  const firstMonday = videoSlots(new Date('2026-10-27T13:00:00Z')).map(s => s.pillar);
  assert.ok(firstMonday.includes('App moment'), 'Mon Nov 2 falls in the window');
});

test('batch grounding carries day trips and dated events, and the app moment needs no catalog source', () => {
  const places = groundingPlaces(new Date('2026-10-06T13:00:00Z'));
  assert.ok(places.some(p => p.kind === 'catalog'));
  assert.ok(places.some(p => p.kind === 'event' && p.id === 'cur-fall-harvest-market-sugar-beach-2026'));
  assert.ok(places.every(p => p.id && p.fact));
  const appPost = {
    post_day: 'Mon Nov 2', concept: 'Screen recording of the planner', hook: 'Watch it plan Saturday.',
    frame_one: 'Phone screen scrolling, thumb moving', script: 'Typed a rainy Saturday. Got a plan.',
    payoff_at_seconds: 3, share_trigger: 'specific person', share_line: 'Send this to the parent who plans everything.',
    caption: 'Rainy Saturday, sorted. dayhop.quest', hashtags: ['#GTAfamilies'], footage: 'Screen recording', fact_source: 'app: screen recording'
  };
  assert.deepEqual(checkPost(appPost, places), []);
});
