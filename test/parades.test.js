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
  });
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
