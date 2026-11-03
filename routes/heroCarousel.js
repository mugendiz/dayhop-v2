// routes/heroCarousel.js — DayHop V2
// The homepage carousel under the prompt, and the pages its slides open.
//
//   GET /api/carousel   the slides, in order:
//                         1. Top spots for fall colours  → /fall-colours
//                         2. Talk of the town (this week) → /talk-of-the-town
//                            Only when the weekly store has live picks; an
//                            empty shelf hides the slide rather than show a
//                            blank card.
//                         3. Santa Claus parades 2026     → /santa-parades
//   GET /fall-colours   the catalog places tagged for fall colours, each
//                       linking to its own /places page.
//
// Every slide carries a thumbnail and the text the share sheet sends
// (public/share-sheet.js): sharing is the first step toward social planning.

const express = require('express');
const { ENTRIES, slugOf, splitTitle, undash, heroOf } = require('./placePages');
const { page, escapeHtml: esc, origin, recordView } = require('./blog');

const page$ = express.Router();
const api = express.Router();

const FALL_RE = /fall colou?rs?|foliage|autumn/i;
// "Sat Nov 7" or "Sat Nov 7 to Sun Nov 8" from YYYY-MM-DD. Pure.
const fmtDay = ymd => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtRange = (a, b) => (!a ? '' : !b || b === a ? fmtDay(a) : `${fmtDay(a)} to ${fmtDay(b)}`);
const fallEntries = () => ENTRIES.filter(e => (e.tags || []).some(t => FALL_RE.test(t)));
const thumbOf = e => {
  const h = heroOf(e);
  if (h) return h.image_url;
  const { name } = splitTitle(e.title);
  return `/art/placeholder.svg?c=adventures&t=${encodeURIComponent(name)}`;
};

/** The carousel slides. tott: the live Talk of the town picks (may be empty). Pure. */
function slides(tott = []) {
  const fall = fallEntries();
  const fallWithPhoto = fall.find(e => heroOf(e)) || fall[0];
  const out = [];
  if (fall.length) {
    out.push({
      key: 'fall', kicker: 'Top locations',
      title: 'Fall colours worth the drive',
      sub: `${fall.length} hand-checked lookouts, gorges and trails around the GTA`,
      thumb: thumbOf(fallWithPhoto), url: '/fall-colours',
      share: `The best fall colour spots around the GTA, ${fall.length} picks on DayHop`
    });
  }
  // Talk of the town as a feed: one slide per pick (the email's picks, in
  // its order), each with its own thumbnail and where and when.
  tott.slice(0, 5).forEach((p, i) => {
    const where = [p.venue, p.location && p.location !== p.venue ? p.location : null].filter(Boolean).join(', ');
    const when = fmtRange(p.date, p.date_end);
    out.push({
      key: `tott-${i + 1}`, kicker: `Talk of the town · ${i + 1} of ${Math.min(tott.length, 5)}`,
      title: undash(p.title),
      sub: [when, where].filter(Boolean).join(' · ') || 'What everyone is going to this week',
      thumb: p.image_url && /^https:\/\//.test(p.image_url) ? p.image_url : `/art/placeholder.svg?c=events&t=${encodeURIComponent(p.title)}`,
      url: '/talk-of-the-town',
      share: `${undash(p.title)}${when ? `, ${when}` : ''}. Want to go?`
    });
  });
  out.push({
    key: 'parades', kicker: 'Free this week',
    title: 'Santa Claus parades 2026',
    sub: 'Every GTA date, time and route, checked',
    thumb: '/img/parades/santa-waving.jpg', url: '/santa-parades',
    share: 'Every GTA Santa Claus parade for 2026, with times, routes and a map'
  });
  return out;
}

// Talk of the town picks: the live weekly shelf when the server has it,
// else the last Talk of the town email as sent (services/issueStore.js
// saves every issue before it goes out, in the database, so it survives a
// deploy; the live shelf is memory-only while public.talk_of_town is
// missing). Only picks still running today are shown.
async function tottPicks() {
  try {
    const talkOfTown = require('../services/talkOfTown');
    const live = talkOfTown.active({ point: { lat: 43.6532, lng: -79.3832 }, limit: talkOfTown.SHELF_SIZE });
    if (live.length) return live;
  } catch { /* fall through to the last email */ }
  try {
    const issueStore = require('../services/issueStore');
    const date = await issueStore.latestDate('tott');
    const snap = date ? await issueStore.getIssue('tott', date) : null;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
    return ((snap && snap.picks) || []).filter(p => (p.date_end || p.date || '9999-12-31') >= today);
  } catch { return []; }
}

api.get('/', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ slides: slides(await tottPicks()) });
});

// ---------- /fall-colours ----------
function fallBody() {
  const cards = fallEntries().map(e => {
    const { name, tagline } = splitTitle(e.title);
    const h = heroOf(e);
    return `<li class="fc-card">
  <a href="/places/${esc(slugOf(e))}">
    <img src="${esc(thumbOf(e))}" alt="${esc(h ? name : '')}" loading="lazy" width="640" height="400">
    <span class="fc-text"><b>${esc(undash(name))}</b>${tagline ? `<span>${esc(undash(tagline))}</span>` : ''}<span class="fc-where">${esc(String(e.location || '').split(',').pop().trim())}</span></span>
  </a>
</li>`;
  }).join('\n');
  return `<style>
.fc-grid{list-style:none;margin:22px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.fc-card a{display:block;background:#fff;border:1px solid var(--line);border-radius:0 var(--radius) var(--radius) 0;overflow:hidden;text-decoration:none;color:var(--ink);box-shadow:0 4px 14px rgba(16,42,46,.08)}
.fc-card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--paper-dim)}
.fc-text{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px}
.fc-text b{font-size:17px}
.fc-text span{font-size:14px;color:var(--ink-soft)}
.fc-where{font-size:12px!important;letter-spacing:.06em;text-transform:uppercase}
</style>
<h1>Fall colours worth the drive 🍁</h1>
<p class="sub">Lookouts, gorges, escarpment trails and a steam train, each checked by hand and each with its own page for hours, cost and directions. Leaves turn first up north and on the escarpment, later in the city's ravines, so check the official page before you set out.</p>
<ul class="fc-grid">
${cards}
</ul>
<p>Want a whole day around one of these? <a href="/?utm_source=fall-colours">Plan it free →</a></p>`;
}

page$.get('/fall-colours', (req, res) => {
  recordView(req, 'fall', 'index');
  const n = fallEntries().length;
  const h = fallEntries().map(heroOf).find(Boolean);
  res.set('Cache-Control', 'public, max-age=600');
  res.send(page({
    req, title: 'Fall colours worth the drive around the GTA | DayHop',
    description: `${n} hand-checked fall colour spots around Toronto and the GTA: lookouts, gorges, escarpment trails and more.`,
    canonicalPath: '/fall-colours', ogType: 'article',
    ogImage: h ? `${origin(req)}${h.image_url}` : undefined,
    bodyHtml: fallBody()
  }));
});

module.exports = { page: page$, api, slides, fallBody, fallEntries };
