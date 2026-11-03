// routes/placePages.js — DayHop V2
// One indexable page per verified catalog place (/places/<slug>), plus an
// index (/places). Why: search engines and AI answers are the only channels
// that bring visitors who act. In the 60 days to 2026-11-03, the outside
// visitors who signed up or started a checkout came from Google, Bing and
// ChatGPT (public.events first-touch meta.utm). DayHop's best content, 129
// hand-checked places, lived only inside the app, where crawlers cannot
// read it. These pages put it where they can, with schema.org data so an
// answer engine can cite a fact back to DayHop.
//
// Same chrome as the blog (routes/blog.js page()): fast plain HTML, the
// subscribe panel, pixel.js for first-touch attribution. Photos: only
// DayHop's own verified, self-hosted heroes with their credit; never a
// Google photo (their terms, and these pages are permanent).

const express = require('express');
const router = express.Router();
const catalog = require('../data/curatedCatalog');
const { page, escapeHtml, origin, recordView } = require('./blog');

let coords = {};
try { coords = require('../data/catalogCoords.json'); } catch (e) { /* none */ }
let heroes = {};
try { heroes = require('../data/catalogHeroes.json'); } catch (e) { /* none */ }

// House copy style (docs/copy-style-guide.md): no dash punctuation on a
// customer page, and some catalog titles carry "Name — tagline".
const undash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s-{1,2}\s/g, ', ').trim();

const slugOf = e => e.id.replace(/^cur-/, '');
function splitTitle(title) {
  const m = String(title).match(/^(.*?)\s*[—–:]\s+(.*)$/);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  return m ? { name: m[1].trim(), tagline: cap(m[2].trim()) } : { name: String(title).trim(), tagline: '' };
}
const coordOf = e => (e.lat != null ? { lat: e.lat, lng: e.lng } : (coords[e.id] && coords[e.id].lat != null ? coords[e.id] : null));
const heroOf = e => {
  const h = heroes[e.id];
  return h && h.verified && h.image_url && h.image_url.startsWith('/') ? h : null;
};
const areaOf = e => String(e.location || 'Ontario').split(',').map(s => s.trim()).filter(Boolean).pop();
// 'all ages' reads as itself; '6+' reads as 'ages 6+'.
const agesLabel = e => (!e.good_for_ages ? null : /ages/i.test(e.good_for_ages) ? e.good_for_ages : `ages ${e.good_for_ages}`);
const COST = { free: 'Free', $: 'Low cost', $$: 'Moderate', $$$: 'Splurge' };
const SEASON = { summer: 'Best April to October', winter: 'Best November to March' };

