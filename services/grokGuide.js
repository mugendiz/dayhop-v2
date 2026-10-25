// services/grokGuide.js — DayHop V2
// TRYOUT (Oct 2026): Grok as the author of a personalized trip guide.
//
// The standard guide (services/personalGuide.js) is assembled by code and
// prints only real listings. This asks Grok to do the authoring on top of
// the same record: pick the must-sees for THIS party (e.g. one child), plan
// the trip week by week, find events on the dates with live web/X search,
// and write the letter, season notes, rainy-day picks, tips and packing list.
//
// Grok is given every DayHop listing with a short id and told: use an id,
// or cite a source URL you actually found; never invent. Then this file
// checks the answer instead of trusting it:
//   - an item that names an unknown id and carries no URL is dropped
//   - an event without a date inside the trip window, or without a URL,
//     is dropped
//   - every URL Grok cites is fetched; ones that do not load are dropped
// What was dropped is returned with the result, so the tryout shows how
// much Grok tried to make up. House copy style (no dash punctuation) is
// applied to Grok's prose by replacing dashes, not by trusting the prompt.

const axios = require('axios');
const { samePlace, placeSet, sameAdvice } = require('./samePlace');

function listingIndex(g) {
  const items = [];
  const add = (chapter, e) => {
    if (!e || !e.title) return;
    items.push({ id: `L${items.length + 1}`, chapter, e });
  };
  g.mustSee.forEach(e => add('must-see', e));
  g.nature.forEach(e => add('parks', e));
  g.culture.forEach(e => add('culture', e));
  g.family.forEach(e => add('family', e));
  g.active.forEach(e => add('active', e));
  g.food.forEach(e => add('food', e));
  g.more.forEach(e => add('more', e));
  g.dayTrips.forEach(e => add('day-trip', e));
  g.events.trip.forEach(e => add('event', e));
  g.events.month.forEach(e => add('event-month', e));
  return items;
}

function listingLine({ id, chapter, e }) {
  return [id, chapter, e.title,
    e.date ? `date ${e.date}${e.end ? ` to ${e.end}` : ''}${e.time ? ` ${e.time}` : ''}` : null,
    e.km != null ? `${e.km} km` : null,
    e.rating ? `${e.rating}★ (${e.reviews || 0})` : null,
    e.ages ? `ages ${e.ages}` : null,
    e.what ? e.what.slice(0, 140) : null].filter(Boolean).join(' | ');
}

