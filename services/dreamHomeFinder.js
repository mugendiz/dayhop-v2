// services/dreamHomeFinder.js — DayHop V2
// "Find open houses" for the admin Dream Homes tab: one Grok live search
// (web + X) for real open houses in the GTA over the next two weeks, then
// every find is checked against the page it cites before it is kept, and
// kept finds are saved as DRAFTS (services/dreamHomes.js) for an admin to
// review and publish. Nothing found here ever goes public on its own.
//
// The check, per find (a find that fails any step is skipped, with why):
//   - the source is an https page with a path, not realtor.ca, HouseSigma
//     or Zoocasa (their terms forbid reuse), and it loads
//   - the page names the address (street number and street name)
//   - the page shows the asking price
//   - the page gives the open-house date: the date itself, or, for an X
//     post ("Sat & Sun 2-4PM"), the weekday when the post was made in the
//     six days before it
// X posts are read through X's public oEmbed endpoint (no key, no login).
// Grok's own words are never trusted for a fact the page does not show.

const axios = require('axios');

const BLOCKED = /(^|\.)(realtor\.ca|housesigma\.com|zoocasa\.com)$/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 864e5;

const TOWNS = 'Richmond Hill, Markham, Vaughan (Maple, Woodbridge, Kleinburg), Thornhill, Aurora, Newmarket, King, Whitchurch-Stouffville and North York';

// The weekend days (Sat, Sun) between two dates, as "Sat Oct 31, Sun Nov 1".
function weekendDays(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += DAY_MS) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) out.push(d.toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }));
  }
  return out.join(', ');
}

