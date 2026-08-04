// routes/blog.js — DayHop V2
// Server-rendered blog: /blog (index) and /blog/:slug (article), plus
// /sitemap.xml. These pages exist for search engines first and humans a
// close second, so they're plain fast HTML — no SPA shell, no JS, brand
// styles inlined (one request, no render-blocking fetch). Content comes
// from services/articles (seed stories + webhook rows, merged).

const express = require('express');
const router = express.Router();
const articles = require('../services/articles');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function origin(req) {
  // trust proxy is on in server.js, so protocol survives Render's proxy.
  return `${req.protocol}://${req.get('host')}`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto'
    });
  } catch (e) { return ''; }
}

// Shared page chrome. Mirrors the app's tokens (paper/ink/coral, Satoshi +
// Inter) so /blog reads as the same product without loading main.css.
const STYLES = `
:root{--ink:#102A2E;--ink-soft:#2C4A4E;--paper:#FBF7EE;--paper-dim:#F2ECDC;--coral:#FF6B4A;--coral-dark:#E1502F;--moss:#3F6F5C;--line:rgba(16,42,46,0.14);--radius:18px;--display:'Satoshi',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;--mono:'Space Grotesk',monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--coral-dark)}
.wrap{max-width:860px;margin:0 auto;padding:0 20px}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.logo{font-family:var(--display);font-weight:700;font-size:22px;color:var(--ink);text-decoration:none;letter-spacing:-0.02em}
.topbar .cta{font-family:var(--display);font-weight:700;font-size:14px;color:#fff;background:var(--coral);text-decoration:none;padding:9px 16px;border-radius:8px}
.topbar .cta:hover{background:var(--coral-dark)}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:var(--moss)}
h1{font-family:var(--display);font-weight:700;letter-spacing:-0.02em;line-height:1.15;font-size:clamp(30px,5vw,44px);margin:8px 0 10px}
.sub{color:var(--ink-soft);font-size:17px;max-width:620px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px;margin:34px 0 60px;padding:0;list-style:none}
.card{background:#fff;border:1px solid var(--line);border-radius:0 var(--radius) var(--radius) 0;overflow:hidden;box-shadow:0 4px 14px rgba(16,42,46,0.08);display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--paper-dim)}
.card-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:8px;flex:1}
.card h2{font-family:var(--display);font-size:19px;line-height:1.3;margin:0}
.card h2 a{color:var(--ink);text-decoration:none}
.card h2 a:hover{color:var(--coral-dark)}
.card p{margin:0;color:var(--ink-soft);font-size:14px}
.card .meta{margin-top:auto;font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);letter-spacing:0.04em}
.hero-img{width:100%;max-height:420px;object-fit:cover;border-radius:0 var(--radius) var(--radius) 0;margin:18px 0 8px;background:var(--paper-dim)}
.article{font-size:17px}
.article h2{font-family:var(--display);letter-spacing:-0.01em;font-size:24px;margin:34px 0 10px}
.article p{margin:0 0 16px}
.article ul{margin:0 0 16px;padding-left:22px}
.article img{max-width:100%;border-radius:12px}
.byline{font-family:var(--mono);font-size:12.5px;color:var(--ink-soft);letter-spacing:0.04em;margin-bottom:6px}
.tags{display:flex;gap:8px;flex-wrap:wrap;margin:26px 0 0;padding:0;list-style:none}
.tags li{font-family:var(--mono);font-size:11.5px;letter-spacing:0.05em;background:var(--paper-dim);border:1px solid var(--line);border-radius:999px;padding:4px 12px}
.cta-panel{margin:44px 0 30px;padding:26px 28px;background:#fff;border:1px solid var(--line);border-radius:var(--radius) 0 0 var(--radius);box-shadow:0 4px 14px rgba(16,42,46,0.08)}
.cta-panel strong{font-family:var(--display);font-size:19px;display:block;margin-bottom:6px}
.cta-panel a.btn{display:inline-block;margin-top:12px;font-family:var(--display);font-weight:700;color:#fff;background:var(--coral);text-decoration:none;padding:11px 20px;border-radius:8px}
.cta-panel a.btn:hover{background:var(--coral-dark)}
footer{border-top:1px solid var(--line);padding:26px 0 40px;margin-top:20px;color:var(--ink-soft);font-size:13.5px}
footer nav{display:flex;gap:14px;margin-top:6px}
footer a{color:var(--ink-soft)}
`;

