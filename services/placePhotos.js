// services/placePhotos.js — DayHop V2
// Real, licence-clean photos for the places in a personalized guide.
//
// Order of preference for a place:
//   1. DayHop's own verified catalog hero (data/catalogHeroes.json): chosen
//      and checked by eye, self-hosted, credited.
//   2. The free lead image of the place's own Wikipedia article. The article
//      must be about THIS place: its title has to carry most of the place
//      name's words, and it must not be the town itself. That rule exists
//      because search lands on the river beside a park or the town a park is
//      named for (scripts/hero-images.js has the history).
// Never Google Places photos (their terms do not allow storing them in a
// file we sell) and never generated images (a made-up picture of a real
// place misleads the person about to visit it).
//
// City scenes for covers and empty space come from the six city guides'
// curated photography (assets/photos, credited) and the town's own
// Wikipedia lead image.
//
// What is stored on the guide record is only references (URL or local
// path + credit); services/personalGuidePdf.js fetches the pixels at render.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
const apiCache = require('./apiCache');
const { FREE_LICENCE_RE } = require('../scripts/hero-images');

const WIKI = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'DayHopTripGuides/1.0 (https://dayhop.quest; admin@dayhop.quest)' };
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROOT = path.join(__dirname, '..');

const stripHtml = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'park', 'area', 'conservation', 'centre', 'center', 'ontario', 'canada', 'museum', 'gallery', 'trail', 'trails', 'look', 'through', 'walk', 'with', 'your', 'year', 'round', 'indoor']);
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3);
const keyWords = s => words(s).filter(w => !STOP.has(w));

// The part of a listing title that names the place: "The Wave Pool, indoor
// waves year-round" → "The Wave Pool"; "Thermëa Whitby: a Nordic spa…" →
// "Thermëa Whitby".
function placeName(title) {
  return String(title || '').split(/\s[—–-]\s|:\s|,\s/)[0].trim();
}

// ---------- 1. DayHop's verified heroes ----------
let heroIndex = null;
function heroFor(title) {
  if (!heroIndex) {
    heroIndex = new Map();
    try {
      const heroes = require('../data/catalogHeroes.json');
      for (const e of require('../data/curatedCatalog')) {
        const h = heroes[e.id];
        if (h && h.verified && h.image_url) heroIndex.set(e.title.toLowerCase(), h);
      }
    } catch (e) { /* no heroes file: Wikipedia only */ }
  }
  const h = heroIndex.get(String(title || '').toLowerCase());
  if (!h) return null;
  const c = h.image_credit || {};
  return { local: path.join(ROOT, 'public', h.image_url), credit: { author: c.author || 'Wikimedia Commons', licence: c.licence || c.license || '', source: c.source || null } };
}

// ---------- 2. Wikipedia lead images ----------
// The article's lead image, plus enough of its text to tell which Mill Pond
// Park it is (`about`: the short description and first lines).
async function wikiLeadImage(title) {
  const { data } = await axios.get(WIKI, {
    headers: HEADERS, timeout: 15000,
    params: { action: 'query', titles: title, prop: 'pageimages|description|extracts', format: 'json', piprop: 'thumbnail|name', pithumbsize: 1400, pilicense: 'free', exintro: 1, explaintext: 1, exchars: 500 }
  });
  const page = data && data.query && Object.values(data.query.pages || {})[0];
  return page && page.pageimage && page.thumbnail
    ? { file: page.pageimage, url: page.thumbnail.source, about: `${page.description || ''} ${page.extract || ''}` }
    : null;
}

async function commonsCredit(file) {
  const { data } = await axios.get(COMMONS, {
    headers: HEADERS, timeout: 15000,
    params: { action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'extmetadata|url', format: 'json' }
  });
  const page = data && data.query && Object.values(data.query.pages || {})[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const licence = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value);
  const author = stripHtml(meta.Artist && meta.Artist.value) || stripHtml(meta.Credit && meta.Credit.value);
  if (!licence || !FREE_LICENCE_RE.test(licence) || !author) return null;
  return { author: author.slice(0, 80), licence, source: info.descriptionurl };
}

