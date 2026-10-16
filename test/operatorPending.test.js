// test/operatorPending.test.js: the held items section of the Monday operator
// report. Parked decisions must stay in the brief until someone removes them.
const test = require('node:test');
const assert = require('node:assert');
const { pendingLines, deadlineLines, PENDING } = require('../services/operatorReport');

test('pending items never drop off with time, unlike deadlines', () => {
  const farFuture = new Date('2030-01-01T12:00:00Z');
  assert.strictEqual(deadlineLines(farFuture).length, 0);
  assert.strictEqual(pendingLines(farFuture).length, PENDING.length);
});

test('pending lines say how long each item has been held and whether it costs money', () => {
  const lines = pendingLines(new Date('2026-10-13T12:00:00Z'));
  assert.ok(lines.filter(l => l.startsWith('  [')).length === PENDING.length);
  const money = lines.filter(l => l.includes('[COSTS MONEY]'));
  assert.strictEqual(money.length, PENDING.filter(p => p.money).length);
  assert.ok(money.length >= 1);
  assert.ok(lines.some(l => l.includes('#40')));
});

test('held days never go negative', () => {
  const lines = pendingLines(new Date('2026-10-01T12:00:00Z'));
  assert.ok(lines.every(l => /\(held 0d\)/.test(l)));
});
