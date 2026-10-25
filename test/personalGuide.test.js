// test/personalGuide.test.js — the personalized trip guide: what an order
// may be, what the sources may contribute, how a guide is assembled, and
// that the keepsake PDF renders cleanly. Offline: every source is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

const pg = require('../services/personalGuide');
const osm = require('../services/osmTravel');
const { historySection } = require('../services/wikiHistory');
const { renderPersonalGuidePdf } = require('../services/personalGuidePdf');
const fulfil = require('../services/personalGuideFulfill');
const store = require('../services/personalGuideStore');
const { lint } = require('../services/copyStyle');

const TODAY = '2026-10-22';

// ---------- the order ----------

test('order: an Ontario place and a 1 to 35 day trip within a year', () => {
  const ok = pg.validateOrder({ city: 'kingston', start: '2026-11-06', end: '2026-11-09', name: ' Sam <b>& Lee ' }, TODAY);
  assert.equal(ok.ok, true);
  assert.equal(ok.order.city, 'Kingston');
  assert.equal(ok.order.name, 'Sam b& Lee');
  const bad = (body, code) => assert.equal(pg.validateOrder(body, TODAY).error, code, JSON.stringify(body));
  bad({ city: 'Lyon', start: '2026-11-06', end: '2026-11-07' }, 'UNKNOWN_PLACE');
  bad({ city: 'Kingston', start: '2026-10-01', end: '2026-10-03' }, 'PAST_DATES');
  bad({ city: 'Kingston', start: '2027-11-06', end: '2027-11-07' }, 'TOO_FAR');
  bad({ city: 'Kingston', start: '2026-11-09', end: '2026-11-06' }, 'BAD_DATES');
  bad({ city: 'Kingston', start: '2026-11-01', end: '2026-12-10' }, 'TOO_LONG');
  assert.equal(pg.validateOrder({ city: 'Kingston', start: '2026-10-28', end: '2026-11-30' }, TODAY).ok, true, 'a five-week stay is allowed');
  assert.equal(pg.validateOrder({ city: 'Kingston', start: '2026-11-06', notes: 'Mom <b>plans</b>\nahead' }, TODAY).order.notes, 'Mom b plans /b ahead');
  bad({ city: 'Kingston', start: 'soon' }, 'BAD_DATES');
});

// ---------- sources ----------

test('osm: a mapped homeless encampment is never listed as a campground', () => {
  const center = { lat: 44.23, lng: -76.48 };
  const el = (id, tags, lat = 44.24, lon = -76.48) => ({ type: 'node', id, lat, lon, tags });
  const g = osm.group([
    el(1, { tourism: 'camp_site', name: 'Homeless Encampment' }),
    el(2, { tourism: 'camp_site', name: 'Lake Shore Campground', fee: 'yes', tents: 'yes' }),
    el(3, { tourism: 'camp_site', name: 'Somebody' }),
    el(4, { tourism: 'caravan_site', name: 'Rideau Acres', power_supply: 'yes' }),
    el(5, { amenity: 'sanitary_dump_station' }),
    { type: 'relation', id: 6, tags: { route: 'bicycle', name: 'K&P Trail', network: 'rcn' } },
    { type: 'relation', id: 7, tags: { route: 'bicycle', name: 'K&P Trail', network: 'rcn' } }
  ], center);
  assert.deepEqual(g.camping.map(e => e.name), ['Lake Shore Campground']);
  assert.deepEqual(g.rv.map(e => e.name), ['Rideau Acres']);
  assert.ok(g.rv[0].notes.includes('power hookups'));
  assert.equal(g.dump.length, 1);
  assert.equal(g.bike_route.length, 1, 'a route split into relations is listed once');
  assert.equal(g.bike_route[0].km, null, 'routes carry no distance');
});

