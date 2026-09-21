// test/copyStyle.test.js — the house copy rule (docs/copy-style-guide.md),
// checked against the actual rendered output of every customer-facing
// template in the codebase, not just written down as a policy. A dash in
// customer-facing copy fails this test, and this test is part of
// node --test, which every PR must pass before it merges. That is the
// enforcement mechanism behind "nothing is published without matching the
// standard": a coverage gap here is a gap in the standard itself, so any new
// customer-facing template belongs in this file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { lint } = require('../services/copyStyle');

function assertNoViolations(text, label) {
  const violations = lint(text);
  assert.deepEqual(violations.map(v => v.detail), [], `${label} violates the house style`);
}

/** Strips HTML/CSS/JS comments before linting a static page: the rule
 * covers what a reader sees, not how the file talks to whoever edits it
 * next. */
function stripComments(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Drops <script> and <style> blocks entirely. CSS class names ("banner--sad")
 * and CSS custom properties ("--ink-soft") legitimately contain double
 * hyphens, and JS arithmetic ("i - mid") legitimately contains a spaced
 * single hyphen — both would false-positive the spaced-hyphen rule, which
 * was built for prose. Real copy in <script>-driven strings is covered by
 * the em/en dash check on the FULL file below, since those characters have
 * no legitimate use in code; only the spaced-hyphen check needs this
 * narrower, markup-only scope. */
function stripCodeBlocks(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

function assertNoDashChars(text, label) {
  const s = String(text || '');
  const found = [];
  if (s.includes('—')) found.push('em dash');
  if (s.includes('–')) found.push('en dash');
  assert.deepEqual(found, [], `${label} contains: ${found.join(', ')}`);
}

/** Strips JS comments from a whole source file (not just template output).
 * Only the em/en dash check runs against the result (see the app.js test
 * below): arithmetic like "Date.now() - startedAt" is real code throughout
 * this file and would false-positive the spaced-hyphen prose heuristic, so
 * that check is deliberately not run here. The `(^|[^:])` guard keeps a
 * "//" comment strip from eating "https://" inside a string literal. */
function stripJsComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------- email templates ----------
const digest = require('../services/digest');
const tottDigest = require('../services/tottDigest');
const newsletter = require('../services/newsletter');
const outreach = require('../services/outreach');

const DIGEST_FIXTURE = {
  subject: 'test', weekendLabel: 'September 27', city: 'Toronto',
  weather: { description: 'Sunny', temp_c: 22, is_rainy: false, is_extreme_heat: false, is_extreme_cold: false },
  advisories: [{ title: 'Beach closure at Cherry Beach' }],
  picks: [{
    title: 'Riverdale Farm', venue: 'Riverdale Farm', location: 'Riverdale Farm',
    description: 'A working farm in the middle of the city, free to visit.',
    category: 'general', cost_tier: 'Free', good_for_ages: 'all ages',
    booking_url: null, maps_url: 'https://maps.example/riverdale'
  }]
};

test('digest.js (Thursday weekend brief): html and text have no dash punctuation', () => {
  assertNoViolations(digest.digestHtml(DIGEST_FIXTURE, 'test-token', null), 'digest.js digestHtml');
  assertNoViolations(digest.digestText(DIGEST_FIXTURE, 'test-token'), 'digest.js digestText');
});

test('digest.js: every weather-call sentence is clean too', () => {
  for (const flags of [
    { is_rainy: true }, { is_extreme_heat: true }, { is_extreme_cold: true }, {}
  ]) {
    const d = Object.assign({}, DIGEST_FIXTURE, { weather: Object.assign({ description: 'Cloudy', temp_c: 10 }, flags) });
    assertNoViolations(digest.digestHtml(d, 'test-token', null), `digest.js digestHtml (weather ${JSON.stringify(flags)})`);
  }
});

const TOTT_FIXTURE = {
  hubName: 'Toronto & the GTA',
  picks: [{
    id: 'tott-1', title: 'Etobicoke Ribfest', venue: 'Colonel Samuel Smith Park',
    location: 'Colonel Samuel Smith Park', description: 'Ribs, live music and a midway on the lake.',
    date: '2026-09-25', date_end: '2026-09-27', cost_tier: 'free',
    booking_url: null, maps_url: 'https://maps.example/ribfest'
  }]
};

test('tottDigest.js (Monday talk of the town): html and text have no dash punctuation', () => {
  assertNoViolations(tottDigest.digestHtml(TOTT_FIXTURE, 'test-token', null), 'tottDigest.js digestHtml');
  assertNoViolations(tottDigest.digestText(TOTT_FIXTURE, 'test-token'), 'tottDigest.js digestText');
});

test('newsletter.js: confirm and welcome emails have no dash punctuation', () => {
  assertNoViolations(newsletter.confirmEmailHtml('test-token'), 'newsletter.js confirmEmailHtml');
  assertNoViolations(newsletter.confirmEmailText('test-token'), 'newsletter.js confirmEmailText');
  assertNoViolations(newsletter.welcomeEmailHtml('test-token', false), 'newsletter.js welcomeEmailHtml (no PDF)');
  assertNoViolations(newsletter.welcomeEmailHtml('test-token', true), 'newsletter.js welcomeEmailHtml (with PDF)');
  assertNoViolations(newsletter.welcomeEmailText('test-token', false), 'newsletter.js welcomeEmailText (no PDF)');
  assertNoViolations(newsletter.complianceFooter('test-token'), 'newsletter.js complianceFooter');
});

const OUTREACH_ROW = { name: 'Sunny Acres Farm', contact_name: 'Jordan', hook: 'Loved your fall photos.' };

test('outreach.js: opener bump, closing note, and coupon reply have no dash punctuation', () => {
  assertNoViolations(outreach.bumpMessage(OUTREACH_ROW).text, 'outreach.js bumpMessage');
  assertNoViolations(outreach.closeMessage(OUTREACH_ROW).text, 'outreach.js closeMessage');
  assertNoViolations(outreach.couponMessage(OUTREACH_ROW).text, 'outreach.js couponMessage');
});

// ---------- pages ----------
const advertise = require('../routes/advertise');

test('routes/advertise.js: the venue sales page has no dash punctuation', () => {
  assertNoViolations(advertise.pageHtml(), 'routes/advertise.js pageHtml');
});

// Every customer-facing static page. New pages belong in this list, or
// their copy ships unchecked (see the file header).
const STATIC_PAGES = [
  'guides.html',
  'guide.html',
  'guide-richmond-hill.html',
  'guide-richmond-hill-thanks.html',
  'index.html',
  'privacy.html',
  'terms.html'
];

for (const name of STATIC_PAGES) {
  test(`public/${name}: no em/en dash anywhere, no spaced hyphen in the markup`, () => {
    const html = fs.readFileSync(path.join(__dirname, `../public/${name}`), 'utf8');
    const clean = stripComments(html);
    assertNoDashChars(clean, `public/${name} (full file)`);
    assertNoViolations(stripCodeBlocks(clean), `public/${name} (markup only)`);
  });
}

// The main SPA client: pure JS, so no markup/code-block split applies. Only
// the em/en dash check runs (see stripJsComments) — those characters have
// no legitimate use in JS syntax, so this stays a strong, false-positive-free
// guard even against a file this size.
test('public/app.js: no em or en dash outside comments', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assertNoDashChars(stripJsComments(js), 'public/app.js');
});
