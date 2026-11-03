// test/placePages.test.js — the indexable place pages, llms.txt, sitemap
// and content-view tracking that exist to bring search and AI traffic.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const placePages = require('../routes/placePages');
const blog = require('../routes/blog');
const llmsTxt = require('../routes/llmsTxt');
const { lint } = require('../services/copyStyle');

function app() {
  const a = express();
  a.set('trust proxy', true);
  a.use('/places', placePages.router);
  a.get('/sitemap.xml', blog.sitemap);
  return a;
}
async function withServer(fn) {
  const server = app().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.close(); }
}
const visible = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

test('every catalog place gets one page with a unique slug', () => {
  const slugs = placePages.ENTRIES.map(placePages.slugOf);
  assert.ok(slugs.length >= 100, `only ${slugs.length} place pages`);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('place pages: house copy style, schema.org data, plan link, 404', async () => {
  await withServer(async base => {
    const r = await fetch(`${base}/places/wave-pool-rh`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.deepEqual(lint(visible(html)).map(v => v.detail), [], 'customer copy has dash punctuation');
    const ld = JSON.parse(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const place = ld['@graph'].find(x => x['@type'] === 'TouristAttraction');
    assert.equal(place.name, 'The Wave Pool');
    assert.equal(place.address.addressRegion, 'ON');
    assert.ok(place.geo && place.geo.latitude, 'coordinates present');
    assert.match(html, /href="\/\?plan=[^"]+utm_source=places/, 'one-tap plan link, attributed');
    assert.match(html, /<link rel="canonical" href="[^"]+\/places\/wave-pool-rh">/);
    assert.ok(!/googleusercontent|\/api\/photo/.test(html), 'no Google photos on a permanent page');
    assert.equal((await fetch(`${base}/places/not-a-place`)).status, 404);
  });
});

test('places index lists every place, grouped, without dash punctuation', async () => {
  await withServer(async base => {
    const html = await (await fetch(`${base}/places`)).text();
    assert.equal((html.match(/class="card"/g) || []).length, placePages.ENTRIES.length);
    assert.deepEqual(lint(visible(html)).map(v => v.detail), []);
  });
});

test('sitemap carries /places and every place page; llms.txt maps them', async () => {
  await withServer(async base => {
    const xml = await (await fetch(`${base}/sitemap.xml`)).text();
    const placeLocs = xml.match(/<loc>[^<]+\/places\/[^<]+<\/loc>/g) || [];
    assert.equal(placeLocs.length, placePages.ENTRIES.length);
    assert.match(xml, /\/places<\/loc>/);
    assert.match(xml, /\/guides\/personal<\/loc>/);
  });
  const txt = llmsTxt('https://dayhop.quest');
  assert.match(txt, /^# DayHop/);
  assert.equal((txt.match(/\]\(https:\/\/dayhop\.quest\/places\/[^)]+\)/g) || []).length, placePages.ENTRIES.length);
  assert.deepEqual(lint(txt).map(v => v.detail), []);
});

test('content views: people get a source, crawlers are logged apart', () => {
  const analytics = require('../services/analytics');
  const seen = [];
  const orig = analytics.recordEvent;
  analytics.recordEvent = e => seen.push(e);
  try {
    const req = (ua, referer, query = {}) => ({ get: h => ({ 'user-agent': ua, referer }[h.toLowerCase()]), query, ip: '1.2.3.4', hostname: 'dayhop.quest' });
    blog.recordView(req('Mozilla/5.0 (iPhone)', 'https://www.google.com/'), 'places', 'wave-pool-rh');
    blog.recordView(req('Mozilla/5.0 (compatible; Googlebot/2.1)', ''), 'places', 'wave-pool-rh');
    blog.recordView(req('Mozilla/5.0', '', { utm_source: 'reddit', utm_campaign: 'rtoronto' }), 'blog', 'x');
  } finally { analytics.recordEvent = orig; }
  assert.equal(seen[0].type, 'content_view');
  assert.equal(seen[0].meta.utm.referrer, 'google.com');
  assert.match(seen[0].ownerKey, /^cv-[0-9a-f]{12}$/);
  assert.equal(seen[1].type, 'crawler_view');
  assert.equal(seen[1].meta.bot, 'googlebot');
  assert.equal(seen[2].meta.utm.utm_source, 'reddit');
});
