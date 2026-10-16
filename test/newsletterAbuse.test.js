// test/newsletterAbuse.test.js — /api/newsletter/subscribe sends a real
// email to an address the CALLER chooses. That is correct for double opt-in
// and it is also the one place a stranger can make DayHop mail a third
// party. It was unthrottled per address, which was harmless only while
// outbound mail was switched off. These pin the guard now that it is live.
//
// No network: RESEND_API_KEY is unset under test, so sendEmail short-circuits.
const test = require('node:test');
const assert = require('node:assert/strict');
const newsletter = require('../services/newsletter');

const addr = () => `t-${Math.random().toString(36).slice(2)}@example.com`;

test('a repeat subscribe for the same address does not send again', async () => {
  const email = addr();
  const first = await newsletter.subscribe(email, { source: 'test' });
  assert.equal(first.state, 'confirm_sent');

  for (let i = 0; i < 5; i++) {
    const again = await newsletter.subscribe(email, { source: 'test' });
    assert.equal(again.state, 'confirm_throttled',
      'a loop against one address must not produce a mail per request');
    assert.equal(again.emailSent, false);
  }
});

test('the cooldown is per address, so it never blocks a real signup', async () => {
  const a = await newsletter.subscribe(addr(), { source: 'test' });
  const b = await newsletter.subscribe(addr(), { source: 'test' });
  assert.equal(a.state, 'confirm_sent');
  assert.equal(b.state, 'confirm_sent');
});

test('a throttled caller still gets the same opaque success', async () => {
  // routes/newsletter.js returns one body for every outcome so the endpoint
  // cannot be used to enumerate who is already on the list. The throttled
  // branch has to keep ok:true or it would leak exactly that.
  const email = addr();
  await newsletter.subscribe(email, { source: 'test' });
  const throttled = await newsletter.subscribe(email, { source: 'test' });
  assert.equal(throttled.ok, true, 'ok:false here would leak list membership');
});

test('an invalid address is rejected before anything is sent', async () => {
  for (const bad of ['', 'not-an-email', 'a@b', null, undefined]) {
    const r = await newsletter.subscribe(bad, { source: 'test' });
    assert.equal(r.ok, false, `${String(bad)} should not be accepted`);
  }
});

test('the cooldown window is long enough to matter', async () => {
  // A minute would be cosmetic against an automated loop.
  assert.ok(newsletter.CONFIRM_COOLDOWN_MS >= 5 * 60 * 1000,
    'a cooldown under five minutes does not blunt a scripted attack');
});
