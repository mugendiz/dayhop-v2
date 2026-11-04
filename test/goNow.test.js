// test/goNow.test.js — Go Now (/go): one honest data shape, live only where
// the City is live, combinable filters, share card, status alerts.
// Offline: the Toronto live feed is stubbed; the Ontario snapshot is the
// committed data/go/ontario.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
const goNow = require('../services/goNow');
const goAlerts = require('../services/goAlerts');
const routes = require('../routes/goNow');
const { lint } = require('../services/copyStyle');

const rec = o => Object.assign({
  _id: 1, ASSET_ID: 1, LOCATION: 'Test Park', AssetName: 'Test Park Washroom', TYPE: 'Washroom Building',
  ACCESSIBLE_FEATURES: 'None', HOURS: '9 a.m. to 10 p.m.', LOCATION_DETAILS: 'By the playground', ADDRESS: '1 Test St',
  PostedDate: '2026-03-10T13:22:40', Reason: 'None', Status: '1',
  geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3832, 43.6532] })
}, o);

const LIVE = [
  goNow.torontoPoint(rec({ ASSET_ID: 101, AssetName: 'Open With Table', ACCESSIBLE_FEATURES: 'Accessible Stall, Entrance at Grade, Child Change Table' }), '2026-11-03'),
  goNow.torontoPoint(rec({ ASSET_ID: 102, AssetName: 'Closed For Winter', Status: '0', Reason: 'Closed for the Season', geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3840, 43.6540] }) }), '2026-11-03'),
  goNow.torontoPoint(rec({ ASSET_ID: 103, AssetName: 'Open No Info', geometry: JSON.stringify({ type: 'Point', coordinates: [-79.3850, 43.6550] }) }), '2026-11-03')
];
goNow._setLive({ at: Date.now(), points: LIVE, postedDate: '2026-11-03' });

const SHAPE = ['id', 'name', 'lat', 'lng', 'city', 'washroom_status', 'changing_table', 'stroller_friendly', 'last_checked', 'source', 'notes'];

test('Toronto feed maps to the spec shape; only what the City lists becomes true', () => {
  const [withTable, season, noInfo] = LIVE;
  for (const k of SHAPE) assert.ok(k in withTable, `field ${k}`);
  assert.equal(withTable.washroom_status, 'open');
  assert.equal(withTable.changing_table, true);
  assert.equal(withTable.stroller_friendly, true);
  assert.equal(withTable.source, 'toronto_open_data');
  assert.equal(withTable.last_checked, '2026-11-03');
  assert.equal(season.washroom_status, 'closed');
  assert.match(season.notes, /Closed for the Season/);
  assert.equal(noInfo.changing_table, 'unknown', 'not listed is unknown, never false');
  assert.equal(noInfo.stroller_friendly, 'unknown');
});

test('outside Toronto nothing claims open or closed, and every stop carries a check date and a source', async () => {
  const ott = await goNow.nearest({ lat: 45.4215, lng: -75.6972, limit: 6 });
  assert.ok(ott.length > 0);
  for (const p of ott) {
    assert.equal(p.washroom_status, 'unknown', `${p.name} must not claim a status`);
    assert.equal(p.region, 'Ontario');
    assert.match(p.last_checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['ottawa_open_data', 'osm'].includes(p.source));
    for (const k of SHAPE) assert.ok(k in p, `field ${k}`);
  }
});

test('filters combine: open + changing table + stroller returns only stops where all three are true', async () => {
  const all = await goNow.nearest({ lat: 43.6532, lng: -79.3832, limit: 10 });
  for (let i = 1; i < all.length; i++) assert.ok(all[i].dist >= all[i - 1].dist);
  const open = await goNow.nearest({ lat: 43.6532, lng: -79.3832, filters: { open: true }, limit: 10 });
  assert.deepEqual(open.map(p => p.name).sort(), ['Open No Info', 'Open With Table']);
  const allThree = await goNow.nearest({ lat: 43.6532, lng: -79.3832, filters: { open: true, changing: true, stroller: true }, limit: 10 });
  assert.deepEqual(allThree.map(p => p.name), ['Open With Table']);
  const ct = await goNow.nearest({ lat: 43.6532, lng: -79.3832, filters: { changing: true }, limit: 20 });
  for (const p of ct) assert.equal(p.changing_table, true);
});