// Venues whose Wikipedia photo shows a building the listing is not: the
// Ontario Science Centre article pictures the Don Mills site, closed in
// 2024, while DayHop lists its Harbourfront pop-up.
const PHOTO_DENY = new Set(['ontario science centre']);

// Is this Wikipedia article about this place? Pure, so tests can pin it.
function articleMatches(placeTitle, articleTitle, city) {
  if (PHOTO_DENY.has(String(articleTitle).toLowerCase())) return false;
  // A common-noun article ("Wave pool") is a picture of the idea, not of
  // this place: every word of a place article's name is capitalised.
  const bare = String(articleTitle).replace(/\(.*?\)/g, ' ').split(/\s+/).filter(w => w && !/^(of|the|and|at|in|on|de|du|la|le|des)$/i.test(w));
  if (bare.some(w => /^[a-z]/.test(w))) return false;
  const want = keyWords(placeName(placeTitle));
  if (!want.length) return false;
  const got = new Set(words(articleTitle));
  const cityWords = new Set(words(city));
  // The town's own article is never a photo of a park in it.
  if (words(articleTitle).every(w => cityWords.has(w) || w === 'ontario')) return false;
  return want.filter(w => got.has(w)).length / want.length >= 0.75;
}

async function wikiPhotoFor(title, city) {
  const name = placeName(title);
  return apiCache.cached({
    key: `photo:wiki:${name.toLowerCase()}|${String(city).toLowerCase()}`,
    ttlMs: TTL_MS,
    fetch: async () => {
      // The bare name first: "Royal Ontario Museum Richmond Hill Ontario"
      // returns Ontario, Ottawa and Toronto, while the bare name finds the
      // museum. The town and the province only break ties after that.
      let hit = null;
      for (const q of [name, `${name} ${city}`, `${name} Ontario`]) {
        const { data } = await axios.get(WIKI, {
          headers: HEADERS, timeout: 15000,
          params: { action: 'query', list: 'search', srsearch: q, srlimit: 4, format: 'json' }
        });
        hit = ((data && data.query && data.query.search) || []).find(h => articleMatches(title, h.title, city));
        if (hit) break;
      }
      if (!hit) return null;
      const img = await wikiLeadImage(hit.title);
      // Same name, other country: the article has to be in Ontario.
      if (!img || !/\b(ontario|toronto|greater toronto)\b/i.test(img.about)) return null;
      const credit = await commonsCredit(img.file);
      if (!credit) return null;
      return { url: img.url, credit, subject: hit.title };
    }
  });
}

// ---------- 3. Commons photos taken at the spot ----------
const SCENIC_RE = /\b(lake|pond|park|trail|garden|gardens|river|creek|falls|beach|forest|woods|ravine|marsh|valley|view|panorama|sunset|sunrise|autumn|fall colou?rs?|snow|winter|boardwalk|bluffs?|island|meadow|trees?|leaves|harbour|waterfront)\b/i;
// Geotagged Commons files within ~250 m of the listing's coordinates: real
// pictures of that spot even when the place has no Wikipedia article (most
// parks, pools and galleries). A file named for the place is "of" it; any
// other is captioned "near" it, which is what it is.
async function commonsNearby(title, lat, lng) {
  if (lat == null || lng == null) return null;
  return apiCache.cached({
    key: `photo:geo2:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`,
    ttlMs: TTL_MS,
    fetch: async () => {
      const { data } = await axios.get(COMMONS, {
        headers: HEADERS, timeout: 15000,
        params: {
          action: 'query', format: 'json', generator: 'geosearch', ggsnamespace: 6,
          ggscoord: `${lat}|${lng}`, ggsradius: 250, ggslimit: 20,
          prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: 1400
        }
      });
      const want = keyWords(placeName(title));
      const files = Object.values((data && data.query && data.query.pages) || {})
        .map(p => ({ p, ii: p.imageinfo && p.imageinfo[0] }))
        .filter(({ ii }) => ii && /jpeg/.test(ii.mime) && ii.width >= 1000 && ii.width >= ii.height)
        .map(({ p, ii }) => {
          const meta = ii.extmetadata || {};
          const licence = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value);
          const author = stripHtml(meta.Artist && meta.Artist.value);
          const named = want.length && want.filter(w => p.title.toLowerCase().includes(w)).length / want.length >= 0.5;
          return { p, ii, licence, author, named };
        })
        .filter(f => f.licence && FREE_LICENCE_RE.test(f.licence) && f.author && !/selfie|portrait|wedding|people/i.test(f.p.title))
        // A nearby file that is not named for the place must at least be a
        // landscape. The first pass put a Metro store on "Play", a plated
        // dish beside a restaurant and an airliner in the journal.
        .filter(f => f.named || SCENIC_RE.test(f.p.title));
      const pick = files.find(f => f.named) || files[0];
      if (!pick) return null;
      return {
        url: pick.ii.thumburl || pick.ii.url,
        credit: { author: pick.author.slice(0, 80), licence: pick.licence, source: pick.ii.descriptionurl },
        subject: pick.p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        near: !pick.named
      };
    }
  });
}

