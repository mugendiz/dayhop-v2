// test/checkoutFulfillOnce.test.js — the guide gets delivered exactly once.
//
// Fulfillment has two doors since 2026-09-13: the Stripe webhook, and the
// thank-you page calling /api/cityguides/fulfill when Stripe redirects the
// buyer back. The webhook alone was not safe — this service runs on Render's
// free plan and sleeps, and a webhook aimed at a sleeping instance fails at
// the connection level (Stripe reported exactly that on 2026-09-10).
//
// Two doors means two ways to send the same customer the same email. The
// guard is a dedupe on the SESSION id shared by both paths; the webhook's own
// event-id dedupe does not help here, because the page has no event id.
//
// Sessions below carry an unknown guide slug on purpose: fulfillPurchase
// returns before composing any mail, so these tests exercise the dedupe and
// never touch the email provider.
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_dedupe';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_offline_dummy';
process.env.STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_test_dummy';

const test = require('node:test');
const assert = require('node:assert');
const Stripe = require('stripe');
const billing = require('../services/billing');

const stripe = new Stripe('sk_test_offline_dummy');

function guideSession(id) {
  return {
    id,
    object: 'checkout.session',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 500,
    client_reference_id: null,
    customer_email: null,
    customer_details: null,
    metadata: { guide: 'not-a-real-guide-slug' }
  };
}

function webhookFor(session, eventId) {
  const event = {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session }
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });
  return [payload, header];
}

test('the thank-you page fulfills a checkout the webhook never delivered', async () => {
  const session = guideSession('cs_test_page_first');
  const outcome = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
  assert.doesNotMatch(outcome, /already fulfilled/);
});

test('a webhook arriving after the page does not send a second email', async () => {
  const session = guideSession('cs_test_page_then_webhook');
  const first = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
  assert.doesNotMatch(first, /already fulfilled/);
  // Stripe wakes the instance minutes later and delivers the event. Same
  // purchase, different door — it must not fulfill again.
  const second = await billing.handleWebhook(...webhookFor(session, 'evt_test_late_webhook'));
  assert.match(second, /cs_test_page_then_webhook already fulfilled \(webhook skipped\)/);
});

test('a page reload after the webhook does not send a second email', async () => {
  const session = guideSession('cs_test_webhook_then_page');
  const first = await billing.handleWebhook(...webhookFor(session, 'evt_test_prompt_webhook'));
  assert.doesNotMatch(first, /already fulfilled/);
  // The buyer refreshes the thank-you page, or opens it twice.
  const second = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
  assert.match(second, /cs_test_webhook_then_page already fulfilled \(thanks-page skipped\)/);
});

test('the page path is idempotent on its own', async () => {
  const session = guideSession('cs_test_page_twice');
  await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
  const again = await billing.fulfillCheckoutSessionOnce(session, 'thanks-page');
  assert.match(again, /already fulfilled/);
});

test('two different purchases are both fulfilled', async () => {
  // The dedupe keys on the session id, so it must not collapse distinct sales
  // — a shared key here would silently drop a paying customer's guide.
  const a = await billing.fulfillCheckoutSessionOnce(guideSession('cs_test_buyer_a'), 'thanks-page');
  const b = await billing.fulfillCheckoutSessionOnce(guideSession('cs_test_buyer_b'), 'thanks-page');
  assert.doesNotMatch(a, /already fulfilled/);
  assert.doesNotMatch(b, /already fulfilled/);
});
