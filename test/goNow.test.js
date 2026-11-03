// test/goNow.test.js — Go Now (/go): honest status, real badges, nearest
// first, share card. Offline: the Toronto live feed is stubbed; the Ontario
// snapshot is the committed data/go/ontario.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const goNow = require('../services/goNow');
const routes = require('../routes/goNow');
const { lint } = require('../services/copyStyle');

const rec = (o) => Object.assign({
  _id: 1, ASSET_ID: 1, LOCATION: 'Test Park', AssetName: 'Test Park Washroom', TYPE: 'Washroom Building',
  ACCESSIBLE_FEATURES: 'None', HOURS: '9 a.m. to 10 p.m.', LOCATION_DETAILS: 'By the playground', ADDRESS: '1 Test St',
  PostedDate: '2026-11-02T13:22:40', Reason: 'None', Status: '1',
  geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3832, 43.6532] })
}, o);

const LIVE = [
  goNow.torontoPoint(rec({ ASSET_ID: 101, AssetName: 'Open With Table', ACCESSIBLE_FEATURES: 'Accessible Stall, Entrance at Grade, Child Change Table' })),
  goNow.torontoPoint(rec({ ASSET_ID: 102, AssetName: 'Closed For Winter', Status: '0', Reason: 'Closed for the Season', geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3840, 43.6540] }) })),
  goNow.torontoPoint(rec({ ASSET_ID: 103, AssetName: 'Under Repair', Status: '0', Reason: 'Maintenance/Repairs', geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3850, 43.6550] }) }))
];
goNow._setLive({ at: Date.now(), points: LIVE, postedDate: '2026-11-02' });

test('Toronto feed: status and badges come only from the City fields', () => {
  const [open, season, repair] = LIVE;
  assert.equal(open.status, 'open');
  assert.equal(open.ct, true);
  assert.equal(open.stepfree, true);
  assert.equal(open.acc, true);
  assert.equal(open.checked, '2026-11-02');
  assert.equal(season.status, 'season');
  assert.equal(season.ct, null, 'no "Child Change Table" listed means unknown, not no');
  assert.equal(repair.status, 'closed');
  assert.deepEqual(goNow.statusOf(season), { key: 'closed', label: 'Closed for the season' });
  assert.equal(goNow.statusOf(repair).label, 'Closed: Maintenance/Repairs');
});

test('outside Toronto nothing claims to be open: the label says the status is not live', async () => {
  const ott = await goNow.nearest({ lat: 45.4215, lng: -75.6972, layer: 'wc', limit: 5 });
  assert.ok(ott.length > 0, 'Ottawa has washrooms in the snapshot');
  for (const p of ott) assert.notEqual(p.statusLabel.key, 'open', `${p.n} must not claim open`);
});

test('nearest first; Open now keeps only live-open Toronto spots; Winter open drops seasonal closures', async () => {
  const all = await goNow.nearest({ lat: 43.6532, lng: -79.3832, layer: 'wc', limit: 10 });
  for (let i = 1; i < all.length; i++) assert.ok(all[i].dist >= all[i - 1].dist);
  const open = await goNow.nearest({ lat: 43.6532, lng: -79.3832, layer: 'wc', filters: { open: true }, limit: 10 });
  assert.deepEqual(open.map(p => p.n), ['Open With Table']);
  const winter = await goNow.nearest({ lat: 43.6532, lng: -79.3832, layer: 'wc', filters: { winter: true }, limit: 40 });
  assert.ok(!winter.some(p => p.n === 'Closed For Winter'));
});

test('changing tables layer only shows places a source says have one; family stops carry the nearest washroom', async () => {
  const ct = await goNow.nearest({ lat: 43.6532, lng: -79.3832, layer: 'ct', limit: 10 });
  assert.ok(ct.length > 0);
  for (const p of ct) assert.equal(p.ct, true);
  const stops = await goNow.nearest({ lat: 43.6532, lng: -79.3832, layer: 'stop', limit: 5 });
  assert.ok(stops.length > 0);
  for (const p of stops) assert.equal(p.k, 'stop');
  assert.ok(stops.some(p => p.wcDist != null));
});

async function withApp(fn) {
  const app = express();
  app.use('/api/go', routes.api);
  app.use(routes.page);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('API, page and share card', async () => {
  await withApp(async base => {
    assert.equal((await fetch(`${base}/api/go/near?lat=40&lng=-120`)).status, 400, 'outside Ontario');
    const near = await (await fetch(`${base}/api/go/near?lat=43.6532&lng=-79.3832&layer=wc&limit=3`)).json();
    assert.equal(near.results.length, 3);
    assert.equal(near.meta.toronto_checked, '2026-11-02');

    const page = await (await fetch(`${base}/go`)).text();
    assert.match(page, /<meta property="og:image" content="[^"]*\/api\/go\/card\/default\.png">/);
    assert.match(page, /\/vendor\/leaflet-1\.9\.4\/leaflet\.js/);
    assert.match(page, /Plan it free/);
    const shared = await (await fetch(`${base}/go?p=to-101`)).text();
    assert.match(shared, /\/api\/go\/card\/to-101\.png/);
    assert.match(shared, /<title>Open With Table: Open \| DayHop Go Now<\/title>/);

    const card = await fetch(`${base}/api/go/card/to-101.png`);
    assert.equal(card.status, 200);
    assert.equal(card.headers.get('content-type'), 'image/png');
    assert.ok((await card.arrayBuffer()).byteLength > 5000);
    assert.equal((await fetch(`${base}/api/go/card/default.png`)).status, 200);
    assert.equal((await fetch(`${base}/api/go/card/nope-999.png`)).status, 404);
    assert.equal((await fetch(`${base}/api/go/place/to-101`)).status, 200);
  });
});

test('copy style: page and share cards have no dash punctuation', () => {
  const text = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
  const page = routes.html({ base: 'https://dayhop.quest', title: 'Go Now', description: 'd', ogImage: 'x', canonical: '/go' });
  assert.deepEqual(lint(text(page)).map(v => v.detail), []);
  for (const p of [null, Object.assign({}, LIVE[0], { statusLabel: goNow.statusOf(LIVE[0]) }), Object.assign({}, LIVE[1], { statusLabel: goNow.statusOf(LIVE[1]) })]) {
    const svgText = routes.cardSvg(p).match(/>([^<]+)</g).map(s => s.slice(1, -1)).join(' ');
    assert.deepEqual(lint(svgText).map(v => v.detail), []);
  }
});

test('no Google calls anywhere in Go Now (Goal 3)', () => {
  const fs = require('fs');
  for (const f of ['services/goNow.js', 'routes/goNow.js', 'public/go.js']) {
    assert.doesNotMatch(fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8'), /googleapis|maps\.google\.com\/maps\/api|places\.googleapis/);
  }
});
