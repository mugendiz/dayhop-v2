// services/socialMonth.js — DayHop V2
// The monthly social calendar. Expands data/socialFormula.js into dated
// slots for a month, fills each one from data DayHop already owns, and on
// the 24th emails the operator next month's plan: a CSV to schedule from,
// the month's photos attached, every caption checked against the house
// copy rule.
//
// What is automatic and what is not, honestly:
//   - Photo posts are complete: owned Commons photo, a one line caption,
//     the credit its licence requires, tags. One sitting schedules the whole
//     month (Instagram's own scheduler, or Meta Business Suite).
//   - Video slots are dated and briefed with a suggested place, but the
//     video has to be filmed, so the script comes from the Tuesday batch
//     (services/socialBatch.js reads the same formula and drafts exactly
//     these slots a week at a time). TikTok's scheduler only reaches 10 days
//     ahead, so videos are scheduled weekly, after filming.
//   - Nothing here posts on its own. There is no TikTok or Instagram
//     publishing integration, by the same decision recorded in
//     socialBatch.js.

const fs = require('fs');
const path = require('path');
const { CHANNELS, PILLARS, WEEKLY, MONTHLY, HASHTAGS } = require('../data/socialFormula');
const { ontarioHolidays, addDays, torontoToday } = require('./spotlight');
const { lint } = require('./copyStyle');

const PHOTO_DIR = path.join(__dirname, '..', 'assets', 'photos');
const MONTH_TO = process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = MONTH_NAMES.map(m => m.slice(0, 3));

// Planner requests for the app moment. Suggestions to type on camera, not
// facts, so nothing here needs a source. Rotated by month.
const APP_PROMPTS = [
  'A rainy Saturday with a 4 and a 7 year old, nothing over $40',
  'Three calm hours outside this Sunday, somewhere with washrooms',
  'A day trip under two hours with a corn maze and good coffee',
  'Grandparents visiting, short walks only, lunch included',
  'One hour free after soccer, a trail near Markham',
  'A waterfall the kids can actually reach, back by dinner'
];

// DayHop is "A Nature App", so suggested places come from the outdoor end
// of the catalog. The catalog also carries indoor playgrounds, karting and
// climbing gyms, which are fine to plan but wrong to film for this brand.
const OUTDOOR_RE = /\b(parks?|trails?|gardens?|beach(es)?|nature|conservation|hik(e|es|ing)|islands?|waterfront|falls|waterfalls?|lookouts?|farms?|orchards?|forests?|lakes?|rivers?|marsh(es)?|bluffs?|gorge|escarpment|ponds?|railway|mill|maze|pumpkins?|apples?|ski|snow|tubing|skating|winery|vineyards?)\b/i;
const INDOOR_RE = /\b(indoor|arcade|museum|gallery|climbing|karting|kart|playground|trampoline|bowling|escape room|cinema|theatre|theater|spa|art collection)\b/i;
// Someone has to film it, so it has to be open. The catalog calls November
// winter, but ski hills and tubing parks rarely open before December.
const filmableIn = (e, month) => {
  const { isCatalogSeasonEligible } = require('../data/seasons');
  if (e.seasonal === 'winter') return month === 12 || month <= 3;
  return isCatalogSeasonEligible(e.seasonal || null, month);
};
const isOutdoorEntry = e => {
  const t = `${e.title || ''} ${e.venue || ''} ${e.description || ''}`;
  return OUTDOOR_RE.test(t) && !INDOOR_RE.test(`${e.title || ''} ${e.venue || ''}`);
};

// ---------- dates ----------
const dowOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const dayLabel = ymd => `${DAY_NAMES[dowOf(ymd)]} ${MONTH_SHORT[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}`;
const isYm = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last, label: `${MONTH_NAMES[m - 1]} ${y}` };
}

