// scripts/fetch-guide-photos.js — DayHop V2
// Sources openly-licensed photos for the city guide PDFs from Wikimedia
// Commons. Only free licenses are accepted (CC0 / public domain / CC BY /
// CC BY-SA); author + license land in assets/photos/credits.json and are
// printed on each guide's back page. Thumbs at 900px keep files light.
//
//   node scripts/fetch-guide-photos.js            # fetch everything missing
//   node scripts/fetch-guide-photos.js markham-hero "Milne Dam Markham" 2
//     (re-fetch one key with a new search term, taking the Nth candidate)
//
// Curation is manual: run, LOOK at every image, re-fetch the misses with
// better terms. Never ship a photo nobody has looked at.

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUT = path.join(__dirname, '..', 'assets', 'photos');
const CREDITS = path.join(OUT, 'credits.json');
const UA = 'DayHopGuides/1.0 (admin@dayhop.quest) axios';

const OK_LICENSES = /^(cc0|public domain|pd|cc[- ]by(?:[- ]sa)?[- ]?\d?\.?\d?)/i;

// key → default Commons search term
const MANIFEST = {
  'markham-hero': 'Toogood Pond Unionville',
  'markham-a': 'Milne Dam Conservation Park',
  'richmond-hill-hero': 'Lake Wilcox Richmond Hill',
  'richmond-hill-a': 'Mill Pond Richmond Hill',
  'newmarket-hero': 'Fairy Lake Newmarket Ontario',
  'newmarket-a': 'Holland Marsh',
  'toronto-hero': 'Scarborough Bluffs',
  'toronto-a': 'Toronto Islands lagoon',
  'hamilton-hero': 'Webster Falls',
  'hamilton-a': 'Cootes Paradise',
  'lake-simcoe-hero': 'Lake Simcoe shore',
  'lake-simcoe-a': 'Sibbald Point Provincial Park'
};

async function search(term) {
  const { data } = await axios.get('https://commons.wikimedia.org/w/api.php', {
    headers: { 'User-Agent': UA },
    timeout: 20000,
    params: {
      action: 'query', format: 'json', generator: 'search',
      gsrsearch: `${term} filetype:bitmap`, gsrnamespace: 6, gsrlimit: 12,
      prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: 900
    }
  });
  const pages = Object.values((data.query && data.query.pages) || {});
  pages.sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages
    .map(p => p.imageinfo && p.imageinfo[0])
    .filter(Boolean)
    .filter(i => /\.jpe?g(\?|$)/i.test(i.url || ''))
    .map(i => {
      const meta = i.extmetadata || {};
      const lic = (meta.LicenseShortName && meta.LicenseShortName.value) || '';
      return {
        thumb: i.thumburl || i.url,
        page: i.descriptionshorturl || i.descriptionurl,
        license: lic,
        author: String((meta.Artist && meta.Artist.value) || 'Unknown').replace(/<[^>]+>/g, '').trim().slice(0, 80),
        title: String((meta.ObjectName && meta.ObjectName.value) || '').slice(0, 100),
        ok: OK_LICENSES.test(lic.trim())
      };
    })
    .filter(c => c.ok);
}

async function fetchOne(key, term, nth = 1) {
  const candidates = await search(term);
  const pick = candidates[nth - 1];
  if (!pick) { console.warn(`[photos] ${key}: no licensed candidate for "${term}"`); return null; }
  const img = await axios.get(pick.thumb, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 30000 });
  const file = path.join(OUT, `${key}.jpg`);
  fs.writeFileSync(file, img.data);
  console.log(`[photos] ${key}: ${(img.data.length / 1024).toFixed(0)} KB · ${pick.license} · ${pick.author}`);
  return { key, term, license: pick.license, author: pick.author, source: pick.page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  const [argKey, argTerm, argNth] = process.argv.slice(2);
  const jobs = argKey
    ? [[argKey, argTerm || MANIFEST[argKey], Number(argNth) || 1]]
    : Object.entries(MANIFEST)
        .filter(([k]) => !fs.existsSync(path.join(OUT, `${k}.jpg`)))
        .map(([k, t]) => [k, t, 1]);
  for (const [key, term, nth] of jobs) {
    try {
      const c = await fetchOne(key, term, nth);
      if (c) credits[key] = c;
    } catch (err) {
      console.warn(`[photos] ${key} failed:`, err.message);
    }
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  console.log('[photos] credits.json updated');
})();
