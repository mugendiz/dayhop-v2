// test/issueShare.test.js — share-worthy newsletter issues: the forwardable
// content (hooks, best-for tags, standout), the share links and their
// attribution, the web link in the email, and the public issue page.
// Offline: Grok is stubbed, the issue store runs in memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
process.env.PUBLIC_BASE_URL = 'https://dayhop.quest';
const { enrichIssue, applyEnrichment, bestFor } = require('../services/issueEnrich');
const kit = require('../services/emailKit');
const issueStore = require('../services/issueStore');
const digest = require('../services/digest');
const tott = require('../services/tottDigest');
const { lint } = require('../services/copyStyle');

const picks = [
  { title: 'Rouge Valley loop', description: 'A free riverside trail with a boardwalk. Stroller friendly.', category: 'general', cost_tier: 'free', maps_url: 'https://maps.example/1', image_url: '/img/heroes/cur-rouge-vista.jpg' },
  { title: 'Aga Khan Museum', description: 'Indoor galleries and a courtyard.', category: 'culture', cost_tier: '$$', maps_url: 'https://maps.example/2' },
  { title: 'Thermea Whitby', description: 'Nordic spa with saunas and hot pools.', category: 'general', good_for_ages: '19+', maps_url: 'https://maps.example/3' }
];

test('best-for tags come from the data, never invented', () => {
  assert.deepEqual(bestFor(picks[0]), ['Free', 'Toddlers']);
  assert.deepEqual(bestFor(picks[1]), ['Rainy day'], '"all ages" or a museum is not a toddler pick');
  assert.deepEqual(bestFor(picks[2]), ['Date night']);
});

test('hooks: Grok lines kept when clean, dashes and failures fall back', async () => {
  const good = async () => ({ data: { hooks: ['Muddy boots, happy kids, zero cost.', 'Rain plan sorted — galleries galore.', 'x'.repeat(200)], standout: 1 } });
  const e = await enrichIssue(picks, { search: good });
  assert.equal(e.by, 'grok');
  assert.equal(e.hooks[0], 'Muddy boots, happy kids, zero cost.');
  assert.equal(e.hooks[1], 'Rain plan sorted, galleries galore.', 'dashes are rewritten, not printed');
  assert.equal(e.hooks[2], 'Nordic spa with saunas and hot pools.', 'an over-long line falls back to the first sentence');
  assert.equal(e.standout, 1);
  e.hooks.forEach(h => assert.deepEqual(lint(h), []));
  const down = await enrichIssue(picks, { search: async () => { throw new Error('Grok down'); } });
  assert.equal(down.by, 'fallback');
  assert.equal(down.hooks[0], 'A free riverside trail with a boardwalk.');
});

test('the standout leads the issue, flagged; every pick carries its hook and tags', () => {
  const out = applyEnrichment(picks, { hooks: ['a', 'b', 'c'], standout: 2 });
  assert.deepEqual(out.map(p => p.title), ['Thermea Whitby', 'Rouge Valley loop', 'Aga Khan Museum']);
  assert.equal(out[0].standout, true);
  assert.equal(out[1].standout, false);
  assert.equal(out[0].hook, 'c');
  assert.deepEqual(out[1].best_for, ['Free', 'Toddlers']);
});