/** The month after the one `now` falls in, Toronto time: what the 24th plans. */
function nextMonth(now = new Date()) {
  const [y, m] = torontoToday(now).split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// The Thursday before a holiday weekend starts is when that weekend gets
// planned, so the "This weekend" slot that week becomes the long weekend
// post. Window rule matches services/spotlight.js: a Monday holiday starts
// the Saturday before, a Saturday or Sunday one starts that Saturday.
function holidayThursdays(years) {
  const out = new Map();
  for (const y of years) {
    for (const h of ontarioHolidays(y)) {
      const d = dowOf(h.date);
      const start = d === 1 ? addDays(h.date, -2) : d === 0 ? addDays(h.date, -1) : h.date;
      let thu = addDays(start, -1);
      while (dowOf(thu) !== 4) thu = addDays(thu, -1);
      if (!out.has(thu)) out.set(thu, h); // Christmas and Boxing Day share one Thursday; the first wins
    }
  }
  return out;
}

/**
 * Every formula slot between two dates, inclusive, sorted by date and time.
 * Pure: the same dates always give the same calendar.
 */
function slotsBetween(start, end) {
  // Next year too: New Year's Day pulls a Thursday back into December.
  const years = new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4)), Number(end.slice(0, 4)) + 1]);
  const holidays = holidayThursdays(years);
  const slots = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = dowOf(d);
    for (const w of WEEKLY) {
      if (w.day !== dow) continue;
      const holiday = w.pillar === 'weekend' ? holidays.get(d) : null;
      slots.push(makeSlot(d, w.time, holiday ? 'holiday' : w.pillar, holiday));
    }
    for (const m of MONTHLY) {
      if (m.rule === 'first-monday' && dow === 1 && Number(d.slice(8, 10)) <= 7) slots.push(makeSlot(d, m.time, m.pillar));
    }
  }
  return slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function makeSlot(date, time, pillar, holiday) {
  const p = PILLARS[pillar];
  return {
    date, time, day: dayLabel(date), pillar, pillar_name: p.name, format: p.format,
    channels: CHANNELS[p.format], brief: p.brief,
    holiday: holiday ? { id: holiday.id, name: holiday.name, date: holiday.date } : null
  };
}

const monthSlots = ym => { const b = monthBounds(ym); return slotsBetween(b.first, b.last); };

// ---------- grounding ----------
let creditsCache = null;
function credits() {
  if (!creditsCache) {
    try { creditsCache = JSON.parse(fs.readFileSync(path.join(PHOTO_DIR, 'credits.json'), 'utf8')); } catch { creditsCache = {}; }
  }
  return creditsCache;
}

/** Spot photos (one real place each) that exist on disk and carry a credit. */
function photoPool() {
  return Object.values(credits())
    .filter(c => c && /-spot-/.test(c.key) && c.author && c.license && fs.existsSync(path.join(PHOTO_DIR, `${c.key}.jpg`)))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(c => ({
      key: c.key, file: `${c.key}.jpg`, term: c.term, author: c.author, license: c.license, source: c.source,
      region: c.key.split('-spot-')[0]
    }));
}

/** n photos for a month, rotated so consecutive months do not repeat. */
function photoPicks(ym, n) {
  const pool = photoPool();
  if (!pool.length || n <= 0) return [];
  const [y, m] = ym.split('-').map(Number);
  const start = ((y * 12 + m) * n) % pool.length;
  const out = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

// A catalog fact for a photo, so a caption can say one true thing instead of
// only naming the place. Matched on distinctive words in the photo's search
// term ("Webster" in "Webster Falls Dundas"), never on generic ones.
const GENERIC = new Set(['ontario', 'toronto', 'park', 'parks', 'provincial', 'conservation', 'lake', 'beach', 'main', 'street', 'view', 'falls', 'trail', 'forest', 'house', 'heritage', 'museum', 'national', 'urban', 'river', 'waterfront', 'centre', 'center', 'island']);
function catalogFactFor(term) {
  let catalog = [];
  try { catalog = require('../data/curatedCatalog'); } catch { return null; }
  const words = String(term || '').toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4 && !GENERIC.has(w));
  if (!words.length) return null;
  let best = null;
  for (const e of catalog) {
    const hay = `${e.venue || ''} ${e.title || ''}`.toLowerCase();
    const score = words.filter(w => hay.includes(w)).length;
    if (score && (!best || score > best.score)) best = { score, id: e.id, fact: e.description || '' };
  }
  return best;
}