test('seeded data: "limited" is unknown, and the winter filter drops seasonal and closed stops', () => {
  const pt = o => goNow.seededPoint(Object.assign({ id: 'osm-n1', k: 'wc', n: 'Loo', lat: 44.0, lng: -79.0, src: 'osm', ct: null, acc: null, free: null, hours: null, seasonal: null, addr: null }, o), '2026-11-03');
  assert.equal(pt({ acc: true }).stroller_friendly, true);
  assert.equal(pt({ acc: null }).stroller_friendly, 'unknown');
  assert.equal(pt({ seasonal: true }).seasonal, true);
  const snap = require('../data/go/ontario.json');
  // The build maps wheelchair=limited to null, so no snapshot point can be
  // step-free on a "limited" tag; spot check that the parser is strict.
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'build-go-data.js'), 'utf8'), /\/\^\(yes\|designated\|\[1-9\]\[0-9\]\*\)\$\/i/);
  assert.ok(snap.points.length > 4000);
});

test('winter filter: no closed or seasonal stops', async () => {
  const w = await goNow.nearest({ lat: 43.6532, lng: -79.3832, filters: { winter: true }, limit: 60 });
  for (const p of w) { assert.notEqual(p.washroom_status, 'closed'); assert.notEqual(p.seasonal, true); }
});

