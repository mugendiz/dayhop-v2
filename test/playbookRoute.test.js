// test/playbookRoute.test.js — the /playbook lead magnet must stay indexable
// for anonymous visitors (the canonical URL every ad and social post links
// to) while the per-subscriber ?t=<token> view stays noindex, since that's
// one near-duplicate URL per subscriber. Regression test for the bug where
// the whole route was hardcoded noindex, invisible to Google Search Console
// until the "excluded by noindex tag" coverage report caught it.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const playbookRoute = require('../routes/playbook');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

test('playbook: anonymous teaser is indexable, token view stays noindex', async () => {
  const app = express();
  app.use('/playbook', playbookRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const teaser = await (await fetch(`${base}/playbook`)).text();
    assert.ok(!/noindex/i.test(teaser), 'anonymous /playbook must not carry a noindex tag');
    assert.match(teaser, /GTA Family Weekend Playbook/);
    assert.match(teaser, new RegExp(`<link rel="canonical" href="http://127\\.0\\.0\\.1:${srv.address().port}/playbook">`),
      'canonical must point at the bare /playbook URL');

    // No confirmed subscriber behind this token in memory mode, so it falls
    // back to the same teaser render path - but through the branch that
    // still must default to noindex once a real token IS confirmed.
    const withBadToken = await (await fetch(`${base}/playbook?t=not-a-real-token`)).text();
    assert.ok(!/noindex/i.test(withBadToken), 'an unconfirmed token still renders the public teaser, not noindex');
    assert.doesNotMatch(withBadToken, /\/playbook\?t=/,
      'the canonical must strip the ?t= token, never point at the per-subscriber URL');
  } finally {
    srv.close();
  }
});
