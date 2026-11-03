// test/emailKit.test.js — the picture newsletters (services/emailKit.js):
// every pick shows an image an email client can load, Google Places photos
// never appear (their terms do not cover reuse in email), and the tracking
// that measures the newsletter is intact. Offline: templates are pure.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PUBLIC_BASE_URL = 'https://dayhop.quest';
const kit = require('../services/emailKit');
const digest = require('../services/digest');
const tott = require('../services/tottDigest');

const picks = [
  { title: 'Hero pick', category: 'general', description: 'A trail with a view.', venue: 'Rouge Park', image_url: '/img/heroes/cur-rouge-vista.jpg', image_credit: { author: 'Jane Doe', licence: 'CC BY-SA 4.0' }, maps_url: 'https://maps.example/1' },
  { title: 'Google photo pick', category: 'food', description: 'Dinner.', venue: 'Somewhere', image_url: '/api/photo?name=places%2FX%2Fphotos%2FY', maps_url: 'https://maps.example/2' },
  { title: 'Inlined Google pick', category: 'kids', description: 'Play.', venue: 'Elsewhere', image_url: 'https://lh3.googleusercontent.com/p/abc=w800', maps_url: 'https://maps.example/3' },
  { title: 'Partner event', category: 'culture', date: '2026-11-07', description: 'A show.', venue: 'Hall', image_url: 'https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimages%2F1.jpg', booking_url: 'https://www.eventbrite.ca/e/1' },
  { title: 'Random host pick', category: 'water', description: 'Boats.', venue: 'Harbour', image_url: 'https://random-blog.example/photo.jpg', maps_url: 'https://maps.example/5' }
];

const imgs = html => [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];

function checkEmail(html, label) {
  const tags = imgs(html).filter(t => !/width="1"/.test(t)); // open pixel aside
  // masthead + one image per pick
  assert.equal(tags.length, 1 + picks.length, `${label}: masthead plus one image per pick`);
  for (const t of tags) {
    assert.match(attr(t, 'src') || '', /^https:\/\//, `${label}: absolute https image URL`);
    assert.ok((attr(t, 'alt') || '').trim().length > 0, `${label}: alt text on every image`);
    assert.doesNotMatch(attr(t, 'src'), /\.webp(\?|$)/i, `${label}: no WebP (Outlook)`);
  }
  assert.doesNotMatch(html, kit.GOOGLE_PHOTO_RE, `${label}: no Google photo URL anywhere`);
  assert.match(html, /\/img\/heroes\/cur-rouge-vista\.jpg/, `${label}: the self-hosted hero is used`);
  assert.match(html, /Photo: Jane Doe, CC BY-SA 4\.0/, `${label}: the hero's credit is shown`);
  assert.match(html, /img\.evbuc\.com/, `${label}: the partner's event image is used`);
  assert.match(html, /\/img\/email\/cat-food\.png/, `${label}: a Google-photo pick falls back to its banner`);
  assert.match(html, /\/img\/email\/cat-water\.png/, `${label}: an unknown host falls back to its banner`);
}

test('weekend brief: every pick has a loadable picture, never a Google photo', () => {
  const d = { picks, weather: { description: 'Sunny', temp_c: 9 }, advisories: [], city: 'Toronto', weekendLabel: 'November 7' };
  const html = digest.digestHtml(d, 'tok', { issue: '2026-11-05', sid: 'abc' });
  checkEmail(html, 'weekend brief');
  assert.match(html, /masthead-weekend\.png/);
  assert.match(html, /Weekend weather/);
  assert.match(html, /\/api\/digest\/(c|click)|[?&]p=100/, 'plan buttons go through click tracking with their own index');
  assert.match(html, /unsubscribe/i);
});

test('talk of the town: same picture rules, its own masthead', () => {
  const d = { picks: picks.map(p => Object.assign({ date_end: p.date }, p)), hubName: 'Toronto' };
  const html = tott.digestHtml(d, 'tok', { issue: '2026-11-02', sid: 'abc' });
  checkEmail(html, 'talk of the town');
  assert.match(html, /masthead-tott\.png/);
});

test('plan links prefill the planner and are tagged for attribution', () => {
  const u = new URL(kit.planUrl('https://dayhop.quest', 'Rouge Park', 'weekend-brief'));
  assert.equal(u.searchParams.get('plan'), 'Plan a family day around Rouge Park');
  assert.equal(u.searchParams.get('utm_source'), 'newsletter');
  assert.equal(u.searchParams.get('utm_campaign'), 'weekend-brief');
});