async function photoFor(title, city, coords = {}) {
  return heroFor(title)
    || await wikiPhotoFor(title, city).catch(() => null)
    || await commonsNearby(title, coords.lat, coords.lng).catch(() => null);
}

// ---------- city scenes ----------
async function cityScenes(city) {
  const scenes = [];
  const slug = String(city).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let credits = {};
  try { credits = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'photos', 'credits.json'), 'utf8')); } catch (e) { /* none */ }
  for (const [key, c] of Object.entries(credits)) {
    if (!key.startsWith(`${slug}-`)) continue;
    const file = path.join(ROOT, 'assets', 'photos', `${key}.jpg`);
    if (fs.existsSync(file)) scenes.push({ local: file, credit: { author: c.author, licence: c.license || c.licence, source: c.source || null }, subject: city, focal: c.focal || null });
  }
  const town = await apiCache.cached({
    key: `photo:town:${slug}`, ttlMs: TTL_MS,
    fetch: async () => {
      for (const t of [`${city}, Ontario`, city]) {
        const img = await wikiLeadImage(t).catch(() => null);
        const credit = img && await commonsCredit(img.file).catch(() => null);
        if (credit) return { url: img.url, credit, subject: t };
      }
      return null;
    }
  }).catch(() => null);
  if (town) scenes.push(town);
  return scenes;
}

/**
 * Find photos for every place the guide will print. → { byTitle, scenes }
 * Bounded: at most `max` Wikipedia lookups, four at a time.
 */
async function attachPhotos(g, { max = 70 } = {}) {
  const city = g.order.city;
  const titles = [];
  const coords = {};
  const add = e => {
    if (!e || !e.title) return;
    const src = e.listing || e;
    if (src.lat != null && !coords[e.title]) coords[e.title] = { lat: src.lat, lng: src.lng };
    if (!titles.includes(e.title)) titles.push(e.title);
  };
  if (g.grok) {
    g.grok.mustSee.forEach(add);
    g.grok.weeks.forEach(w => w.plan.forEach(add));
    g.grok.rainy.forEach(add);
  }
  [g.mustSee, g.nature, g.culture, g.family, g.active, g.dayTrips, g.more].forEach(list => (list || []).forEach(add));
  g.days.forEach(d => d.stops.forEach(add));
  const byTitle = {};
  const todo = titles.slice(0, max);
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < todo.length) {
      const t = todo[next++];
      const p = await photoFor(t, city, coords[t]);
      if (p) byTitle[t] = p;
    }
  }));
  return { byTitle, scenes: await cityScenes(city) };
}

// ---------- pixels, at render ----------
const CACHE_DIR = path.join(os.tmpdir(), 'dayhop-photo-cache');

// → JPEG Buffer (1400 px wide at most), or null. Disk-cached by source.
async function loadPixels(ref) {
  if (!ref) return null;
  const src = ref.local || ref.url;
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(src + '|1200q72').digest('hex') + '.jpg');
  try { return fs.readFileSync(file); } catch (e) { /* not cached */ }
  try {
    const raw = ref.local
      ? fs.readFileSync(ref.local)
      : (await axios.get(ref.url, { responseType: 'arraybuffer', timeout: 20000, headers: HEADERS })).data;
    const jpg = await require('sharp')(Buffer.from(raw)).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, jpg);
    return jpg;
  } catch (e) {
    return null;
  }
}

module.exports = { attachPhotos, photoFor, loadPixels, articleMatches, placeName };
