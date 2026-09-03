// scripts/crawl-venue-index.js — fill or refresh the venue index by hand.
// The server also tops it up daily (VENUE_INDEX_DAILY_CALLS rows, 03:xx
// Toronto); this is for the initial fill and for forcing a cell.
//
// Usage:
//   node scripts/crawl-venue-index.js --status
//   node scripts/crawl-venue-index.js --cells core --max 400
//   node scripts/crawl-venue-index.js --cells all --max 900
//   node scripts/crawl-venue-index.js --cells richmond-hill,markham --max 100
//
// Every fetched row is one Google Text Search (Enterprise SKU, $0.04 list,
// 1,000 free a month). Charged to the 'index' bucket — it does NOT count
// against MAPS_DAILY_BUDGET_USD, so keep --max honest.
require('dotenv').config();
const venueIndex = require('../services/venueIndex');
const { CELLS } = require('../data/venueCells');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || true) : dflt;
}

async function main() {
  await venueIndex.load();
  const before = venueIndex.status();
  console.log(`index: ${before.rows}/${before.total} rows (${before.coverage_pct}%), ${before.stale} stale, L2 ${before.l2 ? 'on' : 'OFF — rows will not persist'}`);
  if (arg('status', false)) return;

  const which = String(arg('cells', 'core'));
  const cellIds = which === 'all' ? null
    : which === 'core' ? CELLS.filter(c => c.core).map(c => c.id)
    : which.split(',').map(s => s.trim()).filter(Boolean);
  const maxCalls = Number(arg('max', 100));
  const targets = venueIndex.staleTargets({ cellIds });
  console.log(`${targets.length} stale/missing rows in scope; fetching up to ${maxCalls} (~$${(Math.min(maxCalls, targets.length) * 0.04).toFixed(2)} list price)`);

  const t0 = Date.now();
  const r = await venueIndex.refreshStale({
    maxCalls, cellIds,
    onRow: ({ cell, query, count }) => console.log(`  ✓ ${cell} · ${query.slice(0, 48)} → ${count}`)
  });
  const after = venueIndex.status();
  console.log(`\nfetched ${r.fetched}, failed ${r.failed}, ${r.remaining} still stale in scope, ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`index now: ${after.rows}/${after.total} rows (${after.coverage_pct}%)`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
