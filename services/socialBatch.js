// services/socialBatch.js — DayHop V2
// Tuesday social content batch: Grok drafts the week's short videos grounded
// in real catalog entries, each draft is checked against the shareability
// standard (social/ops/shareability-standard-2026-09-12.md) and the house
// copy rule, and the batch is emailed to the operator. Filming and posting
// stay human jobs (no TikTok/IG publishing API worth the ban risk).
//
// Why the prompt is this strict: the first version asked for "2 Instagram,
// 2 TikTok" in any of meme/carousel/video, and got lists, carousels and
// text-over-photo posts every week. On @dayhop3 that class sits at 86 to
// 245 views with zero shares, while single surprising local facts with a
// face or motion in frame one clear 700. Instagram has ~0 followers, so
// feed posts and carousels reach nobody there; only original Reels reach
// non-followers. So every draft is now one short video, cross-posted.

const { callGrok } = require('./grok');
const { getSpotlight, torontoToday, addDays } = require('./spotlight');
const { sendEmail } = require('./email');
const { lint } = require('./copyStyle');
const { HALLOWEEN_RE } = require('./venueGates');

const BATCH_TO = process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com';

const SHARE_TRIGGERS = ['identity', 'specific person', 'currency', 'settle an argument'];

/** Same decay rule as candidates.js: new for 120 days (60 for autopilot). */
function isNewlyOpened(e, todayYmd) {
  return Boolean(e.opened_at && e.opened_at <= todayYmd &&
    todayYmd <= (e.new_until || addDays(e.opened_at, e.auto === true ? 60 : 120)));
}

function seasonalPicks(limit = 12, now = new Date()) {
  // "Didn't know you could" entries first: the secret-shaped facts are the
  // ones that travel. Rotated by week so Grok does not see the same top of
  // the file every Tuesday. Descriptions go in because the post is built
  // on one fact, and Grok may only use facts it was handed.
  try {
    const catalog = require('../data/curatedCatalog');
    const { isCatalogSeasonEligible } = require('../data/seasons');
    const todayYmd = torontoToday(now);
    const month = Number(todayYmd.slice(5, 7));
    const eligible = catalog.filter(e => isCatalogSeasonEligible(e.seasonal || null, month));
    const pool = [...eligible.filter(e => e.wow), ...eligible.filter(e => !e.wow)];
    if (!pool.length) return [];
    const week = Math.floor(now.getTime() / (7 * 86400000));
    const start = (week * limit) % pool.length;
    const picks = [];
    for (let i = 0; i < Math.min(limit, pool.length); i++) picks.push(pool[(start + i) % pool.length]);
    return picks.map(e => ({
      id: e.id,
      venue: e.venue,
      location: e.location,
      fact: e.description,
      ages: e.good_for_ages,
      is_new: isNewlyOpened(e, todayYmd)
    }));
  } catch (e) {
    return [];
  }
}