test('wikipedia: the History section, sub-headings flattened, capped', () => {
  const text = 'Intro.\n\n== History ==\nThe first paragraph about early settlement goes on long enough to count as real.\n=== Fort ===\nA second paragraph about the fort and the war that is long enough to keep here.\n\n== Geography ==\nNot history at all, about lakes and rivers and limestone plains.';
  const h = historySection(text);
  assert.equal(h.length, 2);
  assert.ok(h[0].startsWith('The first paragraph'));
  assert.ok(!h.join(' ').includes('lakes and rivers'));
  assert.deepEqual(historySection('No history here.'), []);
});

test('events print local clock time, not UTC', () => {
  const e = pg.entryOf({ title: 'Frontenacs vs. Generals', date: '2026-11-06', datetime: '2026-11-07T00:05:00Z', venue: 'Arena' }, 'Kingston');
  assert.equal(e.time, '7:05 pm');
});

// ---------- assembly ----------

const place = (title, km, extra = {}) => Object.assign({
  source: 'google_places', title, description: 'park · tourist attraction', category: 'general',
  distance_km: km, rating: 4.6, rating_count: 400, lat: 44.23 + km / 200, lng: -76.48, place_id: `pid-${title}`
}, extra);

function stubDeps() {
  const pool = [
    place('Lemoine Point Conservation Area', 9, { description: 'nature preserve · park' }),
    place('Far Away Park', 95, { description: 'park' }),
    place('Fort Henry', 3, { description: 'historical place · museum', category: 'culture', rating_count: 5000 }),
    place('Chez Piggy', 1, { description: 'restaurant', category: 'food' }),
    place('Farm Diner', 118, { description: 'restaurant', category: 'food' }),
    place('Science Centre', 4, { description: 'science museum for kids', category: 'kids' }),
    place('Little Bluff Conservation Area', 52, { description: 'park', rating: 4.8, rating_count: 900 }),
    { source: 'ticketmaster', title: 'Hockey night', date: '2026-11-06', datetime: '2026-11-07T00:05:00Z', venue: 'Arena', url: 'https://tickets.example/1' },
    { source: 'ticketmaster', title: 'Later in November', date: '2026-11-20', venue: 'Arena' }
  ];
  return {
    geocode: async () => ({ lat: 44.2334, lng: -76.4930 }),
    gather: async () => ({ candidates: pool }),
    events: async () => [],
    nature: async () => [{ source: 'osm_nature', title: 'Spy Rock lookout', description: 'Scenic lookout', lat: 44.5, lng: -76.6 }],
    travel: async () => ({
      camping: [{ kind: 'camping', name: 'Lake Shore Campground', lat: 44.3, lng: -76.5, km: 12, notes: ['tents'], osm_url: 'https://www.openstreetmap.org/node/2' }],
      rv: [], dump: [], rest: [], bike_route: [{ kind: 'bike_route', name: 'K&P Trail', km: null, notes: ['regional'], osm_url: 'https://www.openstreetmap.org/relation/6' }],
      hike_route: [], bike_share: [], missing: []
    }),
    history: async () => ({ title: 'Kingston, Ontario', summary: 'Kingston is a city on Lake Ontario.', history: ['A long paragraph about the founding of the town and its limestone streets.'], url: 'https://en.wikipedia.org/wiki/Kingston,_Ontario', license: 'CC BY-SA 4.0' }),
    details: async id => (id === 'pid-Fort Henry' ? { editorial_summary: 'Restored 19th century British fort with guided tours.' } : {}),
    today: () => TODAY
  };
}