function km(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The catalog, as pages: verified entries only, unique slugs.
const ENTRIES = catalog.filter(e => e && e.id && e.title && e.description);
const BY_SLUG = new Map(ENTRIES.map(e => [slugOf(e), e]));

function nearby(e, n = 6) {
  const c = coordOf(e);
  if (!c) return [];
  return ENTRIES.filter(x => x !== e && coordOf(x))
    .map(x => ({ x, d: km(c, coordOf(x)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

function card(e, extra = '') {
  const h = heroOf(e);
  const { name, tagline } = splitTitle(e.title);
  return `
<li class="card">
  ${h ? `<a href="/places/${slugOf(e)}" aria-hidden="true" tabindex="-1"><img src="${escapeHtml(h.image_url)}" alt="" loading="lazy"></a>` : ''}
  <div class="card-body">
    <h2><a href="/places/${slugOf(e)}">${escapeHtml(undash(name))}</a></h2>
    <p>${escapeHtml(undash(tagline || e.description))}</p>
    <span class="meta">${escapeHtml([areaOf(e), COST[e.cost_tier], agesLabel(e), extra].filter(Boolean).join(' · '))}</span>
  </div>
</li>`;
}

router.get('/', (req, res) => {
  recordView(req, 'places', 'index');
  const groups = new Map();
  for (const e of ENTRIES) {
    const a = areaOf(e);
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(e);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const toc = ordered.map(([a, list]) => `<a href="#${escapeHtml(a.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${escapeHtml(a)} (${list.length})</a>`).join(' · ');
  const sections = ordered.map(([a, list]) => `
<section id="${escapeHtml(a.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
  <h2 style="font-family:var(--display);margin:34px 0 0">${escapeHtml(a)}</h2>
  <ul class="grid" style="margin-top:16px">${list.map(e => card(e)).join('')}</ul>
</section>`).join('');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(page({
    req,
    title: `${ENTRIES.length} family day trips and outings around the GTA | DayHop`,
    description: `Hand-checked places for a family day out around Toronto and the GTA: trails, waterfalls, farms, museums, skating and more, with ages, cost and directions for each.`,
    canonicalPath: '/places',
    ogType: 'website',
    ogImage: `${origin(req)}${(heroOf(ENTRIES.find(heroOf)) || {}).image_url || '/img/guides-og.jpg'}`,
    bodyHtml: `
<header style="margin-top:14px">
  <span class="eyebrow">DayHop Places</span>
  <h1>${ENTRIES.length} family outings around the GTA, checked by hand</h1>
  <p class="sub">Every place here is real, open to visitors and linked to live directions. Ages, cost and what makes it worth the trip, on one page each.</p>
  <p style="font-size:14px;line-height:1.9">${toc}</p>
</header>
${sections}`
  }));
});

router.get('/:slug', (req, res) => {
  const e = BY_SLUG.get(String(req.params.slug || '').toLowerCase());
  if (!e) {
    res.status(404).setHeader('Cache-Control', 'no-store');
    return res.send(page({
      req, title: 'Place not found | DayHop', description: 'That place is not in the DayHop catalog.',
      canonicalPath: '/places', ogType: 'website',
      bodyHtml: `<header style="margin-top:14px"><h1>Place not found</h1><p class="sub"><a href="/places">Browse every place</a></p></header>`
    }));
  }
  recordView(req, 'places', slugOf(e));
  const base = origin(req);
  const { name, tagline } = splitTitle(e.title);
  const cleanName = undash(name);
  const h = heroOf(e);
  const c = coordOf(e);
  const area = areaOf(e);
  const facts = [
    ['Where', undash([e.venue, e.location].filter(Boolean).join(', '))],
    ['Ages', e.good_for_ages],
    ['Cost', COST[e.cost_tier]],
    ['When', SEASON[e.seasonal] || 'Open year round'],
    ['Good for', (e.tags || []).slice(0, 6).join(', ')]
  ].filter(([, v]) => v);
  const near = nearby(e);
  const credit = h && h.image_credit ? h.image_credit : null;
  const planUrl = `/?plan=${encodeURIComponent(`A family day around ${cleanName}${area ? ` in ${area}` : ''}`)}&utm_source=places&utm_medium=page&utm_campaign=${encodeURIComponent(slugOf(e))}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TouristAttraction',
        name: cleanName,
        description: undash(e.description),
        url: `${base}/places/${slugOf(e)}`,
        image: h ? `${base}${h.image_url}` : undefined,
        isAccessibleForFree: e.cost_tier === 'free' ? true : undefined,
        address: { '@type': 'PostalAddress', addressLocality: area, addressRegion: 'ON', addressCountry: 'CA' },
        geo: c ? { '@type': 'GeoCoordinates', latitude: Number(c.lat.toFixed(5)), longitude: Number(c.lng.toFixed(5)) } : undefined,
        hasMap: e.maps_url || undefined,
        sameAs: e.booking_url || undefined,
        touristType: 'Families'
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Places', item: `${base}/places` },
          { '@type': 'ListItem', position: 2, name: cleanName, item: `${base}/places/${slugOf(e)}` }
        ]
      }
    ]
  });

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(page({
    req,
    title: `${cleanName}${area && !cleanName.includes(area) ? `, ${area}` : ''}: family day out guide | DayHop`,
    description: undash(e.description).slice(0, 158),
    canonicalPath: `/places/${slugOf(e)}`,
    ogImage: h ? `${base}${h.image_url}` : undefined,
    ogType: 'place',
    jsonLd,
    bodyHtml: `
<article>
  <header style="margin-top:14px">
    <span class="eyebrow"><a href="/places" style="color:inherit;text-decoration:none">← DayHop Places</a> · ${escapeHtml(area)}</span>
    <h1>${escapeHtml(cleanName)}</h1>
    ${tagline ? `<p class="sub">${escapeHtml(undash(tagline))}</p>` : ''}
  </header>
  ${h ? `<img class="hero-img" src="${escapeHtml(h.image_url)}" alt="${escapeHtml(cleanName)}">
  ${credit ? `<p class="byline">Photo: ${escapeHtml(credit.author || '')}, ${escapeHtml(credit.licence || credit.license || '')}${credit.source ? `, <a href="${escapeHtml(credit.source)}" rel="nofollow">source</a>` : ''}</p>` : ''}` : ''}
  <div class="article">
    <p>${escapeHtml(undash(e.description))}</p>
    <ul>${facts.map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join('')}</ul>
    <p>${e.maps_url ? `<a href="${escapeHtml(e.maps_url)}" rel="nofollow">Directions and live hours</a>` : ''}${e.booking_url ? ` · <a href="${escapeHtml(e.booking_url)}" rel="nofollow">Official site and tickets</a>` : ''}</p>
  </div>
  <div class="cta-panel">
    <strong>Make a whole day of it</strong>
    Tell DayHop you are going to ${escapeHtml(cleanName)} and it plans the rest: lunch nearby, a second stop, and the weather call.
    <br><a class="btn" href="${escapeHtml(planUrl)}">Plan a day around it →</a>
  </div>
  ${near.length ? `<h2 style="font-family:var(--display);margin:40px 0 0">Nearby on DayHop</h2>
  <ul class="grid" style="margin-top:16px">${near.map(({ x, d }) => card(x, `${d < 10 ? d.toFixed(1) : Math.round(d)} km away`)).join('')}</ul>` : ''}
  <p class="sub" style="margin:10px 0 0">Going for a few days? <a href="/guides/personal?utm_source=places&utm_medium=page">Get a guide made for your trip</a>.</p>
</article>`
  }));
});

// For routes/blog.js sitemap: the index and every place page.
function sitemapUrls(base) {
  return [
    { loc: `${base}/places`, priority: '0.8' },
    ...ENTRIES.map(e => ({ loc: `${base}/places/${slugOf(e)}`, priority: '0.6' }))
  ];
}

module.exports = { router, sitemapUrls, slugOf, splitTitle, undash, ENTRIES };