const SYSTEM_PROMPT = `You write short vertical videos for DayHop (dayhop.quest), an AI weekend planner for Toronto/GTA families. Every video is posted on TikTok (dayhop3) and as an Instagram Reel (@dayhopofficial).

What the account's own analytics show: lists, plans and "here's what's open" posts get 86 to 245 views and zero shares. Single surprising local facts (local history, hidden in plain sight) with a face or motion in the first second get 700 to 900. Viewers decide in the first 1 to 2 seconds.

Every video MUST pass all six gates:
G1 Motion in frame one: 0:00 to 0:02 is a face talking or real moving footage. Never a text card, poster, graphic or flat background.
G2 One fact, not a list: a single claim. Never "5 spots", "3 things", rankings or roundups.
G3 A gap in 7 words or fewer: the hook states something incomplete that makes you need the next line.
G4 A named share trigger: one of identity, specific person, currency, settle an argument, plus the exact line that fires it.
G5 No brand in the body: no URL, logo or call to action until the last 1.5 seconds.
G6 Payoff before 60% of the runtime.

Also:
- Filmable by one person with a phone in under 5 minutes: talking to camera, hands doing something, handheld footage of a real place, or a screen recording. No AI avatars, no AI-generated scenes, no stock footage, no venue photos.
- Venue facts come ONLY from real_places. Never call a place new unless is_new is true. Keep every superlative exactly as the fact words it ("tallest ribbon waterfall" stays that, never "tallest waterfall"). Never add safety claims, drive times, prices or hours the fact does not state. If you use a fact from general knowledge (history, a holiday), set fact_source to "general: <what to verify>".
- Voice: warm, plain, a little wry. A local parent, never a brand. No emoji walls, no "hey fam".
- Never use em dashes, en dashes, or a spaced hyphen as punctuation. Use periods and commas.
- If a holiday is coming up, tie posts to it and set post_day to the days just before it. A hook that names a date or weekday must be posted on that day.
- Nothing Halloween: no haunts, costumes, trick or treating, ghosts or jack-o'-lanterns. October and November are fall: colours, harvest, farms, trails, the first cold walk.

Return ONLY valid JSON, no markdown fences:
{
  "posts": [
    {
      "post_day": "weekday and date to post, e.g. Thu Oct 8",
      "concept": "one sentence: what the video is",
      "hook": "on-screen text and first spoken line, 7 words or fewer",
      "frame_one": "exactly what is on screen at 0:00, moving",
      "script": "the full spoken script, 10 to 20 seconds",
      "payoff_at_seconds": 4,
      "share_trigger": "identity" | "specific person" | "currency" | "settle an argument",
      "share_line": "the exact line that makes someone send it",
      "caption": "short caption, ready to paste, ending with a soft dayhop.quest mention",
      "hashtags": ["5 to 8 GTA/Toronto family tags, no #fyp"],
      "footage": "what to film and where, in one sentence",
      "fact_source": "a real_places id, or general: <what to verify>"
    }
  ]
}

The input gives "slots": the posting calendar from DayHop's monthly formula (data/socialFormula.js). Make exactly one post for each slot, in order. post_day is that slot's day, and the video follows that slot's pillar and brief:
- "Hidden in plain sight": a real_places entry with kind "catalog".
- "This weekend" or "Long weekend": a real_places entry with kind "event" that is on that weekend, if one is given; otherwise the strongest seasonal catalog place, and say so in concept.
- "Worth the drive": a real_places entry with kind "day_trip" if one is given; otherwise a catalog place.
- "App moment": a screen recording of dayhop.quest answering one real parent request. This is the only slot where the brand may appear early; fact_source is "app: screen recording".
Every video ends, in its last 1.5 seconds, on the sign-off "DayHop. A Nature App. Get out there."`;

/**
 * The formula's video slots for the coming week: tomorrow through a week
 * from today. Tuesday's batch therefore drafts Thursday, Saturday and next
 * Tuesday (plus the app moment when the first Monday of a month falls in
 * range), which is the week data/socialFormula.js lays out.
 */
function videoSlots(now = new Date()) {
  const { slotsBetween } = require('./socialMonth');
  const today = torontoToday(now);
  return slotsBetween(addDays(today, 1), addDays(today, 7))
    .filter(s => s.format === 'video')
    .map(s => ({ post_day: s.day, time: s.time, pillar: s.pillar_name, brief: s.brief, holiday: s.holiday ? s.holiday.name : undefined }));
}

/**
 * Everything a draft may cite as fact_source: the week's catalog picks, the
 * day trips, and dated events running in the coming week (curated events
 * plus the live Talk of the town store, a pure memory read). checkPost
 * rejects a source that is not in this list, so the slot pillars can only
 * be filled from real entries.
 */
function groundingPlaces(now = new Date()) {
  const today = torontoToday(now);
  const end = addDays(today, 7);
  const catalogPicks = seasonalPicks(12, now).map(p => Object.assign({ kind: 'catalog' }, p));
  const out = [...catalogPicks];
  try {
    const month = Number(today.slice(5, 7));
    const { isCatalogSeasonEligible } = require('../data/seasons');
    for (const e of require('../data/curatedCatalog')) {
      if (!e.worth_trip || !isCatalogSeasonEligible(e.seasonal || null, month)) continue;
      if (out.some(p => p.id === e.id)) continue;
      out.push({ id: e.id, kind: 'day_trip', venue: e.venue, location: e.location, fact: e.description, ages: e.good_for_ages, is_new: isNewlyOpened(e, today) });
    }
    for (const e of require('../data/curatedEvents')) {
      if (!e.date || e.date > end || (e.date_end || e.date) < today) continue;
      if (HALLOWEEN_RE.test(`${e.title} ${e.description || ''}`)) continue;
      out.push({ id: e.id, kind: 'event', venue: e.venue || e.location, location: e.location, fact: `${e.title}. ${e.description || ''} On ${e.date}${e.date_end && e.date_end !== e.date ? ` to ${e.date_end}` : ''}.`, is_new: false });
    }
    const { hubById } = require('../data/tottHubs');
    const hub = hubById('toronto');
    if (hub) {
      for (const c of require('./talkOfTown').active({ point: { lat: hub.lat, lng: hub.lng }, today, limit: 6 })) {
        if (c.date > end || HALLOWEEN_RE.test(`${c.title} ${c.description || ''}`)) continue;
        out.push({ id: c.id, kind: 'event', venue: c.venue || c.location, location: c.location, fact: `${c.title}. ${c.description || ''} On ${c.date}${c.date_end && c.date_end !== c.date ? ` to ${c.date_end}` : ''}.`, is_new: false });
      }
    }
  } catch (err) {
    console.warn('[social] grounding beyond the catalog failed, catalog picks only:', err.message);
  }
  return out;
}