test('assembly: chapters, events split by dates, day plans stay in town', async () => {
  const { order } = pg.validateOrder({ city: 'Kingston', start: '2026-11-06', end: '2026-11-08', name: 'Sam' }, TODAY);
  const g = await pg.buildGuideData(order, stubDeps());
  assert.deepEqual(g.events.trip.map(e => e.title), ['Hockey night']);
  assert.deepEqual(g.events.month.map(e => e.title), ['Later in November']);
  assert.ok(g.food.some(e => e.title === 'Chez Piggy'));
  assert.ok(!g.food.some(e => e.title === 'Farm Diner'), 'restaurants stay within 40 km');
  assert.ok(g.nature.some(e => e.title === 'Spy Rock lookout'), 'OSM nature joins the parks');
  for (const day of g.days) for (const s of day.stops) assert.ok(s.km == null || s.km <= 35, `${s.title} is ${s.km} km out`);
  assert.equal(g.days[0].stops.find(s => s.when === 'Evening').title, 'Hockey night');
  const fort = g.mustSee.find(e => e.title === 'Fort Henry');
  assert.ok(fort, 'the most-reviewed place is a must-see');
  assert.equal(fort.what, 'Restored 19th century British fort with guided tours.');
  assert.ok(g.dayTrips.some(e => e.title === 'Little Bluff Conservation Area'), 'loved places an hour out become day trips');
  assert.equal(g.overnight.camping[0].name, 'Lake Shore Campground');
});

test('a dead source costs its section, never the guide', async () => {
  const deps = stubDeps();
  deps.travel = async () => { throw new Error('Overpass busy'); };
  deps.history = async () => { throw new Error('Wikipedia down'); };
  const { order } = pg.validateOrder({ city: 'Kingston', start: '2026-11-06', end: '2026-11-06' }, TODAY);
  const g = await pg.buildGuideData(order, deps);
  assert.equal(g.history, null);
  assert.deepEqual(g.overnight.missing, ['all']);
  assert.ok(g.mustSee.length > 0);
});

// ---------- the PDF ----------

test('pdf: renders every chapter, no blank folio pages, house copy style', async () => {
  const { order } = pg.validateOrder({ city: 'Kingston', start: '2026-11-06', end: '2026-11-08', name: 'Sam' }, TODAY);
  const g = await pg.buildGuideData(order, stubDeps());
  const PD = require('pdfkit');
  const written = [];
  const orig = PD.prototype.text;
  PD.prototype.text = function (t, ...a) { written.push({ t: String(t), page: this._pageBuffer.indexOf(this.page) }); return orig.call(this, t, ...a); };
  let buf;
  try { buf = await renderPersonalGuidePdf(g); } finally { PD.prototype.text = orig; }
  assert.ok(buf.length > 10000 && buf.slice(0, 5).toString() === '%PDF-');
  const pages = new Set(written.map(w => w.page));
  const last = Math.max(...pages);
  for (let p = 0; p <= last; p++) assert.ok(pages.has(p), `page ${p + 1} has no text (a blank page)`);
  for (const label of ['MUST-SEES WHILE YOU ARE HERE', 'ON DURING YOUR TRIP', 'YOUR DAYS', 'SLEEPING UNDER THE SKY', 'BY BIKE', 'TRIP JOURNAL', 'SOURCES AND CREDITS']) {
    assert.ok(written.some(w => w.t === label), `missing chapter ${label}`);
  }
  // Every string this file writes, with the stub data, obeys the house rule.
  const bad = written.map(w => w.t).filter(t => lint(t).length);
  assert.deepEqual(bad, []);
});

// ---------- delivery ----------

