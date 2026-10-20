#!/usr/bin/env node
// scripts/guide-page-counts.js — DayHop V2
// Builds every live guide PDF and records its page count (plus the place
// count it was built from) in data/cityGuides/pageCounts.json, which the
// /guides page reads to say "33 pages" instead of guessing.
//
// Counting pages means rendering the whole PDF, too slow to do per request
// or at boot on the free Render plan, so it is a file. test/guideContents
// fails when a guide's places no longer match the recorded build: rerun
//
//   node scripts/guide-page-counts.js
//
// after editing any data/cityGuides/<city>.js file.

const fs = require('fs');
const path = require('path');
const cityGuides = require('../services/cityGuides');

(async () => {
  const out = {};
  for (const g of cityGuides.GUIDES) {
    if (g.status !== 'live') continue;
    const buf = await cityGuides.getPdf(g.slug);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    out[g.slug] = { pages, places: cityGuides.contentsOf(g).places };
    console.log(g.slug.padEnd(14), pages, 'pages');
  }
  const file = path.join(__dirname, '..', 'data', 'cityGuides', 'pageCounts.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('wrote', path.relative(process.cwd(), file));
})().catch(err => { console.error(err); process.exit(1); });
