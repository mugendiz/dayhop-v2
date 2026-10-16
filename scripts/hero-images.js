// scripts/hero-images.js — stage a licence-clean hero photo for each curated
// catalog entry, from Wikipedia and Wikimedia Commons. Writes
// data/catalogHeroes.json: { id: { image_url, image_credit, wiki_page, verified } }.
//
// Why not Google Places: those photos are random user uploads that Google's
// terms do not allow us to store, so they are re-bought against a small daily
// budget and become stock placeholders once it is spent. A Commons photo is
// free, permanent, and chosen. The catch is attribution: most are CC BY or
// CC BY-SA, so the author and licence travel with every image (rendered under
// the detail hero by photoCreditHtml in public/app.js).
//
// Everything this writes is verified:false. Search is good at "the lead photo
// of the right Wikipedia article" and unreliable at "a photo of the right
// place": a search for a small conservation area can land on the river it
// sits beside, or on a town of the same name. services/candidates.js serves
// only verified heroes, so review is the gate, not an optional extra.
//
// Usage:
//   node scripts/hero-images.js            stage candidates for entries without one
//   node scripts/hero-images.js --force    re-stage everything not yet verified
//   node scripts/hero-images.js --dry      show what it would stage, write nothing
//   node scripts/hero-images.js --approve cur-a,cur-b   mark reviewed heroes verified
//   node scripts/hero-images.js --reject  cur-a         drop a bad candidate
//   node scripts/hero-images.js --download public/img/heroes
//        also save each staged photo there, so an approved hero is served
//        from dayhop.quest instead of hotlinked from Wikimedia
//
// This sandbox cannot reach Wikimedia, so the staging run happens in GitHub
// Actions (.github/workflows/hero-photos.yml), which pushes the candidates
// and their files to a review branch. Every file is looked at before
// --approve; the search is wrong often enough that review is the gate.
//
// Needs outbound access to en.wikipedia.org, commons.wikimedia.org and
// upload.wikimedia.org. No API key.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const catalog = require('../data/curatedCatalog');

