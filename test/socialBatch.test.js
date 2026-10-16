// test/socialBatch.test.js — the Tuesday batch's draft checker. The batch
// email is where the shareability standard is enforced, so the checks that
// flag a list, a static first frame, a stale "new" or a dash are tested here
// against drafts shaped like the ones Grok actually returned.
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkPost, formatBatch, seasonalPicks } = require('../services/socialBatch');
const { lint } = require('../services/copyStyle');

const places = [
  { id: 'cur-niagara-takes-flight', venue: 'Niagara Parks — Table Rock Centre', is_new: false },
  { id: 'cur-wave-pool-rh', venue: 'The Wave Pool', is_new: false }
];

const good = {
  post_day: 'Sat Oct 3',
  concept: 'Talking to camera about the Niagara flying theatre',
  hook: 'James Cameron narrates a ride in Niagara.',
  frame_one: 'Founder mid-sentence, handheld selfie',
  script: 'James Cameron narrates a ride in Niagara. You fly the whole river on a 17 metre dome.',
  payoff_at_seconds: 4,
  share_trigger: 'currency',
  share_line: 'Tag whoever is driving to Niagara this weekend.',
  caption: 'Indoors, ages 5 and up. The rest of the day is at dayhop.quest',
  hashtags: ['NiagaraFalls', '#TorontoFamilies'],
  footage: 'Selfie video in the kitchen',
  fact_source: 'cur-niagara-takes-flight'
};

test('a draft that passes every gate has no problems', () => {
  assert.deepEqual(checkPost(good, places), []);
});

test('flags the failure shapes from the Sep 29 batch', () => {
  const bad = {
    ...good,
    hook: 'That moment your kid looks at you at 9:02 AM and says bored',
    concept: 'A 5-slide guide to five indoor spots',
    frame_one: 'Clean carousel slide with a text card',
    caption: 'The new flying theatre is finally open — worth the drive?',
    share_trigger: 'engagement',
    footage: 'Zeely avatar talking'
  };
  const problems = checkPost(bad, places).join('\n');
  assert.match(problems, /caption: .*em dash/);
  assert.match(problems, /hook is \d+ words/);
  assert.match(problems, /list or ranking/);
  assert.match(problems, /share trigger "engagement"/);
  assert.match(problems, /frame one is static/);
  assert.match(problems, /avatar, AI or stock/);
  assert.match(problems, /calls .* new, but it is past its new window/);
});

test('flags claims Grok added on top of the catalog fact (Sep 29 dry run)', () => {
  const tews = { id: 'cur-dundas-peak', venue: 'Dundas Peak', is_new: false,
    fact: "The trail past Tews Falls (Ontario's tallest ribbon waterfall) up to the cliff-edge lookout." };
  const draft = { ...good, fact_source: 'cur-dundas-peak',
    hook: "Ontario's tallest waterfall hike?",
    script: 'The ledge is totally safe for kids. Only 45 minutes from Toronto.' };
  const problems = checkPost(draft, [tews]).join('\n');
  assert.match(problems, /"tallest waterfall" is not in the catalog fact/);
  assert.match(problems, /"safe" is not in the catalog fact/);
  assert.match(problems, /"45 minutes from" is not in the catalog fact/);
  const faithful = { ...draft, hook: "Ontario's tallest ribbon waterfall?", script: 'Up to the cliff-edge lookout.' };
  assert.deepEqual(checkPost(faithful, [tews]), []);
});

test('general-knowledge and unknown facts are flagged for checking', () => {
  assert.match(checkPost({ ...good, fact_source: 'general: Frobisher 1578' }, places).join(), /verify before posting \(Frobisher 1578\)/);
  assert.match(checkPost({ ...good, fact_source: 'cur-made-up' }, places).join(), /not one of this week's catalog places/);
  assert.match(checkPost({ ...good, fact_source: '' }, places).join(), /no fact_source/);
});

test('the email marks each draft and drops the stale Zeely checklist', () => {
  const text = formatBatch([good, { ...good, hook: 'Five spots ranked for rainy days' }], places, new Date('2026-09-29T13:00:00Z'));
  assert.match(text, /week of 2026-09-29/);
  assert.match(text, /1\. Sat Oct 3: .*\n   READY TO FILM/);
  assert.match(text, /2\. Sat Oct 3: .*\n   FIX FIRST/);
  assert.doesNotMatch(text, /Zeely|ZERO posts/);
  // The checklist and headings are fixed copy the operator pastes from.
  const fixed = text.split('\n').filter(l => /^(DayHop|\d+ short videos|Posting|  \d\.)/.test(l)).join('\n');
  assert.deepEqual(lint(fixed), []);
});

test('grounding picks carry facts, rotate by week, and know what is no longer new', () => {
  const a = seasonalPicks(12, new Date('2026-09-29T13:00:00Z'));
  const b = seasonalPicks(12, new Date('2026-10-06T13:00:00Z'));
  assert.equal(a.length, 12);
  assert.ok(a.every(p => p.id && p.fact));
  assert.notDeepEqual(a.map(p => p.id), b.map(p => p.id));
  const niagara = [...a, ...b].find(p => p.id === 'cur-niagara-takes-flight');
  if (niagara) assert.equal(niagara.is_new, false);
});
