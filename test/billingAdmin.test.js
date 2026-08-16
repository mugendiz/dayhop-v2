// test/billingAdmin.test.js — the premium-members panel math. Trial-day
// counting, conversion classification, cancel states, and Monday-anchored
// launch-cohort weeks, computed from synthetic Stripe subscription objects.
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSubscription } = require('../services/billing');

const DAY = 24 * 3600; // seconds — Stripe timestamps are unix seconds
const NOW_MS = Date.parse('2026-08-16T12:00:00Z');
const NOW_S = Math.floor(NOW_MS / 1000);

const stripeSub = over => Object.assign({
  id: 'sub_test',
  status: 'trialing',
  created: NOW_S - 2 * DAY,
  start_date: NOW_S - 2 * DAY,
  trial_start: NOW_S - 2 * DAY,
  trial_end: NOW_S + 5 * DAY,
  cancel_at_period_end: false,
  canceled_at: null,
  ended_at: null,
  current_period_end: NOW_S + 5 * DAY,
  customer: { email: 'member@example.com' },
  items: { data: [{ price: { unit_amount: 500, currency: 'cad', recurring: { interval: 'month' } } }] },
  metadata: { utm_source: 'zeely', utm_campaign: 'playbook-aug' }
}, over);

test('a mid-trial member reads as day 3 of 7', () => {
  const m = summarizeSubscription(stripeSub(), 'owner-1', NOW_MS);
  assert.equal(m.in_trial, true);
  assert.equal(m.trial_day, 3); // started 2 days ago → in day 3
  assert.equal(m.trial_days, 7);
  assert.equal(m.status, 'trialing');
  assert.equal(m.email, 'member@example.com');
  assert.equal(m.amount, 5);
  assert.equal(m.utm_campaign, 'playbook-aug');
  assert.equal(m.converted, false); // trial not finished yet
});

test('trial day caps at the trial length even if the clock runs past', () => {
  const m = summarizeSubscription(stripeSub({
    trial_start: NOW_S - 9 * DAY, trial_end: NOW_S - 2 * DAY, status: 'trialing'
  }), null, NOW_MS);
  assert.equal(m.trial_day, 7);
});

test('a paid member whose trial finished counts as converted', () => {
  const m = summarizeSubscription(stripeSub({
    status: 'active',
    trial_start: NOW_S - 10 * DAY, trial_end: NOW_S - 3 * DAY
  }), 'owner-2', NOW_MS);
  assert.equal(m.in_trial, false);
  assert.equal(m.trial_day, null);
  assert.equal(m.trial_completed, true);
  assert.equal(m.converted, true);
});

test('a canceled member is not converted, keeps end date', () => {
  const m = summarizeSubscription(stripeSub({
    status: 'canceled',
    trial_start: NOW_S - 10 * DAY, trial_end: NOW_S - 3 * DAY,
    canceled_at: NOW_S - 5 * DAY, ended_at: NOW_S - 3 * DAY,
    cancel_at_period_end: true
  }), null, NOW_MS);
  assert.equal(m.converted, false);
  assert.equal(m.ended_at, new Date((NOW_S - 3 * DAY) * 1000).toISOString());
});

test('pending cancel is flagged while still active', () => {
  const m = summarizeSubscription(stripeSub({ status: 'active', cancel_at_period_end: true }), null, NOW_MS);
  assert.equal(m.status, 'active');
  assert.equal(m.cancel_at_period_end, true);
});

test('cohort week is Monday-anchored', () => {
  // 2026-08-14 is a Friday → its cohort week starts Monday 2026-08-10.
  const friday = Math.floor(Date.parse('2026-08-14T15:00:00Z') / 1000);
  const m = summarizeSubscription(stripeSub({ created: friday, start_date: friday }), null, NOW_MS);
  assert.equal(m.cohort_week, '2026-08-10');
});

test('a subscription with no trial reports had_trial false', () => {
  const m = summarizeSubscription(stripeSub({
    status: 'active', trial_start: null, trial_end: null
  }), null, NOW_MS);
  assert.equal(m.had_trial, false);
  assert.equal(m.trial_completed, false);
  assert.equal(m.converted, false); // no trial to convert from
});
