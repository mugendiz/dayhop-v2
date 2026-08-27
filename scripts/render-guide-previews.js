// scripts/render-guide-previews.js — DayHop V2
// Renders page 1 of every LIVE city guide PDF to a PNG the /guides page
// shows in its preview modal. Run manually after guide content changes:
//
//   node scripts/render-guide-previews.js
//
// Output: public/img/guide-previews/<slug>.png (committed — the covers only
// change when guide content or the edition month does; regenerate then).
// Guides listed in EXTRA_PAGES also get <slug>-p<N>.png for each extra page
// (proof shots on their sales-letter pages).
// Uses pdf-to-img (devDependency) so production installs never need it.

process.env.GUIDE_DOWNLOAD_SECRET = process.env.GUIDE_DOWNLOAD_SECRET || 'preview-only';

const fs = require('fs');
const path = require('path');

(async () => {
  const { pdf } = await import('pdf-to-img');
  const cityGuides = require('../services/cityGuides');
  const outDir = path.join(__dirname, '..', 'public', 'img', 'guide-previews');
  fs.mkdirSync(outDir, { recursive: true });

  const EXTRA_PAGES = { 'richmond-hill': [4, 6] };

  for (const g of cityGuides.GUIDES.filter(g => g.status === 'live')) {
    const buffer = await cityGuides.getPdf(g.slug);
    const doc = await pdf(buffer, { scale: 1.5 });
    const wanted = new Set(EXTRA_PAGES[g.slug] || []);
    let n = 0;
    for await (const page of doc) {
      n++;
      if (n === 1) {
        const file = path.join(outDir, `${g.slug}.png`);
        fs.writeFileSync(file, page);
        console.log(`[previews] ${g.slug}.png ${(page.length / 1024).toFixed(0)} KB`);
      } else if (wanted.has(n)) {
        const file = path.join(outDir, `${g.slug}-p${n}.png`);
        fs.writeFileSync(file, page);
        console.log(`[previews] ${g.slug}-p${n}.png ${(page.length / 1024).toFixed(0)} KB`);
        wanted.delete(n);
      }
      if (n > 1 && wanted.size === 0) break;
    }
  }
})().catch(err => { console.error('[previews] failed:', err); process.exit(1); });