test('download tokens: round trip, tamper and kind checks', () => {
  const t = fulfil.signToken('cs_test_abc123');
  assert.equal(fulfil.verifyToken(t), 'cs_test_abc123');
  assert.equal(fulfil.verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(fulfil.verifyToken(require('../services/cityGuides').signToken('markham')), null, 'a city guide token is not a trip guide token');
  assert.equal(fulfil.verifyToken(fulfil.signToken('cs_test_abc123', -1)), null, 'expired');
});

test('the order comes back from checkout metadata, and the store round-trips', async () => {
  const session = { id: 'cs_test_1', metadata: { guide: 'personal', city: 'Kingston', start: '2026-11-06', end: '2026-11-07', name: 'Sam' } };
  assert.deepEqual(fulfil.orderFromSession(session), { city: 'Kingston', region: 'Frontenac', start: '2026-11-06', end: '2026-11-07', name: 'Sam', notes: null });
  const order = { city: 'Kingston', region: 'Frontenac', start: '2026-11-06', end: '2026-11-07', name: 'Sam', notes: 'one kid, loves trains' };
  assert.deepEqual(fulfil.orderFromSession({ id: 'cs_x', metadata: fulfil.metadataFor(order) }), order, 'checkout metadata round-trips the order');
  assert.equal(fulfil.orderFromSession({ id: 'x', metadata: { city: 'Lyon', start: '2026-11-06', end: '2026-11-07' } }), null);
  await store.saveGuide('cs_test_1', { a: 1 });
  assert.deepEqual(await store.getGuide('cs_test_1'), { a: 1 });
  await store.setStatus('cs_test_1', { state: 'ready', emailed: 'emailed x' });
  assert.equal((await store.getStatus('cs_test_1')).state, 'ready');
});

test('osm: numbered pitches inside a park are not campgrounds', () => {
  const el = (id, name) => ({ type: 'node', id, lat: 45.2, lon: -81.6, tags: { tourism: 'camp_site', name, fee: 'yes' } });
  const g = osm.group([el(1, '1'), el(2, 'Site 14'), el(3, 'Cyprus Lake Campground'), el(4, 'Lot 7')], { lat: 45.25, lng: -81.66 });
  assert.deepEqual(g.camping.map(e => e.name), ['Cyprus Lake Campground']);
});

test('grok checks: a place goes into the weekly plan once; rainy picks are not must-sees or planned', async () => {
  const { verify } = require('../services/grokGuide');
  const items = [
    { id: 'L1', e: { title: 'The Wave Pool', maps: 'm1' } }, { id: 'L2', e: { title: 'Mill Pond Park', maps: 'm2' } },
    { id: 'L3', e: { title: 'Ontario Science Centre', maps: 'm3' } }
  ];
  const order = { city: 'Richmond Hill', start: '2026-10-28', end: '2026-11-30' };
  const answer = {
    must_see: [{ ref: 'L1', why: 'waves' }, { ref: 'L1', why: 'twice' }],
    weeks: [{ label: 'Week 1', plan: [
      { date: '2026-10-29', ref: 'L1', note: 'a' }, { date: '2026-10-30', ref: 'L2', note: 'b' },
      { date: '2026-11-12', ref: 'L1', note: 'again' }, { date: '2026-12-25', ref: 'L2', note: 'out of window' }
    ] }],
    rainy_days: [{ ref: 'L1', note: 'repeat of a must-see' }, { ref: 'L2', note: 'already planned' }, { ref: 'L3', note: 'fine' }]
  };
  const { kept, dropped } = await verify(answer, items, order, { checkUrls: false });
  assert.deepEqual(kept.mustSee.map(p => p.title), ['The Wave Pool'], 'a must-see is listed once');
  assert.deepEqual(kept.weeks[0].plan.map(p => p.title), ['The Wave Pool', 'Mill Pond Park']);
  assert.equal(kept.weeks[0].plan[0].mustSee, true, 'a must-see in the plan is flagged, so the book points back to it');
  assert.deepEqual(kept.rainy.map(r => r.title), ['Ontario Science Centre']);
  assert.ok(dropped.some(d => /repeat: already planned on 2026-10-29/.test(d.reason)));
  assert.ok(dropped.some(d => /already a must-see/.test(d.reason)));
  assert.ok(dropped.some(d => /already in the weekly plan/.test(d.reason)));
});

test('grok checks: events once, flagged in the plan; tips never repeat the packing list', async () => {
  const { verify } = require('../services/grokGuide');
  const order = { city: 'Markham', start: '2026-11-01', end: '2026-11-30' };
  const answer = {
    events: [
      { date: '2026-11-27', title: 'Markham Festival of Lights', url: 'https://x.example/lights' },
      { date: '2026-11-27', title: '41st Annual Festival of Lights', url: 'https://y.example/lights' }
    ],
    weeks: [{ label: 'W', plan: [{ date: '2026-11-27', title: 'Festival of Lights in Markham', url: 'https://x.example/lights' }] }],
    packing: ['Snacks for the tired afternoons', 'Warm hats and gloves'],
    kid_tips: ['Pack snacks for the tired afternoons', 'Book the zoo online the night before', 'Book zoo tickets online the night before']
  };
  const { kept, dropped } = await verify(answer, [], order, { checkUrls: false });
  assert.deepEqual(kept.events.map(e => e.title), ['Markham Festival of Lights']);
  assert.ok(dropped.some(d => d.title === '41st Annual Festival of Lights' && /repeat/.test(d.reason)));
  assert.equal(kept.weeks[0].plan[0].event, true);
  assert.deepEqual(kept.kid_tips, ['Book the zoo online the night before']);
});

test('same place: alternate names match, different towns do not', () => {
  const { samePlace, placeSet } = require('../services/samePlace');
  assert.ok(samePlace('Edwards Gardens', 'Edwards Gardens & the Don ravine trails'));
  assert.ok(samePlace('Remembrance Day Parade', 'Richmond Hill Remembrance Day Parade and Ceremony'));
  assert.ok(samePlace('Toronto Zoo — 10 km of trails and 3,000 animals', 'Toronto Zoo'));
  assert.ok(!samePlace('Treetop Trekking Stouffville', 'Treetop Trekking Brampton'));
  assert.ok(!samePlace('Royal Ontario Museum', 'Aga Khan Museum'));
  assert.ok(!samePlace('Kew Gardens', 'James Gardens'));
  // A listing is also known by its venue (not for dated events on a street).
  const s = placeSet([{ title: "Look through Canada's largest telescope", where: 'David Dunlap Observatory, Richmond Hill' }]);
  assert.ok(s.has('Richmond Hill David Dunlap Observatory'));
  const ev = placeSet([{ title: 'Santa Claus Parade', where: 'Main Street, Markham', date: '2026-11-28' }]);
  assert.ok(!ev.has({ title: 'Trick-or-Treat on Main Street', where: 'Main Street, Markham', date: '2026-10-31' }));
});

test('grok replies: the first JSON object is cut out even when prose after it has braces', () => {
  const { firstJsonObject } = require('../services/grok');
  const reply = 'Sure! {"letter":"a } brace in a string","weeks":[{"x":1}]}\n\nSources: {see} [1](https://x.example)';
  assert.deepEqual(JSON.parse(firstJsonObject(reply)), { letter: 'a } brace in a string', weeks: [{ x: 1 }] });
});

test('grok checks: one key per place, and day-pinned programs land on their day', async () => {
  const { verify } = require('../services/grokGuide');
  const items = [
    { id: 'L1', e: { title: 'Edwards Gardens & the Don ravine trails', maps: 'm' } },
    { id: 'L2', e: { title: 'Edwards Gardens', maps: 'm' } },
    { id: 'L3', e: { title: "Look through Canada's largest telescope", what: 'Public viewing on Saturday nights at the observatory.', maps: 'm' } }
  ];
  const order = { city: 'Richmond Hill', start: '2026-10-28', end: '2026-11-30' };
  const answer = { weeks: [{ label: 'W', plan: [
    { date: '2026-10-28', ref: 'L1' }, { date: '2026-11-21', ref: 'L2' },
    { date: '2026-11-30', ref: 'L3' }, { date: '2026-11-28', ref: 'L3' }
  ] }] };
  const { kept, dropped } = await verify(answer, items, order, { checkUrls: false });
  assert.deepEqual(kept.weeks[0].plan.map(p => p.date), ['2026-10-28', '2026-11-28']);
  assert.ok(dropped.some(d => /repeat/.test(d.reason) && d.title === 'Edwards Gardens'));
  assert.ok(dropped.some(d => /planned on a Monday, but the listing says saturday/.test(d.reason)));
});