async function buildBatch(now = new Date(), places = groundingPlaces(now), slots = videoSlots(now)) {
  const sp = getSpotlight(now);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        today: torontoToday(now),
        upcoming_holiday: sp && sp.kind === 'holiday'
          ? { name: sp.name, date: sp.date, range: sp.range, days_away: sp.days_away }
          : null,
        slots,
        real_places: places
      })
    }
  ];
  const result = await callGrok(messages, { temperature: 0.8 });
  if (!result || !Array.isArray(result.posts)) throw new Error('Grok returned an unexpected batch shape');
  return result.posts.slice(0, 6);
}

const LIST_RE = /\b(\d+|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z-]+\s+){0,2}(spots|places|things|ideas|picks|farms|ways|reasons|activities)\b|\branked\b/i;
const NEW_CLAIM_RE = /\b(new|just opened|finally open|brand new)\b/i;
const STATIC_OPEN_RE = /\b(text|title|type) card\b|\bposter\b|\bgraphic\b|\blogo\b|\bflat background\b|\bslide\b/i;
// A superlative plus the word it qualifies, a safety word, or a drive time.
const CLAIM_RE = /\b(?:tallest|biggest|largest|oldest|longest|highest|deepest|best)\s+[a-z]+|\b(?:safe|safely|safety)\b|\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\s+(?:from|to|outside)\b|\bunder an hour\b/gi;
const SYNTHETIC_RE =/\bavatar\b|\bai[ -]generated\b|\bstock (footage|photo)|\bzeely\b/i;

/**
 * Check one draft against the shareability gates and the house style.
 * Returns human-readable problems; an empty list means ready to film.
 * Pure: `places` is the real_places list the draft was grounded in.
 */
function checkPost(p, places = []) {
  const problems = [];
  const copy = { hook: p.hook, script: p.script, caption: p.caption, share_line: p.share_line };
  for (const [field, text] of Object.entries(copy)) {
    for (const v of lint(text)) problems.push(`${field}: ${v.detail}`);
  }
  const hookWords = String(p.hook || '').trim().split(/\s+/).filter(Boolean).length;
  if (hookWords > 7) problems.push(`hook is ${hookWords} words; G3 wants 7 or fewer`);
  if (LIST_RE.test(`${p.hook || ''} ${p.concept || ''} ${p.caption || ''}`)) {
    problems.push('reads as a list or ranking; G2 wants one fact');
  }
  if (!SHARE_TRIGGERS.includes(String(p.share_trigger || '').toLowerCase())) {
    problems.push(`share trigger "${p.share_trigger || ''}" is not one of: ${SHARE_TRIGGERS.join(', ')}`);
  }
  if (STATIC_OPEN_RE.test(String(p.frame_one || ''))) {
    problems.push('frame one is static; G1 wants a face or motion');
  }
  if (HALLOWEEN_RE.test(`${p.hook || ''} ${p.concept || ''} ${p.script || ''} ${p.caption || ''} ${(p.hashtags || []).join(' ')}`)) {
    problems.push('Halloween content; DayHop posts fall, not Halloween');
  }
  if (SYNTHETIC_RE.test(`${p.frame_one || ''} ${p.footage || ''}`)) {
    problems.push('asks for avatar, AI or stock footage; film it for real');
  }
  const source = String(p.fact_source || '').trim();
  const place = places.find(x => x.id === source);
  if (!source) {
    problems.push('no fact_source; say where the fact comes from');
  } else if (source.startsWith('app:')) {
    // The app moment films the planner itself; the screen is the source.
  } else if (source.startsWith('general')) {
    problems.push(`fact is not from the catalog; verify before posting (${source.replace(/^general:\s*/, '')})`);
  } else if (!place) {
    problems.push(`fact_source "${source}" is not one of this week's catalog places`);
  }
  const spoken = `${p.hook || ''} ${p.script || ''} ${p.caption || ''}`;
  if (place && !place.is_new && NEW_CLAIM_RE.test(spoken)) {
    problems.push(`calls ${place.venue} new, but it is past its new window`);
  }
  // Grok grounds on the fact but embellishes it: a dropped qualifier turns
  // "tallest ribbon waterfall" into "tallest waterfall", and it adds safety
  // claims and drive times the catalog never made. Anything in this class
  // must appear word for word in the catalog fact, or it gets flagged.
  if (place) {
    const fact = String(place.fact || '').toLowerCase();
    const claims = new Set();
    for (const m of spoken.matchAll(CLAIM_RE)) {
      const claim = m[0].toLowerCase().replace(/\s+/g, ' ');
      if (!fact.includes(claim)) claims.add(m[0]);
    }
    claims.forEach(c => problems.push(`"${c}" is not in the catalog fact; cut it or verify it`));
  }
  return problems;
}