function hashtagsFor(region) {
  return [...HASHTAGS.base, ...(HASHTAGS[region] || [])].slice(0, 8);
}

// Attribution its licence asks for: author, licence, where it came from.
function creditLine(photo) {
  const via = /wikimedia/i.test(photo.source || '') ? ' via Wikimedia Commons' : '';
  return `Photo: ${photo.author}${via}, ${photo.license}`;
}

function suggestionFor(slot) {
  const weekNo = Math.floor(Date.parse(slot.date + 'T12:00:00Z') / (7 * 86400000));
  const monthNo = Number(slot.date.slice(0, 4)) * 12 + Number(slot.date.slice(5, 7));
  try {
    if (slot.pillar === 'hidden') {
      const catalog = require('../data/curatedCatalog');
      const month = Number(slot.date.slice(5, 7));
      const ok = catalog.filter(e => !e.worth_trip && isOutdoorEntry(e) && filmableIn(e, month));
      const pool = [...ok.filter(e => e.wow), ...ok.filter(e => !e.wow)];
      const pick = pool.length ? pool[weekNo % pool.length] : null;
      return pick ? `${pick.venue}, ${pick.location}` : null;
    }
    if (slot.pillar === 'drive') {
      const catalog = require('../data/curatedCatalog');
      const { getSeasonContext, isSeasonalDestination, isLocalWinterPlay } = require('../data/seasons');
      const month = Number(slot.date.slice(5, 7));
      const ctx = getSeasonContext(slot.date);
      // The worth the drive band is mostly summer farms and railways, so in
      // winter the ski hills and tubing parks people drive to on purpose
      // (seasons.js) join it. The walk-to rink never justifies a drive.
      const trips = catalog.filter(e => isOutdoorEntry(e) && filmableIn(e, month) &&
        (e.worth_trip || (isSeasonalDestination(e, ctx) && !isLocalWinterPlay(e))));
      // A thin month alternates with the live shelf instead of filming the
      // same place every Saturday.
      const slotsInCycle = trips.length < 3 ? trips.length + 1 : trips.length;
      const t = trips[weekNo % slotsInCycle];
      return t ? `${t.venue}, ${t.location}` : 'Pick one from the Worth the drive shelf on dayhop.quest that morning';
    }
    if (slot.pillar === 'weekend' || slot.pillar === 'holiday') {
      const events = require('../data/curatedEvents');
      const fri = addDays(slot.date, 1), sun = addDays(slot.date, 3);
      const on = events.find(e => e.date && e.date <= sun && (e.date_end || e.date) >= fri);
      return on ? `${on.title} (curated event)` : "Rank 1 on that week's Talk of the town";
    }
    if (slot.pillar === 'app') return `Type: "${APP_PROMPTS[monthNo % APP_PROMPTS.length]}"`;
  } catch { /* a suggestion is a convenience; the slot stands without one */ }
  return null;
}

// ---------- captions ----------
const SUPERLATIVE_RE = /\b(tallest|biggest|largest|oldest|longest|highest|deepest|best|only|first)\b/gi;