const OUT = path.join(__dirname, '..', 'data', 'catalogHeroes.json');
const WIKI = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks every client for a descriptive agent with a way to reach
// the operator, and throttles anonymous ones.
const HEADERS = { 'User-Agent': 'DayHopHeroImages/1.0 (https://dayhop.quest; admin@dayhop.quest)' };
// Free licences only. pilicense=free already filters at the source; this is
// the second check, because a wrong licence on a card is a legal problem and
// not a cosmetic one.
//
// The negative lookahead is load-bearing. The first version only anchored the
// start, so "CC BY-NC 4.0" matched on its "CC BY" prefix. NC is NonCommercial
// and DayHop sells guides and ad placements, so serving an NC photo would
// breach its licence. ND (NoDerivatives) is refused too: a crop for a card
// tile can count as an adaptation, and the risk is not worth one photo.
const FREE_LICENCE_RE = /^(?!.*\b(nc|nd)\b)(cc[ -]?by(-sa)?|cc0|cc zero|public domain|pd\b)/i;
// Cards render at about 400px and the detail hero at about 800px, so 960
// keeps files small enough to commit (roughly 150 KB each).
const THUMB_PX = 960;
const PAUSE_MS = 300;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function load() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; }
}
function save(data) {
  const sorted = Object.fromEntries(Object.keys(data).sort().map(k => [k, data[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
}

async function wikiTitleFor(entry) {
  const q = [entry.venue, entry.location].filter(Boolean).join(' ');
  const { data } = await axios.get(WIKI, {
    headers: HEADERS, timeout: 15000,
    params: { action: 'query', list: 'search', srsearch: q, srlimit: 1, format: 'json' }
  });
  return data && data.query && data.query.search && data.query.search[0]
    ? data.query.search[0].title : null;
}

async function freeLeadImage(title) {
  const { data } = await axios.get(WIKI, {
    headers: HEADERS, timeout: 15000,
    params: {
      action: 'query', titles: title, prop: 'pageimages', format: 'json',
      piprop: 'thumbnail|name', pithumbsize: THUMB_PX, pilicense: 'free'
    }
  });
  const page = data && data.query && Object.values(data.query.pages || {})[0];
  if (!page || !page.pageimage || !page.thumbnail) return null;
  return { file: page.pageimage, url: page.thumbnail.source };
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
  if (!licence || !FREE_LICENCE_RE.test(licence)) return { rejected: `licence "${licence || 'none'}"` };
  if (!author) return { rejected: 'no author to credit' };
  return { author: author.slice(0, 120), licence, source: info.descriptionurl };
}

async function stage({ force, dry }) {
  const heroes = load();
  let staged = 0, missed = 0, kept = 0;
  for (const entry of catalog) {
    const existing = heroes[entry.id];
    if (existing && existing.verified) { kept++; continue; }
    if (existing && !force) { kept++; continue; }
    try {
      const title = await wikiTitleFor(entry);
      if (!title) { missed++; console.log(`  -      ${entry.id}: no article`); continue; }
      const img = await freeLeadImage(title);
      if (!img) { missed++; console.log(`  -      ${entry.id}: "${title}" has no free lead image`); continue; }
      const credit = await commonsCredit(img.file);
      if (!credit || credit.rejected) {
        missed++; console.log(`  -      ${entry.id}: "${title}" rejected, ${credit ? credit.rejected : 'no metadata'}`); continue;
      }
      heroes[entry.id] = {
        image_url: img.url,
        image_credit: credit,
        wiki_page: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        verified: false
      };
      staged++;
      console.log(`  staged ${entry.id}: "${title}" (${credit.licence}, ${credit.author})`);
    } catch (err) {
      missed++; console.log(`  !      ${entry.id}: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  if (!dry) save(heroes);
  console.log(`\n${staged} staged for review, ${missed} without a usable photo, ${kept} left as they were.`);
  console.log('Nothing staged is served until approved: review each, then run --approve.');
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Save each unverified staged photo into dir and remember its public path. */
async function download(dir) {
  const heroes = load();
  const abs = path.resolve(dir);
  fs.mkdirSync(abs, { recursive: true });
  let saved = 0;
  for (const [id, h] of Object.entries(heroes)) {
    if (h.verified || h.local_url || !/^https:\/\//.test(h.image_url || '')) continue;
    try {
      const { data } = await axios.get(h.image_url, { headers: HEADERS, timeout: 30000, responseType: 'arraybuffer' });
      const file = path.join(abs, `${id}.jpg`);
      fs.writeFileSync(file, Buffer.from(data));
      h.local_url = '/' + path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
      saved++;
    } catch (err) {
      console.log(`  !      ${id}: download failed, ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  save(heroes);
  console.log(`${saved} photo${saved === 1 ? '' : 's'} saved to ${dir} for review.`);
}

function setVerified(ids, verified) {
  const heroes = load();
  for (const id of ids) {
    if (!heroes[id]) { console.log(`  ${id}: not staged`); continue; }
    if (verified) {
      // Serve our own copy when one was downloaded: no hotlink, no
      // dependency on Wikimedia staying up, same credit line.
      if (heroes[id].local_url) {
        heroes[id].source_image = heroes[id].image_url;
        heroes[id].image_url = heroes[id].local_url;
        delete heroes[id].local_url;
      }
      heroes[id].verified = true;
      console.log(`  ${id}: approved`);
    } else {
      const local = heroes[id].local_url || (/^\/img\//.test(heroes[id].image_url || '') ? heroes[id].image_url : null);
      if (local) { try { fs.unlinkSync(path.join(PUBLIC_DIR, local)); } catch { /* already gone */ } }
      delete heroes[id];
      console.log(`  ${id}: removed`);
    }
  }
  save(heroes);
}

async function main() {
  const args = process.argv.slice(2);
  const listAfter = flag => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1].split(',').map(s => s.trim()).filter(Boolean) : null;
  };
  const approve = listAfter('--approve');
  const reject = listAfter('--reject');
  if (approve) return setVerified(approve, true);
  if (reject) return setVerified(reject, false);
  const dl = args.indexOf('--download');
  await stage({ force: args.includes('--force'), dry: args.includes('--dry') });
  if (dl >= 0 && args[dl + 1] && !args.includes('--dry')) await download(args[dl + 1]);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { FREE_LICENCE_RE, stripHtml };