function page({ req, title, description, canonicalPath, ogImage, bodyHtml, jsonLd }) {
  const base = origin(req);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${base}${canonicalPath}">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<meta property="og:type" content="${canonicalPath === '/blog' ? 'website' : 'article'}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${base}${canonicalPath}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>${STYLES}</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
<div class="wrap">
<nav class="topbar"><a class="logo" href="/">DayHop</a><a class="cta" href="/">Plan my day →</a></nav>
${bodyHtml}
<footer>
<p>DayHop is a Toronto-built day planner: real venues, live weather, and AI that plans like a thoughtful local friend.</p>
<nav><a href="/">Planner</a><a href="/blog">Stories</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="mailto:admin@dayhop.quest?subject=Advertising%20inquiry%20%E2%80%94%20DayHop">Advertise with us</a></nav>
</footer>
</div>
</body>
</html>`;
}

router.get('/', async (req, res) => {
  const all = await articles.listPublished();
  const cards = all.map(a => `
<li class="card">
  ${a.hero_image_url ? `<a href="/blog/${escapeHtml(a.slug)}" aria-hidden="true" tabindex="-1"><img src="${escapeHtml(a.hero_image_url)}" alt="" loading="lazy"></a>` : ''}
  <div class="card-body">
    <h2><a href="/blog/${escapeHtml(a.slug)}">${escapeHtml(a.title)}</a></h2>
    <p>${escapeHtml(a.description)}</p>
    <span class="meta">${escapeHtml(fmtDate(a.published_at))}</span>
  </div>
</li>`).join('\n');

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(page({
    req,
    title: 'DayHop Stories — new openings, hidden gems & day plans for the GTA',
    description: 'Field notes from the DayHop team: new Toronto openings, must-see spots, event recaps, and perfect-day itineraries across the GTA and Ontario.',
    canonicalPath: '/blog',
    ogImage: all[0] && all[0].hero_image_url,
    bodyHtml: `
<header style="margin-top:14px">
  <span class="eyebrow">DayHop Stories</span>
  <h1>Know the city like it's your job</h1>
  <p class="sub">New openings, hidden gems, event recaps, and perfect-day itineraries, written from the same live data that powers the planner.</p>
</header>
<ul class="grid">${cards}</ul>`
  }));
});

router.get('/:slug', async (req, res) => {
  const a = await articles.getBySlug(String(req.params.slug || '').toLowerCase());
  if (!a) {
    res.status(404).setHeader('Cache-Control', 'no-store');
    return res.send(page({
      req,
      title: 'Story not found — DayHop',
      description: 'That story doesn’t exist (yet).',
      canonicalPath: '/blog',
      bodyHtml: `<header style="margin-top:14px"><h1>Story not found</h1>
<p class="sub">That one doesn't exist (or was unpublished). <a href="/blog">Browse all stories →</a></p></header>`
    }));
  }

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    image: a.hero_image_url || undefined,
    datePublished: a.published_at,
    author: { '@type': 'Organization', name: a.author || 'DayHop' },
    publisher: { '@type': 'Organization', name: 'DayHop' },
    mainEntityOfPage: `${origin(req)}/blog/${a.slug}`
  });

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(page({
    req,
    title: `${a.title} — DayHop Stories`,
    description: a.description,
    canonicalPath: `/blog/${a.slug}`,
    ogImage: a.hero_image_url,
    jsonLd,
    bodyHtml: `
<article>
  <header style="margin-top:14px">
    <span class="eyebrow"><a href="/blog" style="color:inherit;text-decoration:none">← DayHop Stories</a></span>
    <h1>${escapeHtml(a.title)}</h1>
    <p class="byline">${escapeHtml(a.author || 'DayHop')} · ${escapeHtml(fmtDate(a.published_at))}</p>
  </header>
  ${a.hero_image_url ? `<img class="hero-img" src="${escapeHtml(a.hero_image_url)}" alt="">` : ''}
  <div class="article">${a.html}</div>
  ${a.tags.length ? `<ul class="tags">${a.tags.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
  <div class="cta-panel">
    <strong>Turn this into an actual day</strong>
    Tell DayHop what kind of day you want, in one sentence, and it plans it with real venues, live weather, and today's events.
    <br><a class="btn" href="/">Plan my day →</a>
  </div>
</article>`
  }));
});

// /sitemap.xml — planner, blog index, every article. Mounted at app level.
async function sitemap(req, res) {
  const base = origin(req);
  const all = await articles.listPublished();
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/blog`, priority: '0.8' },
    ...all.map(a => ({
      loc: `${base}/blog/${a.slug}`,
      lastmod: String(a.published_at).slice(0, 10),
      priority: '0.6'
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
}

module.exports = { router, sitemap };
