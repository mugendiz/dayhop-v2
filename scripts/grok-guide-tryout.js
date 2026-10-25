#!/usr/bin/env node
// scripts/grok-guide-tryout.js — TRYOUT: a personalized guide authored by
// Grok (services/grokGuide.js) instead of assembled by code.
//
//   node scripts/grok-guide-tryout.js "Richmond Hill" 2026-10-28 2026-11-30 "with one child" [out-dir]
//
// Writes <out-dir>/<city>-grok-tryout.pdf and a .report.json with what Grok
// wrote, what the checks dropped and why, and the token usage. Skips the
// 14-day order limit on purpose: it is a tryout, not a sale.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { findPlace, buildGuideData } = require('../services/personalGuide');
const { authorWithGrok } = require('../services/grokGuide');
const { renderPersonalGuidePdf } = require('../services/personalGuidePdf');

(async () => {
  const [cityArg = 'Richmond Hill', start = '2026-10-28', end = '2026-11-30', party = 'with one child', outDir = path.join(__dirname, '..', '..')] = process.argv.slice(2);
  const place = findPlace(cityArg);
  if (!place) throw new Error(`Not an Ontario place on the list: ${cityArg}`);
  const order = { city: place.name, region: place.region, start, end, name: null, party };
  const slug = place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let t = Date.now();
  console.log(`gathering DayHop sources for ${order.city}, ${start} to ${end} ...`);
  const g = await buildGuideData(order);
  console.log(`  sources in ${Math.round((Date.now() - t) / 1000)} s`);

  t = Date.now();
  console.log('asking Grok to write the guide (live web + X search) ...');
  const { grok, dropped, usage, raw } = await authorWithGrok(g, party);
  console.log(`  Grok + checks in ${Math.round((Date.now() - t) / 1000)} s`);
  g.grok = grok;

  const pdf = await renderPersonalGuidePdf(g);
  const pdfPath = path.join(outDir, `${slug}-grok-tryout.pdf`);
  fs.writeFileSync(pdfPath, pdf);
  const report = {
    order, usage,
    kept: { must_see: grok.mustSee.length, weeks: grok.weeks.length, outings: grok.weeks.reduce((n, w) => n + w.plan.length, 0), events: grok.events.length, rainy: grok.rainy.length, tips: grok.kid_tips.length, packing: grok.packing.length },
    dropped, grok, raw
  };
  fs.writeFileSync(path.join(outDir, `${slug}-grok-tryout.report.json`), JSON.stringify(report, null, 2));
  console.log('kept', JSON.stringify(report.kept));
  console.log(`dropped ${dropped.length}:`);
  dropped.forEach(d => console.log(`  [${d.section}] ${d.title}: ${d.reason}`));
  console.log('usage', JSON.stringify(usage));
  console.log('pdf', pdfPath, `${Math.round(pdf.length / 1024)} KB`);
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