/** Problems with one caption line, given the fact it was allowed to use. */
function checkCaption(line, fact = '') {
  const problems = lint(line).map(v => v.detail);
  if (!String(line || '').trim()) problems.push('caption is empty');
  if (String(line || '').length > 160) problems.push('caption is over 160 characters');
  const f = String(fact || '').toLowerCase();
  for (const m of String(line || '').matchAll(SUPERLATIVE_RE)) {
    if (!f.includes(m[0].toLowerCase())) problems.push(`"${m[0]}" is not in the catalog fact; cut it or verify it`);
  }
  for (const n of String(line || '').match(/\d+(?:[.,]\d+)*/g) || []) {
    if (!f.includes(n)) problems.push(`"${n}" is not in the catalog fact; cut it or verify it`);
  }
  if (/https?:|www\.|#/.test(line || '')) problems.push('caption line should not carry links or tags; those are added after');
  return [...new Set(problems)];
}

const CAPTION_PROMPT = `You write one line photo captions for DayHop, a GTA family day planner, posted on Instagram and as TikTok photo posts.

For each photo write ONE line, at most 140 characters, in the voice of a local parent: warm, plain, a little wry.
- Use ONLY the facts given for that photo. If "fact" is empty, say only what the place is from its name and where it is. Never invent history, sizes, records, safety, hours, prices, drive times or "new".
- Keep any superlative or number exactly as the fact words it.
- No hashtags, no emoji, no links, no call to action.
- Never use em dashes, en dashes, or a spaced hyphen as punctuation. Use periods and commas.

Return ONLY valid JSON: {"captions":[{"key":"<photo key>","line":"<caption>"}]}`;

async function writeCaptions(photos, { useGrok = true } = {}) {
  const facts = photos.map(p => {
    const m = catalogFactFor(p.term);
    return { key: p.key, place: p.term, town: p.region.replace(/-/g, ' '), fact: m ? m.fact : '' };
  });
  let lines = {};
  if (useGrok && process.env.GROK_API_KEY) {
    try {
      const { callGrok } = require('./grok');
      const res = await callGrok([
        { role: 'system', content: CAPTION_PROMPT },
        { role: 'user', content: JSON.stringify({ photos: facts }) }
      ], { temperature: 0.6 });
      for (const c of (res && Array.isArray(res.captions) ? res.captions : [])) {
        if (c && c.key && c.line) lines[c.key] = String(c.line).trim();
      }
    } catch (err) {
      console.warn('[social-month] caption drafting failed, using plain captions:', err.message);
    }
  }
  return facts.map(f => {
    const line = lines[f.key] || `${f.place}. Saved for your next free Saturday.`;
    return { key: f.key, line, drafted: Boolean(lines[f.key]), fact: f.fact, problems: checkCaption(line, f.fact) };
  });
}

// ---------- the month ----------
async function buildMonth(ym, { useGrok = true } = {}) {
  if (!isYm(ym)) throw new Error(`month must be YYYY-MM, got "${ym}"`);
  const { label } = monthBounds(ym);
  const slots = monthSlots(ym);
  const postcardSlots = slots.filter(s => s.format === 'photo');
  const photos = photoPicks(ym, postcardSlots.length);
  const captions = await writeCaptions(photos, { useGrok });

  let photoI = 0;
  const rows = slots.map(s => {
    if (s.format !== 'photo') {
      return Object.assign({}, s, {
        status: 'FILM',
        suggestion: suggestionFor(s),
        caption: '', hashtags: [], asset: null, credit: null, problems: []
      });
    }
    const photo = photos[photoI];
    const cap = captions[photoI];
    photoI++;
    if (!photo) {
      return Object.assign({}, s, { status: 'NO PHOTO', suggestion: null, caption: '', hashtags: [], asset: null, credit: null, problems: ['no unused photo left in assets/photos'] });
    }
    const problems = cap.problems.slice();
    if (!cap.drafted) problems.push('plain placeholder caption; write one line before scheduling');
    return Object.assign({}, s, {
      status: problems.length ? 'FIX CAPTION' : 'READY TO SCHEDULE',
      suggestion: photo.term,
      caption: `${cap.line}\n\n${creditLine(photo)}`,
      caption_line: cap.line,
      hashtags: hashtagsFor(photo.region),
      asset: photo.file,
      credit: creditLine(photo),
      problems
    });
  });

  const count = f => rows.filter(r => r.format === f).length;
  return { month: ym, label, rows, videos: count('video'), photos: count('photo') };
}

// ---------- output ----------
function csvCell(v) {
  const s = Array.isArray(v) ? v.join(' ') : String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per post. Opens in Sheets or Excel; the scheduling sheet for the month. */
function toCsv(month) {
  const head = ['Date', 'Day', 'Time (Toronto)', 'Format', 'Pillar', 'Channels', 'Status', 'Place or brief', 'Caption', 'Hashtags', 'Photo file', 'Notes'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of month.rows) {
    lines.push([
      r.date, r.day, r.time, r.format, r.holiday ? `${r.pillar_name}: ${r.holiday.name}` : r.pillar_name,
      r.channels.join(' + '), r.status,
      r.format === 'photo' ? r.suggestion : [r.brief, r.suggestion ? `Suggested: ${r.suggestion}` : ''].filter(Boolean).join(' '),
      r.caption, r.hashtags, r.asset || '', r.problems.join('; ')
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function formatMonth(month) {
  const lines = [`DayHop social month: ${month.label}`, ''];
  lines.push(`${month.rows.length} posts: ${month.videos} short videos and ${month.photos} photo posts.`);
  lines.push('The CSV attached is the whole month, one row per post. The photos are attached too.', '');
  lines.push('How to schedule it:');
  lines.push('  1. Photo posts (one sitting, now): schedule each READY TO SCHEDULE row in Instagram\'s own scheduler or Meta Business Suite, at its date and time. Paste the caption as written; the photo credit line is required by the licence, keep it.');
  lines.push('  2. Fix any FIX CAPTION row first. A placeholder caption means drafting was off; write one line yourself.');
  lines.push('  3. Videos: the Tuesday batch drafts the scripts for the coming week\'s FILM rows. Film them in one session, then schedule each in TikTok Studio on desktop (it reaches 10 days ahead) and as an Instagram Reel.');
  lines.push('  4. Log views, 2 second hold and shares at 24 hours. If a time slot keeps losing, move it in data/socialFormula.js.', '');
  let week = '';
  for (const r of month.rows) {
    const wk = r.date.slice(0, 8) + String(Math.ceil(Number(r.date.slice(8, 10)) / 7));
    if (wk !== week) { lines.push(''); week = wk; }
    const pillar = r.holiday ? `${r.pillar_name}: ${r.holiday.name}` : r.pillar_name;
    lines.push(`${r.day} ${r.time}  ${r.format.toUpperCase()}  ${pillar}  [${r.status}]`);
    if (r.format === 'photo') {
      lines.push(`   ${r.suggestion} (${r.asset})`);
      lines.push(`   ${r.caption_line}`);
      lines.push(`   ${r.credit}`);
      lines.push(`   ${r.hashtags.join(' ')}`);
    } else {
      lines.push(`   ${r.brief}`);
      if (r.suggestion) lines.push(`   Suggested: ${r.suggestion}`);
    }
    r.problems.forEach(p => lines.push(`   CHECK: ${p}`));
  }
  return lines.join('\n');
}

async function sendMonth(now = new Date(), ym = nextMonth(now)) {
  const { sendEmail } = require('./email');
  const month = await buildMonth(ym);
  const text = formatMonth(month);
  const attachments = [{ filename: `dayhop-social-${ym}.csv`, content: Buffer.from(toCsv(month), 'utf8') }];
  for (const r of month.rows) {
    if (!r.asset) continue;
    try { attachments.push({ filename: r.asset, content: fs.readFileSync(path.join(PHOTO_DIR, r.asset)) }); } catch { /* the CSV still names the file */ }
  }
  const res = await sendEmail({
    to: MONTH_TO,
    subject: `DayHop social month: ${month.label}, ${month.rows.length} posts planned`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    attachments
  });
  if (res.sent) console.log(`[social-month] ${month.label} plan sent to ${MONTH_TO}`);
  else console.warn('[social-month] plan send failed:', res.reason);
  return Object.assign({ month: ym, posts: month.rows.length }, res);
}

module.exports = {
  buildMonth, sendMonth, toCsv, formatMonth,
  // pure helpers, for socialBatch.js and tests
  slotsBetween, monthSlots, nextMonth, photoPicks, photoPool, checkCaption, catalogFactFor, creditLine, isOutdoorEntry
};