function buildPrompt(g, party) {
  const o = g.order;
  const items = listingIndex(g);
  const instructions = [
    'You are the author of a personal trip guide, printed as a keepsake book.',
    `The trip: ${o.city}, Ontario, Canada, from ${o.start} to ${o.end}. Travelling: ${party}.`,
    o.notes ? `ABOUT THE TRAVELLERS, in their own words (write the whole book for these people, and give each of them days that are theirs): ${o.notes}` : null,
    'Write for that party. If a child is coming, a child changes everything: pacing, washrooms, indoor backups, early dinners, what a kid will remember.',
    // The first tryouts sent the family to the Wave Pool four times and the
    // observatory three times across five weeks. verify() also drops repeats.
    'VARIETY RULES: recommend each place once in the whole book. Use each place at most once in the weekly plan; rainy-day picks must be places that are neither must-sees nor in the weekly plan; two listings for the same place (a park and a trail inside it, a venue and its program) count as one place. A must-see may appear once in the weekly plan, on the day to go, and an event once, on its date. Across the trip use at least 20 different places, mixing the parks and trails, culture, family and active listings, and spreading across nearby towns, not only the same few indoor favourites.',
    // The persona run said "calm", "quiet" and "early" in nearly every line
    // and opened most of them with the child's name.
    'WRITING RULES: every line says something specific to that place (what to do first, which trail or room, the best hour, where to park, what to eat nearby), never a generic quality. Do not reuse an adjective or phrase from another line; "calm", "quiet", "gentle", "early" and "perfect" may each appear at most twice in the book. Vary how lines open: do not start more than two lines with the same word or name. Tips must not repeat packing items or each other.',
    'Only state facts about a place that its listing line or a page you found says. Do not add details such as wave schedules, prices or features.',
    // The persona run promised a November splash pad and migrating vultures.
    `SEASON RULE: the trip runs ${o.start} to ${o.end}. A listing describes the place in its best season; never promise a feature that is closed or absent on the trip dates (splash pads, outdoor pools, patios and summer wildlife are gone by late fall). Respect weekday-only programs: put a "Saturday night" program on a Saturday.`,
    // Every run so far cited site home pages for real events.
    'SOURCES: an event "url" must be the page for that event or a dated listings page that names it (a path, not a site home page). A home page will be rejected.',
    'Use web search and X search to find events in or near the place during the exact dates: seasonal festivals, parades, holiday markets, library and community-centre programs for kids, school holidays and PA days, Remembrance Day, anything a local family would go to.',
    'HARD RULES: never invent a place, event, date, price or URL. Every item you name must either use a listing id from the LISTINGS below ("ref") or carry a "url" you actually found in search. If you are not sure something is real and on those dates, leave it out. Prefer listings over search results for places.',
    'Do not use em dashes or en dashes anywhere; use commas or periods.',
    'Reply with ONE JSON object and nothing else, in exactly this shape:',
    JSON.stringify({
      letter: '120 to 180 words, addressed to the family, warm and specific',
      season_notes: '80 to 120 words: what this time of year is like here (weather, daylight hours, what closes for the season, what opens)',
      must_see: [{ ref: 'L3 or null', title: 'name', why: 'one or two sentences on why, for this child', url: 'only when ref is null' }],
      weeks: [{ label: 'Week 1: Oct 28 to Nov 3', theme: 'one line', plan: [{ date: 'YYYY-MM-DD', title: 'what', ref: 'Lx or null', url: 'when ref is null', note: 'one line' }] }],
      events: [{ date: 'YYYY-MM-DD', end: 'YYYY-MM-DD or null', title: 'event', where: 'venue, town', url: 'source you found', why: 'one line for the family' }],
      rainy_days: [{ ref: 'Lx or null', title: 'name', url: 'when ref is null', note: 'one line' }],
      kid_tips: ['6 to 10 short, practical tips for these travellers in this place and season'],
      packing: ['8 to 12 items for this season and these travellers']
    }),
    'Aim for 6 to 10 must-sees, every week of the trip with 3 to 6 planned outings, and every real event you can find.'
  ].filter(Boolean).join('\n');
  const input = `LISTINGS (DayHop, real, linked; use these ids as "ref"):\n${items.map(listingLine).join('\n')}`;
  return { instructions, input, items };
}

const dashFix = s => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s-{1,2}\s/g, ', ').trim();

// The first tryout passed links that only proved a website exists: nine
// events cited home pages (visitmarkham.ca, richmondhill.ca) that say
// nothing about the event or its date. So a source must be a specific page
// (a path, not "/"), and the page must name the thing it is cited for:
// most of the title's significant words appear in its text.
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'days', 'near', 'nearby', 'local']);
const titleWords = title => [...new Set(String(title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length >= 4 && !STOP.has(w)))];

