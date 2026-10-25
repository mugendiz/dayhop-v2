#!/usr/bin/env node
// scripts/grok-guide-rerender.js — re-render a Grok tryout with photos,
// keeping Grok's text exactly as it was written (no new Grok call).
//
//   node scripts/grok-guide-rerender.js ../richmond-hill-grok-tryout.report.json
//
// Rebuilds the DayHop data chapters from the (cached) sources, puts the
// saved Grok edition back on the record, finds photos for every place
// (services/placePhotos.js) and writes <name>-photos.pdf plus the full
// record (<name>.guide.json) next to the report.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildGuideData } = require('../services/personalGuide');
const { attachPhotos } = require('../services/placePhotos');
const { renderPersonalGuidePdf } = require('../services/personalGuidePdf');

(async () => {
  const reportPath = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'richmond-hill-grok-tryout.report.json'));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const base = reportPath.replace(/\.report\.json$/, '');
  let t = Date.now();
  const g = await buildGuideData(report.order);
  g.grok = report.grok;
  console.log(`data rebuilt in ${Math.round((Date.now() - t) / 1000)} s`);
  t = Date.now();
  g.photos = await attachPhotos(g);
  const found = Object.keys(g.photos.byTitle).length;
  console.log(`photos: ${found} places, ${g.photos.scenes.length} town scenes, in ${Math.round((Date.now() - t) / 1000)} s`);
  for (const [title, ref] of Object.entries(g.photos.byTitle)) {
    console.log(`  ${title.slice(0, 55).padEnd(55)} ${ref.local ? 'DayHop hero' : ref.near != null ? `Commons ${ref.near ? 'near' : 'of'}: ${String(ref.subject).slice(0, 40)}` : `Wikipedia: ${ref.subject}`}`);
  }
  fs.writeFileSync(`${base}.guide.json`, JSON.stringify(g));
  const pdf = await renderPersonalGuidePdf(g);
  fs.writeFileSync(`${base}-photos.pdf`, pdf);
  console.log(`pdf ${base}-photos.pdf ${Math.round(pdf.length / 1024)} KB`);
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