async function withApp(fn) {
  const app = express();
  app.use('/api/go', routes.api);
  app.use(routes.page);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('page, API and share card', async () => {
  await withApp(async base => {
    assert.equal((await fetch(`${base}/api/go/near?lat=40&lng=-120`)).status, 400, 'outside Ontario');
    const near = await (await fetch(`${base}/api/go/near?lat=43.6532&lng=-79.3832&f=open,changing&limit=5`)).json();
    assert.deepEqual(near.results.map(p => p.name), ['Open With Table']);
    assert.equal(near.meta.toronto_checked, '2026-11-03');

    const page = await (await fetch(`${base}/go`)).text();
    assert.match(page, /GTA live<\/b> · Ontario seeded · Last data check <span id="gn-lastcheck">Nov 3, 2026<\/span>/);
    for (const chip of ['Open now', 'Changing table', 'Stroller']) assert.match(page, new RegExp(`<span>${chip}</span>`));
    assert.match(page, /<meta property="og:image" content="[^"]*\/api\/go\/card\/default\.png">/);
    assert.doesNotMatch(page, /Go Pro|upgrade|checkout/i, 'no upsells on this page');
    const shared = await (await fetch(`${base}/go?p=to-101`)).text();
    assert.match(shared, /<title>Open With Table: Open \| DayHop Washroom Map<\/title>/);
    assert.match(shared, /\/api\/go\/card\/to-101\.png/);

    const card = await fetch(`${base}/api/go/card/to-101.png`);
    assert.equal(card.status, 200);
    assert.equal(card.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/api/go/card/default.png`)).status, 200);
    assert.equal((await fetch(`${base}/api/go/card/nope-999.png`)).status, 404);
  });
});

test('status alerts: Toronto live stops only, sent once when the status flips, to confirmed subscribers', async () => {
  await withApp(async base => {
    const post = body => fetch(`${base}/api/go/alert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ott = (await goNow.nearest({ lat: 45.4215, lng: -75.6972, limit: 1 }))[0];
    assert.equal((await post({ email: 'a@example.com', id: ott.id })).status, 400, 'no alerts where status is not live');
    assert.equal((await post({ email: 'nope', id: 'to-102' })).status, 400);
    assert.equal((await post({ email: 'Parent@Example.com', id: 'to-102' })).status, 200);
  });
  const sent = [];
  const deps = {
    send: async m => { sent.push(m); return { sent: true }; },
    listSubscribed: async () => [{ email: 'parent@example.com', token: 'tok' }]
  };
  // No change yet: nothing goes out.
  await goAlerts.runAlertSweep(Object.assign({ places: LIVE }, deps));
  assert.equal(sent.length, 0);
  // The City reopens it.
  const reopened = LIVE.map(p => (p.id === 'to-102' ? Object.assign({}, p, { washroom_status: 'open' }) : p));
  await goAlerts.runAlertSweep(Object.assign({ places: reopened }, deps));
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Closed For Winter is open again/);
  assert.match(sent[0].html, /unsubscribe\?token=tok/);
  await goAlerts.runAlertSweep(Object.assign({ places: reopened }, deps));
  assert.equal(sent.length, 1, 'once per change');
});

test('copy style: page, cards and alert emails have no dash punctuation', () => {
  const text = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
  const page = routes.html({ base: 'https://dayhop.quest', title: 'Go Now', description: 'd', ogImage: 'x', canonical: '/go', lastCheck: 'Nov 3, 2026' });
  assert.deepEqual(lint(text(page)).map(v => v.detail), []);
  for (const p of [null, ...LIVE]) {
    const svgText = routes.cardSvg(p).match(/>([^<]+)</g).map(s => s.slice(1, -1)).join(' ');
    assert.deepEqual(lint(svgText).map(v => v.detail), []);
  }
  for (const p of LIVE) {
    const m = goAlerts.alertEmail(p, 'tok');
    for (const part of [m.subject, m.text, text(m.html)]) assert.deepEqual(lint(part).map(v => v.detail), []);
  }
});

test('no Google calls anywhere in Go Now (Goal 3)', () => {
  const fs = require('fs');
  for (const f of ['services/goNow.js', 'services/goAlerts.js', 'routes/goNow.js', 'public/go.js']) {
    assert.doesNotMatch(fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8'), /googleapis|maps\.google\.com\/maps\/api|places\.googleapis/);
  }
});

test('unnamed OSM toilets take the nearest landmark name within 300 m; named ones keep theirs', async () => {
  const goNow = require('../services/goNow');
  goNow._setLive({ at: Date.now(), postedDate: '2026-11-03', points: [] });
  const res = await goNow.nearest({ lat: 43.6532, lng: -79.3832, limit: 60, waitLive: false });
  const generic = res.filter(p => p.name === 'Public washroom').length;
  const named = res.filter(p => /^Washroom near /.test(p.name));
  assert.ok(named.length > 0, 'some downtown toilets get a landmark name');
  assert.ok(generic < res.length / 2, `${generic} of ${res.length} still generic`);
  for (const p of named) assert.doesNotMatch(p.name, /near .*washroom$/i);
  const again = await goNow.byId(named[0].id);
  assert.equal(again.name, named[0].name, 'the shared link shows the same name');
});

test('the City link text "View ... hours" is not shown as hours', () => {
  const p = require('../services/goNow').torontoPoint({ ASSET_ID: 1, AssetName: 'X', Status: '1', HOURS: 'View outdoor rink hours', geometry: { coordinates: [-79.38, 43.65] } }, '2026-11-03');
  assert.ok(!p.notes || !/Hours:/.test(p.notes));
});

test('landmark names follow house copy style (no "word - word")', async () => {
  const goNow = require('../services/goNow');
  const { lint } = require('../services/copyStyle');
  goNow._setLive({ at: Date.now() + 1, postedDate: '2026-11-03', points: [] });
  const res = await goNow.nearest({ lat: 43.6532, lng: -79.3832, limit: 60, waitLive: false });
  for (const p of res) assert.deepEqual(lint(p.name).map(v => v.detail), [], p.name);
});

test('OSM tile layers send a Referer (the site default is no-referrer; OSM blocks tiles without one)', () => {
  const fs = require('fs'), path = require('path');
  for (const f of ['public/go.js', 'routes/parades.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.match(/L\.tileLayer\([^;]*\)/g) || []) assert.match(m, /referrerPolicy: 'strict-origin-when-cross-origin'/, f);
  }
});

test('spotlight date ranges in the hero eyebrow carry no dash', () => {
  const { formatRange } = require('../services/spotlight');
  const { lint } = require('../services/copyStyle');
  for (const w of [{ start: '2026-12-25', end: '2026-12-28' }, { start: '2026-12-31', end: '2027-01-02' }]) {
    assert.deepEqual(lint(formatRange(w)).map(v => v.detail), [], formatRange(w));
  }
  assert.equal(formatRange({ start: '2026-12-25', end: '2026-12-28' }), 'Dec 25 to 28');
});