async function fetchPage(url) {
  if (!/^https:\/\//.test(url || '')) return { ok: false, why: 'not an https link' };
  let path;
  try { path = new URL(url).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return { ok: false, why: 'not a valid link' }; }
  if (path === '/') return { ok: false, why: 'cites a home page, not a page about it' };
  try {
    const res = await axios.get(url, {
      timeout: 15000, maxRedirects: 5, responseType: 'text', maxContentLength: 3 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0 (DayHop link check; zokaamazon@gmail.com)' },
      validateStatus: () => true
    });
    // 403/429 are bot walls (Facebook, Eventbrite): the page may exist but
    // cannot be read, so it cannot vouch for anything either.
    if (res.status >= 400) return { ok: false, why: `link answers ${res.status}` };
    const text = String(res.data || '').toLowerCase().normalize('NFKD').replace(/<[^>]+>/g, ' ');
    return { ok: true, text };
  } catch (e) {
    return { ok: false, why: 'link does not load' };
  }
}

// → null when the page vouches for the title, else the reason it does not.
// A dated item also needs its year on the page: the second tryout kept two
// Richmond Hill events whose sources were 2024 news stories, with 2024's
// dates carried into a 2026 trip.
async function urlVouches(url, title, pages, date = null) {
  if (!pages.has(url)) pages.set(url, fetchPage(url));
  const page = await pages.get(url);
  if (!page.ok) return page.why;
  if (date && !page.text.includes(date.slice(0, 4))) return `the linked page never mentions ${date.slice(0, 4)}, so the date may be from another year`;
  const words = titleWords(title);
  if (!words.length) return null;
  const hits = words.filter(w => page.text.includes(w)).length;
  return hits / words.length >= 0.6 ? null : `the linked page does not mention "${title}"`;
}

/**
 * Check Grok's answer against the listings and the trip window.
 * → { kept, dropped: [{ section, title, reason }] }
 */
async function verify(answer, items, order, { checkUrls = true } = {}) {
  const byId = new Map(items.map(x => [x.id, x.e]));
  const dropped = [];
  const pages = new Map();
  const vouch = async (url, title, date = null) => (checkUrls ? urlVouches(url, title, pages, date) : null);
  // A named item: a known listing, or a URL that loads.
  const resolve = async (section, it) => {
    const title = dashFix(it.title);
    if (it.ref && byId.has(it.ref)) {
      const e = byId.get(it.ref);
      return { title: e.title, listing: e, url: e.url || null, maps: e.maps };
    }
    const why = it.url ? await vouch(it.url, title, it.date || null) : 'no listing id and no source link';
    if (!why) {
      return { title, url: it.url, maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title}, ${order.city}, Ontario`)}` };
    }
    dropped.push({ section, title, reason: it.ref ? `unknown listing id ${it.ref}; ${why}` : why });
    return null;
  };
  const inWindow = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d >= order.start && d <= order.end;

  const a = answer || {};
  // Variety is enforced here, not trusted to the prompt. One identity per
  // PLACE, not per listing (services/samePlace.js): "Edwards Gardens" and
  // "Edwards Gardens & the Don ravine trails" are the same garden twice,
  // and the telescope is the David Dunlap Observatory.
  //   - must-sees and events are each listed once
  //   - the weekly plan goes to a place once; a must-see or an event may
  //     take its day there, flagged so the book points back instead of
  //     describing it again
  //   - rainy-day picks are places the rest of the book does not send you
  const mustSee = [];
  const mustSet = placeSet();
  for (const it of a.must_see || []) {
    const r = await resolve('must-see', it);
    if (!r) continue;
    if (!mustSet.claim(r.listing || r)) { dropped.push({ section: 'must-see', title: r.title, reason: 'repeat: already a must-see' }); continue; }
    mustSee.push(Object.assign(r, { why: dashFix(it.why) }));
  }
  // A program the listing pins to certain days ("Saturday night viewing")
  // must land on one of them. → reason string when it does not, else null.
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wrongWeekday = (r, date) => {
    const text = `${r.listing ? `${r.listing.title} ${r.listing.what || ''}` : ''}`.toLowerCase();
    let allowed = DAYS.filter(d => new RegExp(`\\b${d}s?\\b`).test(text));
    if (/\bweekends?\b/.test(text)) allowed = [...new Set([...allowed, 'saturday', 'sunday'])];
    if (!allowed.length) return null;
    const day = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    return allowed.includes(day) ? null : `planned on a ${day[0].toUpperCase() + day.slice(1)}, but the listing says ${allowed.join('/')}`;
  };
  const events = [];
  const eventSet = placeSet();
  for (const ev of a.events || []) {
    const title = dashFix(ev.title);
    const last = ev.end && /^\d{4}-\d{2}-\d{2}$/.test(ev.end) ? ev.end : ev.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '') || last < order.start || ev.date > order.end) {
      dropped.push({ section: 'events', title, reason: `date ${ev.date || 'missing'} is outside the trip` }); continue;
    }
    if (!ev.url) { dropped.push({ section: 'events', title, reason: 'no source link' }); continue; }
    if (eventSet.has(title)) { dropped.push({ section: 'events', title, reason: 'repeat: already listed' }); continue; }
    const why = await vouch(ev.url, title, ev.date);
    if (why) { dropped.push({ section: 'events', title, reason: why }); continue; }
    eventSet.add(title);
    events.push({ title, date: ev.date, end: ev.end && ev.end !== ev.date ? ev.end : null, where: dashFix(ev.where), url: ev.url, why: dashFix(ev.why),
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.where || title}, Ontario`)}` });
  }
  events.sort((x, y) => x.date.localeCompare(y.date));

  const planned = placeSet();
  const plannedOn = []; // [names, date] for the drop reason
  const weeks = [];
  for (const w of a.weeks || []) {
    const plan = [];
    for (const it of w.plan || []) {
      if (!inWindow(it.date)) { dropped.push({ section: 'weeks', title: dashFix(it.title), reason: `date ${it.date || 'missing'} is outside the trip` }); continue; }
      const r = await resolve('weeks', it);
      if (!r) continue;
      const wd = wrongWeekday(r, it.date);
      if (wd) { dropped.push({ section: 'weeks', title: r.title, reason: wd }); continue; }
      const id = r.listing || r;
      if (planned.has(id)) {
        const first = plannedOn.find(([s]) => s.has(id));
        dropped.push({ section: 'weeks', title: r.title, reason: `repeat: already planned on ${first ? first[1] : 'another day'}` });
        continue;
      }
      planned.add(id);
      plannedOn.push([placeSet([id]), it.date]);
      const ev = events.find(e => samePlace(e.title, r.title));
      plan.push(Object.assign(r, {
        date: it.date, note: dashFix(it.note),
        ...(mustSet.has(id) ? { mustSee: true } : {}),
        ...(ev ? { event: true } : {})
      }));
    }
    if (plan.length) weeks.push({ label: dashFix(w.label), theme: dashFix(w.theme), plan: plan.sort((x, y) => x.date.localeCompare(y.date)) });
  }

  const rainy = [];
  const rainySet = placeSet();
  for (const it of a.rainy_days || []) {
    const r = await resolve('rainy days', it);
    if (!r) continue;
    const id = r.listing || r;
    const why = mustSet.has(id) ? 'repeat: already a must-see'
      : planned.has(id) ? 'repeat: already in the weekly plan'
      : rainySet.has(id) ? 'repeat: already a rainy-day pick' : null;
    if (why) { dropped.push({ section: 'rainy days', title: r.title, reason: why }); continue; }
    rainySet.add(id);
    rainy.push(Object.assign(r, { note: dashFix(it.note) }));
  }
  // Tips and packing: no line twice, and no tip that is a packing item
  // again ("Pack snacks for Leila" beside "Snacks for Leila").
  const distinct = (lines, against = []) => lines.map(dashFix).filter(Boolean)
    .filter((t, i, arr) => !arr.slice(0, i).some(x => sameAdvice(x, t)) && !against.some(x => sameAdvice(x, t)));
  const packing = distinct(a.packing || []).slice(0, 14);
  return {
    kept: {
      letter: dashFix(a.letter),
      season_notes: dashFix(a.season_notes),
      mustSee, weeks, events, rainy,
      kid_tips: distinct(a.kid_tips || [], packing).slice(0, 12),
      packing
    },
    dropped
  };
}

async function authorWithGrok(g, party, { search = require('./grok').callGrokSearch, checkUrls = true } = {}) {
  const { instructions, input, items } = buildPrompt(g, party);
  const t0 = Date.now();
  const res = await search(input, { instructions, temperature: 0.3, timeoutMs: 240000 });
  const { kept, dropped } = await verify(res.data, items, g.order, { checkUrls });
  return {
    grok: Object.assign(kept, {
      party,
      model: process.env.GROK_SEARCH_MODEL || process.env.GROK_MODEL || 'grok',
      seconds: Math.round((Date.now() - t0) / 1000),
      citations: res.citations || []
    }),
    dropped,
    usage: res.usage || null,
    raw: res.raw_text
  };
}

module.exports = { authorWithGrok, buildPrompt, verify, listingIndex, dashFix };
