// services/copyStyle.js — DayHop V2
// The house copy rule, checked mechanically, not just written down
// (docs/copy-style-guide.md is the human-readable version of the same
// standard). Applies to every string a customer, subscriber, prospect, or
// venue partner reads: website copy, ad creatives, email. It does not apply
// to code comments, log lines, or admin-only internal text.
//
// The rule: no em dash, no en dash, and no double-hyphen standing in for
// one, in customer-facing copy. A hyphen inside a real compound word or a
// range ("7-day trial", "GTA-wide") is untouched. test/copyStyle.test.js
// runs this against the actual rendered output of every customer-facing
// template, and that test is part of node --test, which every PR must pass.

const EM_DASH = '—';
const EN_DASH = '–';
// A hyphen joining a compound word ("7-day", "GTA-wide") always sits between
// two word characters with no surrounding space. The banned pattern is a
// hyphen used AS a dash: a real character, a space, the hyphen(s), a space,
// another real character ("word - word"). Requiring a non-whitespace
// character on both sides, rather than plain \s, keeps a legitimate
// "- bullet item" at the start of a line from tripping this, since nothing
// non-whitespace precedes that leading hyphen.
//
// Deliberately NOT banned: a bare "word--word" with no spaces. That pattern
// is indistinguishable from legitimate CSS/JS syntax this same linter runs
// against in static HTML files (BEM class names like "banner--sad", CSS
// custom properties like "--ink-soft") and would false-positive on every
// one of them. The spaced form below is the actual "used a dash instead of
// deciding" tell; a bare double-hyphen in running prose is rare enough not
// to need its own rule.
const HYPHEN_AS_DASH_RE = /\S[ \t]-{1,2}[ \t]\S/;

/**
 * Find style violations in one piece of customer-facing copy. Returns a
 * list of { rule, detail }. An empty list means the text is clean.
 */
function lint(text) {
  const s = String(text || '');
  const violations = [];
  if (s.includes(EM_DASH)) {
    violations.push({ rule: 'no-dash-punctuation', detail: 'contains an em dash (—); use a period, a comma, or rewrite the sentence' });
  }
  if (s.includes(EN_DASH)) {
    violations.push({ rule: 'no-dash-punctuation', detail: 'contains an en dash (–); use a period, a comma, or rewrite the sentence' });
  }
  if (HYPHEN_AS_DASH_RE.test(s)) {
    violations.push({ rule: 'no-dash-punctuation', detail: 'contains a hyphen standing in for a dash ("word - word")' });
  }
  return violations;
}

/** True when the text has no style violations. */
function isClean(text) {
  return lint(text).length === 0;
}

/** Throws with every violation listed. Use as a hard gate in tests. */
function assertClean(text, label = 'copy') {
  const violations = lint(text);
  if (violations.length) {
    const detail = violations.map(v => v.detail).join('; ');
    throw new Error(`${label} fails the house style (docs/copy-style-guide.md): ${detail}`);
  }
}

module.exports = { lint, isClean, assertClean };
