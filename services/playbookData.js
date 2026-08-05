// services/playbookData.js — DayHop V2
// One source of truth for what's IN the Weekend Playbook, shared by the web
// version (routes/playbook.js) and the PDF (services/playbookPdf.js) so the
// two can never drift. Aggregates the curated catalog + active auto-catalog
// entries, deduped by title.

const curated = require('../data/curatedCatalog');

// Friendly section labels + display order. Small categories fold into
// neighbours so no section renders with one lonely card.
const SECTIONS = [
  { key: 'kids', label: 'Made for kids', blurb: 'Where little legs and short attention spans win.' },
  { key: 'adventures', label: 'Big adventures', blurb: 'The days they’ll still be talking about in December.' },
  { key: 'water', label: 'Water days', blurb: 'Beaches, splash pads, paddles, and cruises.' },
  { key: 'culture', label: 'Culture & wow', blurb: 'Immersive, beautiful, and genuinely kid-tolerant.' },
  { key: 'food', label: 'Food worth the trip', blurb: 'Markets, patios, and places where eating IS the outing.' },
  { key: 'general', label: 'Local gems', blurb: 'The quiet finds locals keep to themselves.' }
];
const CATEGORY_FOLD = { cruises: 'water', patios: 'food' };

// Auto-catalog entries ride along when available; failures never block
// (the curated list alone is the product).
function autoEntries() {
  try {
    const rows = require('./autoCatalog').entries() || [];
    return rows
      .filter(r => (r.status || 'active') === 'active')
      .map(r => r.entry || r)
      .filter(e => e && e.title && e.description);
  } catch (e) {
    return [];
  }
}

function isRainProof(e) {
  return (e.tags || []).some(t => t === 'indoor' || t === 'rainy');
}

function isNew(e) {
  if (!e.opened_at) return false;
  const ageDays = (Date.now() - new Date(e.opened_at).getTime()) / 86400000;
  return ageDays > 0 && ageDays < 425;
}

function allEntries() {
  const seen = new Set();
  const all = [];
  for (const e of [...curated, ...autoEntries()]) {
    const key = String(e.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(e);
  }
  return all;
}

/** Entries grouped into ordered sections (unknown categories → Local gems). */
function sectioned() {
  const entries = allEntries();
  const bySection = new Map(SECTIONS.map(s => [s.key, []]));
  for (const e of entries) {
    const key = CATEGORY_FOLD[e.category] || e.category;
    (bySection.get(key) || bySection.get('general')).push(e);
  }
  return {
    entries,
    sections: SECTIONS
      .map(s => ({ ...s, entries: bySection.get(s.key) }))
      .filter(s => s.entries.length),
    freeCount: entries.filter(e => e.cost_tier === 'free').length,
    rainProofCount: entries.filter(isRainProof).length
  };
}

module.exports = { SECTIONS, CATEGORY_FOLD, allEntries, sectioned, isRainProof, isNew };
