// test/billingFulfillRoute.test.js — POST /api/billing/fulfill, the Pro
// subscription checkout's thank-you-page fallback (added alongside the
// session id now riding on success_url — see services/billing.js's
// createCheckoutSession and fulfillCheckoutSession comments for why the
// webhook alone isn't reliable on Render's free tier). Mirrors the guide
// flow's existing /api/cityguides/fulfill exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_offline_dummy';
process.env.STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_test_dummy';

const billing = require('../services/billing');
const billingRoute = require('../routes/billing');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

test('billing fulfill: rejects a malformed session id', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const res = await fetch(`${base}/api/billing/fulfill`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'not-a-stripe-id' })
    });
    assert.equal(res.status, 400);
  } finally {
    srv.close();
  }
});

test('billing fulfill: refuses an unsettled checkout', async () => {
  const orig = billing.retrieveCheckoutSession;
  billing.retrieveCheckoutSession = async () => ({ id: 'cs_test_open', payment_status: 'unpaid' });
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const res = await fetch(`${base}/api/billing/fulfill`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'cs_test_open' })
    });
    assert.equal(res.status, 402);
  } finally {
    srv.close();
    billing.retrieveCheckoutSession = orig;
  }
});

test('billing fulfill: activates a settled trial checkout (no_payment_required)', async () => {
  const origRetrieve = billing.retrieveCheckoutSession;
  const origFulfill = billing.fulfillCheckoutSessionOnce;
  let fulfilledWith = null;
  billing.retrieveCheckoutSession = async (sid) => ({
    id: sid, mode: 'subscription', payment_status: 'no_payment_required',
    client_reference_id: 'owner-123', customer: 'cus_test', subscription: 'sub_test'
  });
  billing.fulfillCheckoutSessionOnce = async (session, source) => {
    fulfilledWith = { session, source };
    return `activated pro for ${session.client_reference_id}`;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const res = await fetch(`${base}/api/billing/fulfill`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'cs_test_trial' })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.fulfilled, true);
    assert.equal(fulfilledWith.source, 'thanks-page');
    assert.equal(fulfilledWith.session.client_reference_id, 'owner-123');
  } finally {
    srv.close();
    billing.retrieveCheckoutSession = origRetrieve;
    billing.fulfillCheckoutSessionOnce = origFulfill;
  }
});
