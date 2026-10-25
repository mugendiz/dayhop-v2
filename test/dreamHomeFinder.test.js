// test/dreamHomeFinder.test.js — "Find open houses": Grok's finds are kept
// only when the cited page itself shows the address, the price and the
// date, and kept finds land as drafts, never live. Offline: Grok and every
// page are stubbed; fixtures are plainly fake ("123 Test Street").
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;

const finder = require('../services/dreamHomeFinder');
const dh = require('../services/dreamHomes');

const NOW = Date.parse('2026-10-29T16:00:00Z'); // Thu Oct 29, noon in Toronto
const page = text => ({ ok: true, text: String(text).toLowerCase(), kind: 'page' });

test('page checks: address, price and date must all be on the source', async () => {
  const f = { address: '123 Test Street, Testville', price: 1249000, windows: [{ date: '2026-10-31', start: '14:00', end: '16:00' }], source_url: 'https://agent.example/listing/123' };
  const read = text => async () => page(text);
  assert.equal(await finder.checkFind(f, read('123 Test Street · $1,249,000 · Open house Oct 31, 2026 2:00 PM - 4:00 PM')), null);
  assert.equal(await finder.checkFind(f, read('Open house Saturday, October 31st. 123 Test St. Asking $1249000')), null);
  assert.match(await finder.checkFind(f, read('125 Test Street · $1,249,000 · Oct 31')), /does not name/);
  assert.match(await finder.checkFind(f, read('123 Test Street · $1,349,000 · Oct 31')), /asking price/);
  assert.match(await finder.checkFind(f, read('123 Test Street · $1,249,000 · Nov 1')), /date 2026-10-31/);
  assert.match(await finder.checkFind(f, async () => ({ ok: false, why: 'the page answers 403' })), /403/);
});

test('an X post may say the weekday instead of the date, but only for the coming week', () => {
  const posted = Date.UTC(2026, 9, 29); // Thu Oct 29
  const text = 'open house 123 test street $1,249,000 sat sun 2 4pm';
  assert.equal(finder.pageHasDate(text, '2026-10-31', posted), true, 'Sat Oct 31, two days after the post');
  assert.equal(finder.pageHasDate(text, '2026-11-07', posted), false, 'a Saturday nine days out is not "Sat"');
  assert.equal(finder.pageHasDate(text, '2026-10-31', null), false, 'a web page needs the date itself');
});

test('sources: listing portals and home pages are refused before any fetch', async () => {
  for (const [url, why] of [['https://www.realtor.ca/real-estate/1/x', /not an allowed source/], ['https://housesigma.com/on/x', /not an allowed source/],
    ['https://agent.example/', /home page/], ['http://agent.example/listing/1', /https/]]) {
    assert.match((await finder.readSource(url)).why, why, url);
  }
});

test('findOpenHouses: checked finds become drafts; the rest are skipped with a reason', async () => {
  dh._mem.clear();
  await dh.save(null, { address: '200 Test Street, Testville', area: 'Test Heights, Testville', price: 900000, windows: [{ date: '2026-10-31', start: '14:00', end: '16:00' }], source_url: 'https://agent.example/200' }, { publish: true });
  const win = date => [{ date, start: '14:00', end: '16:00' }];
  const homes = [
    { address: '123 Test Street, Testville', area: 'Test Heights, Testville', price: 1249000, windows: win('2026-10-31'), source_url: 'https://agent.example/123' },
    { address: '125 Test Street, Testville', area: 'Test Heights, Testville', price: 999000, windows: win('2026-10-31'), source_url: 'https://agent.example/125' },
    { address: '127 Test Street, Testville', area: 'Test Heights, Testville', price: 777000, windows: win('2026-12-20'), source_url: 'https://agent.example/127' },
    { address: '200 Test Street, Testville', area: 'Test Heights, Testville', price: 900000, windows: win('2026-10-31'), source_url: 'https://agent.example/200' },
    { address: '129 Test Street, Testville', price: 500000, windows: win('2026-10-31'), source_url: 'https://agent.example/129' }
  ];
  const pages = {
    'https://agent.example/123': '123 Test Street, Testville. Asking $1,249,000. Open house Sat Oct 31, 2 to 4 PM.',
    'https://agent.example/125': '125 Test Street. Open house Oct 31. Price on request.'
  };
  const r = await finder.findOpenHouses({
    now: NOW, actor: 'test',
    search: async () => ({ data: { homes }, usage: null }),
    read: async url => (pages[url] ? page(pages[url]) : { ok: false, why: 'the page answers 404' })
  });
  assert.equal(r.found, 5);
  assert.deepEqual(r.added.map(h => h.address), ['123 Test Street, Testville']);
  const why = Object.fromEntries(r.skipped.map(s => [s.address.split(',')[0], s.reason]));
  assert.match(why['125 Test Street'], /asking price/);
  assert.match(why['127 Test Street'], /next two weeks/);
  assert.match(why['200 Test Street'], /already in the list/);
  assert.match(why['129 Test Street'], /Neighbourhood/);
  // The kept find is a draft, marked, and not public.
  const saved = await dh.get(r.added[0].id);
  assert.equal(saved.published, false);
  assert.equal(saved.found_by, 'grok');
  assert.ok(!(await dh.listPublic(NOW)).some(h => h.id === saved.id));
});

test('one search at a time', async () => {
  finder._resetJob();
  let calls = 0;
  let release;
  const gate = new Promise(r => { release = r; });
  const search = async () => { calls++; await gate; return { data: { homes: [] } }; };
  const a = finder.startFind({ search, now: NOW });
  const b = finder.startFind({ search, now: NOW });
  assert.equal(a, b);
  assert.equal(finder.findStatus().state, 'running');
  release();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(finder.findStatus().state, 'done');
  assert.equal(calls, 1);
  finder.startFind({ search, now: NOW });
  assert.equal(calls, 1, 'cooldown: a second click right after reuses the result');
  finder._resetJob();
});