function instructionsFor(from, to) {
  return [
    `Find REAL residential open houses in ${TOWNS} (Ontario, Canada) happening between ${from} and ${to}, especially on ${weekendDays(from, to)}.`,
    'Where to look (these worked before): real estate agents\' own websites with an "open houses" page or listing pages that show "Open House" with a date and time (IDX pages on agent and brokerage sites), brokerage open-house pages, and X posts by local realtors with "open house" and a street address (hashtags like #MarkhamOpenHouse, #RichmondHillRealEstate, #VaughanRealEstate).',
    'List every qualifying home you find, up to 20; one page that lists several open houses can be the source for each of them.',
    'Never invent anything. Only include a home when a page or post you actually found states its street address, the open house day or date and time window, and the asking price. Use that exact page or post as source_url.',
    'Never use realtor.ca, HouseSigma or Zoocasa as a source.',
    'If you find none, reply exactly {"homes":[]}. Partial weeks count: list what is posted so far.',
    'Reply with ONE JSON object and nothing else: {"homes":[{"address":"street number and name, city","area":"neighbourhood, city","price":1234567,"windows":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}],"source_url":"https://..."}]}'
  ].join('\n');
}

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/[^a-z0-9$,.:'\s]/g, ' ').replace(/\s+/g, ' ');

/** → { ok, text, postedAt? } or { ok:false, why } for a source URL. */
async function readSource(url) {
  let u;
  try { u = new URL(url); } catch (e) { return { ok: false, why: 'not a valid link' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'not an https link' };
  if (BLOCKED.test(u.hostname)) return { ok: false, why: `${u.hostname} is not an allowed source` };
  if ((u.pathname.replace(/\/+$/, '') || '/') === '/' && !u.search) return { ok: false, why: 'cites a home page, not the listing' };
  const isX = /(^|\.)(x\.com|twitter\.com)$/i.test(u.hostname) && /\/status\/\d+/.test(u.pathname);
  try {
    if (isX) {
      const res = await axios.get('https://publish.twitter.com/oembed', { params: { url, omit_script: 1 }, timeout: 12000, validateStatus: () => true });
      if (res.status >= 400 || !res.data || !res.data.html) return { ok: false, why: `the X post could not be read (${res.status})` };
      const html = String(res.data.html);
      // The embed ends with the post date: "... October 23, 2026</a>".
      const m = /([A-Z][a-z]+) (\d{1,2}), (\d{4})<\/a>\s*<\/blockquote>/.exec(html);
      const postedAt = m && MONTHS.includes(m[1].toLowerCase())
        ? Date.UTC(Number(m[3]), MONTHS.indexOf(m[1].toLowerCase()), Number(m[2])) : null;
      return { ok: true, text: norm(html.replace(/<[^>]+>/g, ' ')), postedAt, kind: 'x' };
    }
    const res = await axios.get(url, {
      timeout: 15000, maxRedirects: 5, responseType: 'text', maxContentLength: 4 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0 (DayHop open house check; admin@dayhop.quest)' }, validateStatus: () => true
    });
    if (res.status >= 400) return { ok: false, why: `the page answers ${res.status}` };
    const text = String(res.data || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return { ok: true, text: norm(text), kind: 'page' };
  } catch (e) {
    return { ok: false, why: 'the page does not load' };
  }
}

// "72 Harold Lawrie Lane, Markham" → "72 harold" (number + first street word).
function addressKey(address) {
  const m = /^\s*(?:unit\s*\S+\s*[-,]\s*|#?\S+\s*-\s*)?(\d+[a-z]?)\s+([a-z0-9'.]+)/i.exec(String(address || ''));
  return m ? `${m[1]} ${m[2]}`.toLowerCase().replace(/[.']/g, '') : null;
}

function pageHasPrice(text, price) {
  if (!price) return false;
  const n = Math.round(price);
  const commas = n.toLocaleString('en-US');
  return text.includes(commas) || new RegExp(`\\$\\s?${n}\\b`).test(text);
}

function pageHasDate(text, ymd, postedAt) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const month = MONTHS[mo - 1];
  const mon = month.slice(0, 3);
  const dateRes = [
    new RegExp(`\\b${ymd}\\b`),
    new RegExp(`\\b(${month}|${mon}\\.?) ${d}(st|nd|rd|th)?\\b`),
    new RegExp(`\\b${d}(st|nd|rd|th)? (of )?(${month}|${mon})\\b`),
    new RegExp(`\\b${mo}/${d}(/${y}|/${String(y).slice(2)})?\\b`)
  ];
  if (dateRes.some(re => re.test(text))) return true;
  // A post that says "Sat & Sun" counts for the coming weekend only.
  if (postedAt != null) {
    const day = Date.UTC(y, mo - 1, d);
    const lead = (day - postedAt) / DAY_MS;
    const wd = DAYS[new Date(day).getUTCDay()];
    if (lead >= 0 && lead <= 6 && new RegExp(`\\b(${wd}|${wd.slice(0, 3)})\\b`).test(text)) return true;
  }
  return false;
}

/** → null when the source vouches for the find, else the reason it does not. */
async function checkFind(f, read = readSource) {
  const src = await read(f.source_url);
  if (!src.ok) return src.why;
  const key = addressKey(f.address);
  if (!key) return 'no street number in the address';
  if (!src.text.includes(key)) return `the source does not name ${f.address}`;
  if (!pageHasPrice(src.text, f.price)) return `the source does not show the asking price $${Number(f.price || 0).toLocaleString('en-CA')}`;
  const missing = (f.windows || []).filter(w => !pageHasDate(src.text, w.date, src.postedAt));
  if (missing.length) return `the source does not give the open house date ${missing.map(w => w.date).join(', ')}`;
  return null;
}

// Today in Toronto as YYYY-MM-DD, and the same plus n days.
function torontoDay(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Run one search and save the finds that pass as drafts.
 * → { from, to, found, added: [home], skipped: [{ address, reason }], usage }
 */
async function findOpenHouses({ now = Date.now(), days = 14, actor = 'admin', search, read = readSource, dreamHomes = require('./dreamHomes') } = {}) {
  const from = torontoDay(now), to = torontoDay(now + days * DAY_MS);
  const grokSearch = search || require('./grok').callGrokSearch;
  let res, note = null;
  try {
    res = await grokSearch(`Find open houses in those towns from ${from} to ${to}, with their sources.`,
      { instructions: instructionsFor(from, to), temperature: 0.1, timeoutMs: 240000 });
  } catch (err) {
    // A reply in prose ("No qualifying listings…") is an answer, not an
    // outage: zero finds. Anything else (timeout, 5xx) is a real failure.
    if (!(err instanceof SyntaxError)) throw err;
    res = null;
    note = 'Grok answered without a list this time (it found nothing it could source).';
  }
  const finds = (res && res.data && Array.isArray(res.data.homes)) ? res.data.homes.slice(0, 30) : [];
  const existing = await dreamHomes.listAdmin(now);
  const known = new Set(existing.map(h => addressKey(h.address)).filter(Boolean));
  const added = [], skipped = [];
  for (const f of finds) {
    const address = String(f.address || '').trim();
    const { home, errors } = dreamHomes.normalize(f, { forPublish: true });
    if (errors.length) { skipped.push({ address, reason: errors.join(' ') }); continue; }
    home.windows = home.windows.filter(w => w.date >= from && w.date <= to);
    if (!home.windows.length) { skipped.push({ address, reason: 'no open house inside the next two weeks' }); continue; }
    const key = addressKey(home.address);
    if (key && known.has(key)) { skipped.push({ address, reason: 'already in the list' }); continue; }
    const why = await checkFind(home, read);
    if (why) { skipped.push({ address, reason: why }); continue; }
    const saved = await dreamHomes.save(null, Object.assign({}, home, { note: '' }), { actor, publish: false });
    await dreamHomes.mark(saved.id, { found_by: 'grok', found_at: new Date(now).toISOString() });
    known.add(key);
    added.push(Object.assign(saved, { found_by: 'grok' }));
  }
  return { from, to, found: finds.length, added, skipped, note, usage: res && res.usage ? res.usage : null };
}

// One search at a time, results kept for the admin page to poll: the Grok
// call takes a minute or two, longer than a proxy will hold a request.
let job = null;
function startFind(opts = {}) {
  if (job && job.state === 'running') return job;
  const COOLDOWN = 5 * 60 * 1000;
  if (job && job.finished_at && Date.now() - Date.parse(job.finished_at) < COOLDOWN && !opts.force) return job;
  job = { state: 'running', started_at: new Date().toISOString(), by: opts.actor || 'admin' };
  const mine = job;
  findOpenHouses(opts)
    .then(r => Object.assign(mine, { state: 'done', result: { from: r.from, to: r.to, found: r.found, note: r.note, added: r.added.map(h => ({ id: h.id, address: h.address })), skipped: r.skipped } }))
    .catch(err => Object.assign(mine, { state: 'failed', error: err.message }))
    .finally(() => { mine.finished_at = new Date().toISOString(); });
  return job;
}
const findStatus = () => job || { state: 'idle' };
const _resetJob = () => { job = null; };

module.exports = { findOpenHouses, checkFind, readSource, addressKey, pageHasDate, pageHasPrice, startFind, findStatus, _resetJob };
