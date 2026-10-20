// services/photoWarm.js — DayHop V2
// Nightly photo warm: resolve the card photos the default feeds will show
// tomorrow BEFORE anyone opens them, so the first visitor of the day gets
// real pictures and the per-viewer photo slice is left for long-tail cards.
//
// What it warms: the top places the venue index holds for the browse
// prompts (both modes, evergreen + this season's) in the core GTA cells,
// which is what nearly every default feed is built from. Anything already
// in the shared per-place photo cache is skipped (one batched peek), so a
// place is bought at most once per 30 days however many feeds show it.
//
// Spend: charged to the 'index' bucket like the venue-index refresh (its
// own count, not the viewers' daily photo cap), and capped per night by
// PHOTO_WARM_DAILY (default 60 ≈ $0.42). Runs right after the 03:xx
// venue-index refresh in server.js; PHOTO_WARM=off disables it.

const maps = require('./googleMaps');
const apiCache = require('./apiCache');
const venueIndex = require('./venueIndex');
const { CELLS } = require('../data/venueCells');
const { MODE_PROMPTS, seasonalPrompt } = require('../data/feedPrompts');

const PER_QUERY = 8;       // top places per (cell, prompt): roughly a feed's first screens
const CONCURRENCY = 3;

function torontoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

// The "/api/photo?name=…" card URLs worth warming, best first, deduped by
// place. Pure over the index lookups, so the test can feed it rows.
function warmTargets({ today = torontoToday(), lookup = venueIndex.lookup, cells = CELLS } = {}) {
  const queries = [...new Set([
    MODE_PROMPTS.rr, MODE_PROMPTS.adventure,
    seasonalPrompt('rr', today), seasonalPrompt('adventure', today)
  ])];
  const seen = new Set();
  const out = [];
  // Round-robin by rank across cells and prompts, so a small nightly cap
  // spreads over the whole GTA instead of finishing downtown first.
  const lists = [];
  for (const cell of cells.filter(c => c.core)) {
    const res = lookup({ queries, lat: cell.lat, lng: cell.lng, radiusKm: cell.radiusKm });
    if (!res) continue;
    for (const q of queries) if (res.byQuery[q]) lists.push(res.byQuery[q].slice(0, PER_QUERY));
  }
  for (let rank = 0; rank < PER_QUERY; rank++) {
    for (const list of lists) {
      const p = list[rank];
      const key = p && maps.leadKeyFromUrl(p.image_url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, url: p.image_url, title: p.title });
    }
  }
  return out;
}

async function warmPhotos({ max = Number(process.env.PHOTO_WARM_DAILY) || 60 } = {}) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return { candidates: 0, cached: 0, resolved: 0, failed: 0 };
  const targets = warmTargets();
  const have = await apiCache.peekMany(targets.map(t => t.key));
  const todo = targets.filter(t => !have.has(t.key)).slice(0, max);
  let resolved = 0, failed = 0, next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    while (next < todo.length) {
      const t = todo[next++];
      const name = new URLSearchParams(t.url.slice('/api/photo?'.length)).get('name');
      try {
        await maps.getPhotoUri(name, { bucket: 'index' });
        resolved++;
      } catch (err) {
        failed++;
      }
    }
  }));
  return { candidates: targets.length, cached: have.size, resolved, failed };
}

module.exports = { warmPhotos, warmTargets };
