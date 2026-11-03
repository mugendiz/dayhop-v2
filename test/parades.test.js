// test/parades.test.js — GTA Santa Claus parades 2026 (routes/parades.js,
// services/paradeReminders.js, data/santaParades2026.js). Offline: memory
// stores, email stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.RESEND_API_KEY;
const { PARADES, NOT_POSTED } = require('../data/santaParades2026');
const reminders = require('../services/paradeReminders');
const parades = require('../routes/parades');
// The washroom line reads Go Now's data; keep Toronto's live feed offline.
require('../services/goNow')._setLive({ at: Date.now(), points: [], postedDate: null });

test('every parade row cites its own organizer, a check date, and a GTA spot', () => {
  const slugs = new Set();
  const AGGREGATORS = /todocanada|childslife|ontariofestivals|fandom|familyfuncanada|todoontario|verytoronto|carnifest/i;
  for (const p of PARADES) {
    assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
    assert.match(p.official_url, /^https:\/\//, p.slug);
    assert.doesNotMatch(p.official_url, AGGREGATORS, `${p.slug} must cite the organizer, not a listing`);
    assert.match(p.verified_on, /^2026-\d{2}-\d{2}$/, p.slug);
    assert.match(p.date, /^2026-1[12]-\d{2}$/, p.slug);
    assert.ok(p.lat > 43.2 && p.lat < 44.3 && p.lng > -80.1 && p.lng < -78.8, `${p.slug} pin outside the GTA`);
  }
  assert.ok(NOT_POSTED.length >= 1);
});

async function withApp(fn) {
  const app = express();
  app.use('/api/parades', parades.api);
  app.use(parades.router);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('the page: a plain table with every parade, sources, a map and a reminder box', async () => {
  await withApp(async base => {
    const res = await fetch(`${base}/santa-parades`);
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const p of PARADES) {
      assert.ok(html.includes(`id="${p.slug}"`), `row for ${p.slug}`);
      assert.ok(html.includes(p.official_url.replace(/&/g, '&amp;')), `source for ${p.slug}`);
    }
    assert.match(html, /<table class="pz-table">/);
    assert.match(html, /Not posted yet/, 'an unknown time says so, never a guess');
    assert.match(html, /\/vendor\/leaflet-1\.9\.4\/leaflet\.js/);
    assert.match(html, /<link rel="canonical" href="[^"]*\/santa-parades">/);
    assert.match(html, /utm_campaign=parades/);
    // Pictures: self-hosted, credited, and the share card has one.
    assert.match(html, /<meta property="og:image" content="[^"]*\/img\/parades\/og-parades\.jpg">/);
    for (const img of ['santa-waving', 'elves', 'clowns']) assert.match(html, new RegExp(`/img/parades/${img}\\.jpg`));
    assert.equal((html.match(/CC BY 2\.0/g) || []).length, 3, 'every photo carries its licence');
    assert.doesNotMatch(html, /googleusercontent|\/api\/photo/);
  });
});

test('planner structure: status per row, unconfirmed towns listed without dates, washroom line, calendar links', async () => {
  await withApp(async base => {
    const html = await (await fetch(`${base}/santa-parades`)).text();
    assert.equal((html.match(/pz-status ok">Confirmed/g) || []).length, PARADES.length);
    for (const town of NOT_POSTED) assert.match(html, new RegExp(`<span class="pz-town">${town}</span>`));
    assert.equal((html.match(/pz-status no">Unconfirmed/g) || []).length, NOT_POSTED.length);
    assert.match(html, /Verified on November 3, 2026/);
    assert.match(html, /href="\/santa-parades\/mississauga\.ics"/);
    assert.match(html, /Nearest public washroom we know of(: [^<]+,| is) about \d/, 'a washroom line from the Go Now data');
    assert.doesNotMatch(html, /we know of: Public washroom,/, 'a generic name is not repeated');
    assert.match(html, /Route not posted yet\. <a href="\/go\?lat=/, 'Toronto: no route, so no washroom claim');
    assert.match(html, /Parade day with kids/);
    const short = await fetch(`${base}/parades`, { redirect: 'manual' });
    assert.equal(short.status, 301);
    assert.equal(short.headers.get('location'), '/santa-parades');
  });
});

test('calendar files: timed when the town posted a time, all day when it did not', async () => {
  const { icsFor, parseTimes } = parades;
  assert.deepEqual(parseTimes('11 a.m. to 1 p.m.'), [660, 780]);
  assert.deepEqual(parseTimes('6 p.m.'), [1080, 1200]);
  assert.deepEqual(parseTimes('6 p.m. to 7:30 p.m.'), [1080, 1170]);
  assert.equal(parseTimes(null), null);
  const miss = icsFor(PARADES.find(p => p.slug === 'mississauga'), 'https://dayhop.quest');
  assert.match(miss, /DTSTART;TZID=America\/Toronto:20261121T180000/);
  assert.match(miss, /UID:parade-mississauga-2026@dayhop\.quest/);
  const toronto = icsFor(PARADES.find(p => p.slug === 'toronto'), 'https://dayhop.quest');
  assert.match(toronto, /DTSTART;VALUE=DATE:20261122/);
  assert.match(toronto, /DTEND;VALUE=DATE:20261123/);
  assert.match(toronto, /Start time not posted yet/);
  await withApp(async base => {
    const r = await fetch(`${base}/santa-parades/oakville.ics`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/calendar/);
    assert.equal((await fetch(`${base}/santa-parades/atlantis.ics`)).status, 404);
  });
});

test('the old parade story redirects to the checked page', async () => {
  const app = express();
  app.use('/blog', require('../routes/blog').router);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/blog/santa-claus-parades-near-toronto-2026-dates-and-family-tips-for-the-gta`, { redirect: 'manual' });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/santa-parades');
  } finally { server.close(); }
});

test('remind: needs a real email and a listed parade; a good request is stored', async () => {
  await withApp(async base => {
    const post = body => fetch(`${base}/api/parades/remind`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ email: 'nope', parade: 'mississauga' })).status, 400);
    assert.equal((await post({ email: 'a@example.com', parade: 'atlantis' })).status, 400);
    const ok = await post({ email: 'Parent@Example.com', parade: 'mississauga' });
    assert.equal(ok.status, 200);
    assert.match((await ok.json()).message, /Mississauga/);
    assert.ok(reminders._mem.get('parade-remind:mississauga').includes('parent@example.com'));
  });
});

test('reminders go out the evening before, to confirmed subscribers who asked, once', async () => {
  // 2026-11-20 18:00 Toronto (EST, UTC-5) is the evening before Nov 21.
  const evening = new Date('2026-11-20T23:00:00Z');
  const afternoon = new Date('2026-11-20T20:00:00Z');
  assert.deepEqual(reminders.dueParades(afternoon), []);
  assert.deepEqual(reminders.dueParades(evening).map(p => p.slug).sort(), ['aurora', 'brampton', 'mississauga', 'newmarket']);

  await reminders.addReminder('brampton', 'yes@example.com');
  await reminders.addReminder('brampton', 'pending@example.com');
  const sent = [];
  const deps = {
    now: evening,
    send: async m => { sent.push(m); return { sent: true }; },
    listSubscribed: async () => [{ email: 'yes@example.com', token: 't1' }, { email: 'other@example.com', token: 't2' }]
  };
  await reminders.runReminderSweep(deps);
  const brampton = sent.filter(m => /Brampton/.test(m.subject));
  assert.deepEqual(brampton.map(m => m.to), ['yes@example.com'], 'pending and unrequested addresses get nothing');
  assert.match(brampton[0].text, /5 p\.m\./);
  assert.match(brampton[0].html, /unsubscribe\?token=t1/);
  const before = sent.length;
  await reminders.runReminderSweep(deps);
  assert.equal(sent.length, before, 'a second sweep sends nothing');
});
