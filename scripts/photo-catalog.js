// scripts/photo-catalog.js — one-time (re-runnable) venue-photo resolver
// for data/curatedCatalog.js. Writes data/catalogPhotos.json:
// { id: { image_url, resolved } }. Ids already present are skipped, so a
// re-run after adding catalog entries only looks up the new ones.
//
// Why: the catalog ships with no images, so every feed used to buy up to
// 16 photo Text Searches (Pro SKU, $32/1k) for the same 112 venues — and
// bought them again after every deploy, because the cache was in-memory.
// Baking the photo references in makes the catalog cost zero at runtime.
//
// Usage: node scripts/photo-catalog.js [--force] [--dry]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const maps = require('../services/googleMaps');
const catalog = require('../data/curatedCatalog');

const OUT = path.join(__dirname, '..', 'data', 'catalogPhotos.json');
let coords = {};
try { coords = require('../data/catalogCoords.json'); } catch { /* optional bias */ }

async function main() {
  const force = process.argv.includes('--force');
  const dry = process.argv.includes('--dry');
  let existing = {};
  if (!force && fs.existsSync(OUT)) existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));

  const out = { ...existing };
  let hits = 0, misses = 0, skipped = 0;
  const todo = catalog.filter(e => !(out[e.id] && out[e.id].resolved));
  console.log(`${todo.length} catalog entries need a photo lookup (${catalog.length - todo.length} already resolved)`);
  if (dry) return;

  for (const e of todo) {
    const place = e.venue || e.title;
    const area = e.location && e.location !== place ? e.location : 'Ontario';
    const query = `${place}, ${area}`;
    const c = e.lat != null ? e : coords[e.id];
    try {
      const image_url = await maps.findPhotoUrl({
        query, lat: c ? c.lat : null, lng: c ? c.lng : null
      });
      out[e.id] = { image_url: image_url || null, resolved: new Date().toISOString().slice(0, 10) };
      if (image_url) hits++; else misses++;
      console.log(`${image_url ? '✓' : '·'} ${e.title}`);
    } catch (err) {
      skipped++;
      console.warn(`✗ ${e.title}: ${err.message}`);
      if (err.code === 'BUDGET_EXCEEDED' || err.code === 'MAPS_NOT_CONFIGURED') break;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${OUT}: ${hits} photos, ${misses} misses, ${skipped} errors`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
