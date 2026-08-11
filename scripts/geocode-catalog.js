// scripts/geocode-catalog.js — one-time (re-runnable) coordinate resolver
// for data/curatedCatalog.js. Writes data/catalogCoords.json: { id: {lat,
// lng, resolved} }. Entries with inline lat/lng are skipped; ids already in
// the output file are skipped too, so re-runs after adding catalog entries
// only geocode the new ones. Usage: node scripts/geocode-catalog.js [--force]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const maps = require('../services/googleMaps');
const catalog = require('../data/curatedCatalog');

const OUT = path.join(__dirname, '..', 'data', 'catalogCoords.json');
// Sanity box: southern Ontario. A hit outside it means the geocoder matched
// some same-named place elsewhere — better no coords than wrong ones.
const BOX = { latMin: 41.6, latMax: 46.5, lngMin: -84.0, lngMax: -74.0 };

async function main() {
  const force = process.argv.includes('--force');
  let existing = {};
  if (!force && fs.existsSync(OUT)) existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));

  const out = { ...existing };
  let hits = 0, misses = 0, skipped = 0;

  for (const e of catalog) {
    if (e.lat != null && e.lng != null) { skipped++; continue; }
    if (out[e.id] && out[e.id].lat != null) { skipped++; continue; }

    const query = `${e.venue || e.title}, ${e.location}, Ontario, Canada`;
    try {
      const geo = await maps.geocode(query);
      if (geo && geo.lat >= BOX.latMin && geo.lat <= BOX.latMax &&
          geo.lng >= BOX.lngMin && geo.lng <= BOX.lngMax) {
        out[e.id] = { lat: geo.lat, lng: geo.lng, resolved: query };
        hits++;
        console.log(`ok    ${e.id}  ${geo.lat},${geo.lng}`);
      } else {
        misses++;
        console.warn(`OUT-OF-BOX ${e.id}: ${geo ? `${geo.lat},${geo.lng}` : 'no result'} for "${query}"`);
      }
    } catch (err) {
      misses++;
      console.warn(`FAIL  ${e.id}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 120)); // stay polite on the API
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\ncatalogCoords.json: ${Object.keys(out).length} ids (${hits} new, ${misses} unresolved, ${skipped} skipped)`);
  if (misses) process.exitCode = 2;
}

main().catch(err => { console.error(err); process.exit(1); });
