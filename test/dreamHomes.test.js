// test/dreamHomes.test.js — Dream Home: status in Toronto time, the public
// rail (live only, open now first, expiry without an admin), publish rules,
// and the admin role gates. Offline: in-memory store, no Maps key, roles
// stubbed. Fixtures are plainly fake ("123 Test Street").
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

const express = require('express');
const dh = require('../services/dreamHomes');
const { lint } = require('../services/copyStyle');

const HOUR = 3600 * 1000;
// Toronto wall clock for an instant: { date: 'YYYY-MM-DD', hm: 'HH:MM' }.
function wall(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
// A window from now+a hours to now+b hours (whole minutes, same Toronto day assumed by the caller's choice of hours).
function win(a, b, now = Date.now()) {
  const s = wall(now + a * HOUR), e = wall(now + b * HOUR);
  return { date: s.date, start: s.hm, end: e.date === s.date ? e.hm : '23:59' };
}
const base = n => ({ address: `${n} Test Street, Testville`, area: 'Test Heights, Testville', price: 1000000 + n, source_url: `https://example.com/listing/${n}` });

test('torontoMs: wall-clock windows honour daylight saving', () => {
  assert.equal(new Date(dh.torontoMs('2026-10-25', '14:00')).toISOString(), '2026-10-25T18:00:00.000Z', 'EDT');
  assert.equal(new Date(dh.torontoMs('2026-11-07', '14:00')).toISOString(), '2026-11-07T19:00:00.000Z', 'EST after Nov 1');
  assert.equal(dh.windowLabel(dh.torontoMs('2026-10-31', '14:00'), dh.torontoMs('2026-10-31', '16:00')), 'Sat 2 to 4 PM');
  assert.equal(dh.windowLabel(dh.torontoMs('2026-10-31', '11:30'), dh.torontoMs('2026-10-31', '13:00')), 'Sat 11:30 AM to 1 PM');
});

test('status: draft, open only inside a window, upcoming, expired', () => {
  const now = dh.torontoMs('2026-10-25', '15:00');
  const h = Object.assign(base(1), { published: true, windows: [{ date: '2026-10-25', start: '14:00', end: '16:00' }] });
  assert.equal(dh.statusOf(h, now), 'open');
  assert.equal(dh.statusOf(h, dh.torontoMs('2026-10-25', '16:00')), 'expired', 'the end minute is closed, never "open"');
  assert.equal(dh.statusOf(h, dh.torontoMs('2026-10-25', '13:59')), 'upcoming');
  assert.equal(dh.statusOf(Object.assign({}, h, { published: false }), now), 'draft');
});

test('publish needs every required field; a draft needs only an address', () => {
  assert.deepEqual(dh.normalize({ address: '123 Test Street' }).errors, []);
  const { errors } = dh.normalize({ address: '123 Test Street' }, { forPublish: true });
  assert.equal(errors.length, 4, errors.join(' | '));
  assert.ok(dh.normalize({ ...base(2), windows: [{ date: '2026-10-25', start: '16:00', end: '14:00' }] }, { forPublish: true }).errors.some(e => /ends before/.test(e)));
  assert.ok(dh.normalize({ ...base(2), source_url: 'http://plain.example/x', windows: [win(1, 2)] }).errors.some(e => /https/.test(e)), 'http source refused');
  assert.equal(dh.normalize({ address: 'x', note: 'Big yard — and light' }).home.note, 'Big yard, and light', 'house copy rule on the public note');
  assert.equal(dh.normalize({ address: 'x', price: '$1,249,000' }).home.price, 1249000);
});

test('public rail: live only, open now first, expired and drafts never shown (AC1, AC3, AC5)', async () => {
  dh._mem.clear();
  const now = Date.now();
  // Two open now (the one closing sooner first), one upcoming, one expired, one draft.
  const openLate = await dh.save(null, { ...base(10), windows: [win(-1, 3, now)] }, { publish: true });
  const openSoon = await dh.save(null, { ...base(11), windows: [win(-1, 0.5, now)] }, { publish: true });
  const upcoming = await dh.save(null, { ...base(12), windows: [win(48, 50, now)] }, { publish: true });
  const expired = await dh.save(null, { ...base(13), windows: [win(48, 50, now)] }, { publish: true });
  dh._mem.get(expired.id).windows = [{ date: '2026-01-03', start: '14:00', end: '16:00' }]; // ended long ago
  const draft = await dh.save(null, { ...base(14), windows: [win(-1, 3, now)] }, { publish: false });

  const pub = await dh.listPublic(now);
  assert.deepEqual(pub.map(h => h.id), [openSoon.id, openLate.id, upcoming.id]);
  assert.deepEqual(pub.map(h => h.status), ['open', 'open', 'upcoming']);
  assert.ok(!pub.some(h => h.id === draft.id || h.id === expired.id));
  // The public shape carries no admin fields.
  for (const k of ['created_by', 'updated_by', 'published', 'photo_override']) assert.ok(!(k in pub[0]), k);
  // AC3: the same home leaves on its own once its window ends.
  const later = await dh.listPublic(now + 4 * HOUR);
  assert.ok(!later.some(h => h.id === openLate.id || h.id === openSoon.id));
  // The admin tab still lists it, as expired.
  const admin = await dh.listAdmin(now + 4 * HOUR);
  assert.equal(admin.find(h => h.id === openLate.id).status, 'expired');
  assert.equal(admin.find(h => h.id === draft.id).status, 'draft');
});

test('photo: no Google photo means no photo field, so the page draws its labeled placeholder (AC2)', async () => {
  dh._mem.clear();
  const h = await dh.save(null, { ...base(20), windows: [win(1, 2)] }, { publish: true });
  const [pub] = await dh.listPublic();
  assert.equal(pub.id, h.id);
  assert.equal(pub.photo, null);
  assert.match(pub.maps_url, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(pub.source_url, 'https://example.com/listing/20');
});

// ---------- HTTP: the role gates (AC4) and the public endpoint ----------

function serve(roles) {
  const outreach = require('../services/outreach');
  outreach.roleFor = async email => roles[email] || null;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { const u = req.headers['x-test-user']; if (u) req.user = { email: u }; next(); });
  app.use('/api/admin', require('../routes/admin'));
  app.use('/api/dream-homes', require('../routes/dreamHomes'));
  return new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
}
function call(server, method, path, { user, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path,
      headers: Object.assign({ 'Content-Type': 'application/json' }, user ? { 'x-test-user': user } : {}) }, res => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => resolve({ status: res.statusCode, body: s ? JSON.parse(s) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('admin gates: owner and deputy write, operator reads only, everyone else 401 (AC4, AC5)', async () => {
  dh._mem.clear();
  const server = await serve({ 'owner@test.example': 'owner', 'deputy@test.example': 'deputy', 'op@test.example': 'operator' });
  try {
    const home = { ...base(30), windows: [win(1, 2)] };
    // Signed out and non-admin: 401 on reads and writes, no data.
    for (const user of [undefined, 'stranger@test.example']) {
      const r = await call(server, 'GET', '/api/admin/dream-homes', { user });
      assert.equal(r.status, 401); assert.equal(r.body.homes, undefined);
      assert.equal((await call(server, 'POST', '/api/admin/dream-homes', { user, body: { home, publish: true } })).status, 401);
    }
    // Operator: sees the list, cannot add, publish or delete.
    const op = await call(server, 'GET', '/api/admin/dream-homes', { user: 'op@test.example' });
    assert.equal(op.status, 200); assert.equal(op.body.can_edit, false);
    assert.equal((await call(server, 'POST', '/api/admin/dream-homes', { user: 'op@test.example', body: { home } })).status, 401);
    // Deputy saves a draft; it is not public (AC5).
    const d = await call(server, 'POST', '/api/admin/dream-homes', { user: 'deputy@test.example', body: { home } });
    assert.equal(d.status, 200); assert.equal(d.body.home.published, false);
    assert.equal((await call(server, 'GET', '/api/dream-homes')).body.homes.length, 0);
    const id = d.body.home.id;
    assert.equal((await call(server, 'POST', `/api/admin/dream-homes/${id}/publish`, { user: 'op@test.example' })).status, 401);
    assert.equal((await call(server, 'POST', `/api/admin/dream-homes/${id}/delete`, { user: 'op@test.example' })).status, 401);
    // Publishing an incomplete home is refused with the reasons.
    const bad = await call(server, 'POST', '/api/admin/dream-homes', { user: 'owner@test.example', body: { home: { address: '123 Test Street' }, publish: true } });
    assert.equal(bad.status, 400); assert.ok(bad.body.errors.length >= 3);
    // Owner publishes the deputy's draft: public now.
    assert.equal((await call(server, 'POST', `/api/admin/dream-homes/${id}/publish`, { user: 'owner@test.example' })).status, 200);
    const pub = await call(server, 'GET', '/api/dream-homes');
    assert.deepEqual(pub.body.homes.map(h => h.id), [id]);
    // Unpublish and delete.
    assert.equal((await call(server, 'POST', `/api/admin/dream-homes/${id}/unpublish`, { user: 'deputy@test.example' })).status, 200);
    assert.equal((await call(server, 'GET', '/api/dream-homes')).body.homes.length, 0);
    assert.equal((await call(server, 'POST', `/api/admin/dream-homes/${id}/delete`, { user: 'owner@test.example' })).status, 200);
    assert.equal((await call(server, 'GET', '/api/admin/dream-homes', { user: 'owner@test.example' })).body.homes.length, 0);
  } finally {
    server.close();
  }
});

test('copy: the Dream Home strings obey the house rule (AC6)', () => {
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const block = app.slice(app.indexOf('// ---------- Dream Home rail'), app.indexOf('function initDreamHomes'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const section = html.slice(html.indexOf('<section class="dream"'), html.indexOf('</section>', html.indexOf('<section class="dream"')));
  // The strings only (code like "a - b" is not copy): quoted and template
  // literals, with ${…} expressions removed.
  const strings = (block.match(/'(?:[^'\\\n]|\\.)*'|`[^`]*`/g) || []).map(s => s.replace(/\$\{[^}]*\}/g, ' '));
  assert.ok(strings.some(s => /Verify with the listing agent/.test(s)), 'disclaimer present');
  assert.ok(strings.some(s => /not a real estate brokerage/.test(s)), 'brokerage disclaimer present');
  assert.deepEqual(strings.filter(s => lint(s).length), []);
  assert.deepEqual(lint(section), []);
  assert.ok(!/MLS|REALTOR/i.test(block + section), 'no MLS or REALTOR marks');
});