test('every share channel carries utm_source=share, its medium and the campaign', () => {
  const l = kit.shareLinks(kit.issueUrl('https://dayhop.quest', 'tott', '2026-11-09'), 'tott', 'Talk of the town: X');
  const urlIn = s => decodeURIComponent(s).match(/https:\/\/dayhop\.quest\/talk-of-the-town\/2026-11-09\?[^\s&]*(&[^\s]*)?/)[0];
  for (const [ch, medium] of [['email', 'email'], ['whatsapp', 'whatsapp'], ['facebook', 'facebook']]) {
    const u = new URL(urlIn(l[ch]));
    assert.equal(u.searchParams.get('utm_source'), 'share', ch);
    assert.equal(u.searchParams.get('utm_medium'), medium, ch);
    assert.equal(u.searchParams.get('utm_campaign'), 'tott', ch);
  }
  assert.match(l.email, /^mailto:\?subject=/);
  assert.match(l.whatsapp, /^https:\/\/wa\.me\/\?text=/);
  assert.match(l.facebook, /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
});

test('emails link to their web copy and carry a tracked share row', () => {
  const enriched = applyEnrichment(picks, { hooks: ['a', 'b', 'c'], standout: 0 });
  const w = digest.digestHtml({ picks: enriched, weather: null, advisories: [], city: 'Toronto', weekendLabel: 'Nov 7', subject: 'S', issueDate: '2026-11-05' }, 'tok', { issue: '2026-11-05', sid: 'x' });
  assert.match(w, /View and share this issue on the web/);
  assert.match(w, /If you only do one thing/);
  assert.match(w, /Forward to a friend/);
  assert.match(w, /WhatsApp/);
  // Web share links go through the click tracker like every other link;
  // mailto: cannot (the tracker only redirects to http/https), so the
  // forward link is plain and carries its utm tags inside the message body.
  assert.match(w, /\/api\/digest\/click\?[^"]*p=20[0-3]/);
  assert.match(w, /%2Fweekend%2F2026-11-05%3Futm_source%3Dshare/);
  assert.match(w, /href="mailto:\?subject=/);
  assert.doesNotMatch(w, /u=mailto/i, 'no mailto through the http-only tracker');
  const t = tott.digestHtml({ picks: enriched, hubName: 'Toronto', subject: 'S', issueDate: '2026-11-09' }, 'tok', { issue: 'tott-2026-11-09', sid: 'x' });
  assert.match(t, /%2Ftalk-of-the-town%2F2026-11-09%3Futm_source%3Dshare/);
  assert.match(t, /If you only do one thing this week</, 'Talk of the town says week');
  assert.match(w, /If you only do one thing this weekend</, 'the weekend brief says weekend');
});

test('an unpublished issue (test send, failed save) has no web or share links', () => {
  const enriched = applyEnrichment(picks, { hooks: ['a', 'b', 'c'], standout: 0 });
  const w = digest.digestHtml({ picks: enriched, weather: null, advisories: [], city: 'Toronto', weekendLabel: 'Nov 7', subject: 'S' }, 'tok', { issue: '2026-11-05', sid: 'x' });
  assert.doesNotMatch(w, /View and share this issue|Forward to a friend/);
});

test('a same-day re-save keeps the first snapshot; dates are indexed for the sitemap', async () => {
  const first = await issueStore.saveIssue('weekend', '2026-10-01', { picks: [{ title: 'First' }], subject: 'one' });
  const again = await issueStore.saveIssue('weekend', '2026-10-01', { picks: [{ title: 'Second' }], subject: 'two' });
  assert.equal(again.picks[0].title, 'First');
  assert.equal(again.subject, first.subject);
  assert.ok((await issueStore.listDates('weekend')).includes('2026-10-01'));
});

test('card links: only http(s) reaches an href', () => {
  assert.equal(kit.safeHref('javascript:alert(1)', 'https://dayhop.quest'), 'https://dayhop.quest/');
  assert.equal(kit.safeHref('https://example.com/x', 'https://dayhop.quest'), 'https://example.com/x');
  const card = kit.pickCard({ title: 'X', booking_url: 'javascript:alert(1)' }, { index: 0, base: 'https://dayhop.quest', link: 'javascript:alert(1)' });
  assert.doesNotMatch(card, /javascript:/);
});

test('public issue page: saved snapshot renders with preview tags, subscribe box, share row', async () => {
  const enriched = applyEnrichment(picks, { hooks: ['Muddy boots, happy kids.', 'b', 'c'], standout: 0 });
  await issueStore.saveIssue('weekend', '2026-11-05', { picks: enriched, weather: { description: 'Sunny', temp_c: 9 }, city: 'Toronto', weekendLabel: 'November 7', subject: 'This weekend: Rouge' });
  const app = express();
  app.use(require('../routes/issues').router);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await (await fetch(`${base}/weekend/2026-11-05`)).text();
    assert.match(page, /<meta property="og:title" content="The weekend brief, Thursday, November 5, 2026 \| DayHop">/);
    assert.match(page, /<meta property="og:image" content="[^"]*\/img\/heroes\/cur-rouge-vista\.jpg">/, 'the lead pick photo unfurls');
    assert.match(page, /Get this every Thursday/);
    assert.match(page, /source: 'issue_share'/);
    assert.match(page, /data-copy="[^"]*utm_medium=copy/);
    assert.match(page, /Muddy boots, happy kids\./);
    assert.doesNotMatch(page, /\/api\/newsletter\/unsubscribe|\/api\/digest\//, 'no subscriber or tracking links on a public page');
    const latest = await fetch(`${base}/weekend`, { redirect: 'manual' });
    assert.equal(latest.status, 302);
    assert.equal(latest.headers.get('location'), '/weekend/2026-11-05');
    assert.equal((await fetch(`${base}/talk-of-the-town/2026-01-01`)).status, 404);
  } finally {
    server.close();
  }
});

test('an over-long Grok line is trimmed at its first clause break, never mid-list', () => {
  const { cleanHook } = require('../services/issueEnrich');
  assert.equal(cleanHook("Step back to the 1860s at Black Creek Pioneer Village where costumed blacksmiths, millers and tinsmiths work and kids can try real period chores and games."),
    'Step back to the 1860s at Black Creek Pioneer Village.');
  assert.equal(cleanHook("Enjoy a gentle waterfront stroll along Richmond Hill's kettle lake, with its boardwalk, playground and canoe launch on the north shore for the kids."),
    "Enjoy a gentle waterfront stroll along Richmond Hill's kettle lake.");
  assert.equal(cleanHook('Short and fine.'), 'Short and fine.');
});