function formatBatch(posts, places = [], now = new Date()) {
  const lines = [`DayHop social batch, week of ${torontoToday(now)}`, ''];
  lines.push(`${posts.length} short videos, one per slot in the monthly formula. Post each one on TikTok AND as an Instagram Reel.`, '');
  posts.forEach((p, i) => {
    const problems = checkPost(p, places);
    lines.push(`${i + 1}. ${p.post_day || 'Any day'}: ${p.concept || ''}`);
    lines.push(`   ${problems.length ? `FIX FIRST (${problems.length})` : 'READY TO FILM'}`);
    problems.forEach(x => lines.push(`     CHECK: ${x}`));
    lines.push(`   Hook: ${p.hook || ''}`);
    lines.push(`   Frame one: ${p.frame_one || ''}`);
    lines.push(`   Script (payoff at ${p.payoff_at_seconds ?? '?'}s):`);
    lines.push(String(p.script || '').split('\n').map(l => '     ' + l).join('\n'));
    lines.push(`   Share trigger: ${p.share_trigger || ''}. "${p.share_line || ''}"`);
    lines.push(`   Film: ${p.footage || ''}`);
    lines.push(`   Fact source: ${p.fact_source || ''}`);
    lines.push(`   Caption:`);
    lines.push(String(p.caption || '').split('\n').map(l => '     ' + l).join('\n'));
    lines.push(`   Tags: ${(p.hashtags || []).map(t => (String(t).startsWith('#') ? t : `#${t}`)).join(' ')}`);
    lines.push('');
  });
  lines.push('Posting checklist:');
  lines.push('  1. Film on your phone: 10 to 20 seconds each. No AI avatars, no text card openings.');
  lines.push('  2. Clear every CHECK line first. Verify any fact marked "not from the catalog".');
  lines.push('  3. Upload the original file to TikTok (@dayhop3) and as a Reel to IG (@dayhopofficial). Never repost a TikTok download to IG; the watermark kills reach. Use Trial Reel if offered.');
  lines.push('  4. The brand goes only in the last 1.5 seconds. Pin a comment with dayhop.quest.');
  lines.push('  5. 10 minutes of comment replies after posting. At 24 hours, log views, 2 second hold and shares.');
  return lines.join('\n');
}

async function sendBatch(now = new Date()) {
  const places = groundingPlaces(now);
  const posts = await buildBatch(now, places);
  const text = formatBatch(posts, places, now);
  const res = await sendEmail({
    to: BATCH_TO,
    subject: `DayHop social batch: ${posts.length} videos drafted for this week`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  });
  if (res.sent) console.log(`[social] Tuesday batch sent to ${BATCH_TO}`);
  else console.warn('[social] batch send failed:', res.reason);
  return res;
}

module.exports = { buildBatch, sendBatch, checkPost, formatBatch, seasonalPicks, videoSlots, groundingPlaces };
