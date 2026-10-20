// test/testimonialAsk.test.js — the "how did the guide work out?" follow-up
// (services/testimonialAsk.js). It must stay off until switched on, ask each
// buyer once, wait the full week, and ask for consent in plain words.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.TESTIMONIAL_EMAILS;
const ask = require('../services/testimonialAsk');

const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();
const session = (email, extra = {}) => Object.assign({
  id: `cs_test_${email}`, mode: 'payment', metadata: { guide: 'richmond-hill' },
  amount_total: 2000, customer_details: { email }
}, extra);

test('testimonial ask: off by default, the sweep sends nothing', async () => {
  assert.equal(ask.emailsEnabled(), false);
  const out = await ask.runAskSweep();
  assert.deepEqual(out, { ok: true, enabled: false, sent: 0 });
});

test('testimonial ask: only paid guide purchases with an email are queued', async () => {
  assert.equal((await ask.recordPurchase(session('free@example.com', { amount_total: 0 }))).reason, 'free');
  assert.equal((await ask.recordPurchase(session('pro@example.com', { mode: 'subscription', metadata: {} }))).reason, 'not-a-guide');
  assert.equal((await ask.recordPurchase(session(null, { customer_details: {} }))).reason, 'no-email');
  assert.equal((await ask.recordPurchase(session('Buyer@Example.com'))).ok, true);
});

test('testimonial ask: waits 7 days, skips stale purchases, once per buyer', async () => {
  await ask.recordPurchase(session('fresh@example.com'), { purchasedAt: ago(3) });
  await ask.recordPurchase(session('due@example.com'), { purchasedAt: ago(8) });
  await ask.recordPurchase(session('due@example.com', { metadata: { guide: 'markham' } }), { purchasedAt: ago(9) });
  await ask.recordPurchase(session('stale@example.com'), { purchasedAt: ago(45) });

  const emails = (await ask.selectCandidates()).map(r => r.email);
  assert.deepEqual(emails, ['due@example.com']);
  const due = (await ask.selectCandidates())[0];
  assert.equal(due.guide_slug, 'richmond-hill', 'the first purchase wins; a second never queues a second ask');
});

test('testimonial ask: the email names the guide and asks for consent in plain words', () => {
  const { subject, text, html } = ask.askEmail({ guide_label: 'Richmond Hill Nature Guide' });
  assert.match(subject, /Richmond Hill Nature Guide/);
  for (const body of [text, html]) {
    assert.match(body, /first name, last initial and city/);
    assert.match(body, /If you don't say yes, your words stay between us/);
    assert.match(body, /hit reply/i);
  }
});
