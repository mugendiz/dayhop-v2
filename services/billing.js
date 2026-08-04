// services/billing.js — DayHop V2 (Phase 4)
// Stripe Pro-tier subscriptions with the app's fail-soft pattern:
//   - No STRIPE_SECRET_KEY/STRIPE_PRICE_ID → isConfigured() false, billing
//     routes answer 503, nothing crashes, the free tier just isn't limited.
//   - Subscription state is written ONLY by the Stripe webhook. It persists
//     to public.subscriptions when SUPABASE_SERVICE_KEY is present (the table
//     has no client write policy on purpose); otherwise an in-memory map
//     keeps the demo flow working for the process lifetime.

const dbClient = require('./db/client');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = new Stripe(STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function isConfigured() {
  return Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID);
}

function status() {
  return {
    configured: isConfigured(),
    webhook_secret: Boolean(STRIPE_WEBHOOK_SECRET),
    persistent: dbClient.status().service_key === true
  };
}

// ---------- subscription state ----------
const memorySubs = new Map(); // ownerId -> row

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

async function getSubscription(ownerId) {
  if (!ownerId) return null;
  if (hasServiceKey()) {
    try {
      const { data, error } = await dbClient.getClient()
        .from('subscriptions').select('*').eq('owner_id', ownerId).maybeSingle();
      if (error) throw error;
      if (data) return data;
    } catch (err) {
      console.warn('[billing] getSubscription failed, using memory:', err.message);
    }
  }
  return memorySubs.get(ownerId) || null;
}

async function upsertSubscription(row) {
  const record = Object.assign({ updated_at: new Date().toISOString() }, row);
  memorySubs.set(record.owner_id, Object.assign(memorySubs.get(record.owner_id) || {}, record));
  isProCache.delete(record.owner_id); // webhook-driven change → next isPro re-reads
  if (hasServiceKey()) {
    try {
      const { error } = await dbClient.getClient()
        .from('subscriptions').upsert(record, { onConflict: 'owner_id' });
      if (error) throw error;
    } catch (err) {
      // Pre-migration databases lack cancel_at_period_end — retry without it
      // so the core row still persists (the flag survives in memory and is
      // re-derived from Stripe webhooks after a restart).
      if ('cancel_at_period_end' in record && /cancel_at_period_end/i.test(err.message || '')) {
        try {
          const slim = Object.assign({}, record);
          delete slim.cancel_at_period_end;
          const { error } = await dbClient.getClient()
            .from('subscriptions').upsert(slim, { onConflict: 'owner_id' });
          if (error) throw error;
          console.warn('[billing] persisted without cancel_at_period_end — run the schema migration to keep it across restarts.');
          return record;
        } catch (err2) {
          console.warn('[billing] upsertSubscription persist failed (kept in memory):', err2.message);
          return record;
        }
      }
      console.warn('[billing] upsertSubscription persist failed (kept in memory):', err.message);
    }
  }
  return record;
}

// Webhook updates arrive keyed by Stripe subscription id, not owner.
async function findOwnerBySubscriptionId(subscriptionId) {
  for (const [ownerId, row] of memorySubs) {
    if (row.stripe_subscription_id === subscriptionId) return ownerId;
  }
  if (hasServiceKey()) {
    try {
      const { data, error } = await dbClient.getClient()
        .from('subscriptions').select('owner_id').eq('stripe_subscription_id', subscriptionId).maybeSingle();
      if (error) throw error;
      if (data) return data.owner_id;
    } catch (err) {
      console.warn('[billing] findOwnerBySubscriptionId failed:', err.message);
    }
  }
  return null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// 60s per-owner cache: subscription state only changes via Stripe webhooks
// (which invalidate through upsertSubscription below), yet isPro gated every
// generate/replan with a fresh Supabase read.
const isProCache = new Map(); // ownerId -> { at, value }
const IS_PRO_TTL_MS = 60 * 1000;
const IS_PRO_CACHE_MAX = 500;

async function isPro(ownerId) {
  const hit = isProCache.get(ownerId);
  if (hit && Date.now() - hit.at < IS_PRO_TTL_MS) return hit.value;
  const sub = await getSubscription(ownerId);
  const value = Boolean(sub && ACTIVE_STATUSES.has(sub.status));
  if (isProCache.size >= IS_PRO_CACHE_MAX) isProCache.delete(isProCache.keys().next().value);
  isProCache.set(ownerId, { at: Date.now(), value });
  return value;
}

// Price display info for the upgrade UI ({ amount, currency, interval }).
// Cached after the first successful lookup; failures are re-tried at most
// every 5 minutes so a Stripe hiccup can't hammer the API from /status.
let _priceCache = null; // { value, at }
const PRICE_RETRY_MS = 5 * 60 * 1000;

async function getPriceInfo() {
  if (!isConfigured()) return null;
  if (_priceCache && (_priceCache.value || Date.now() - _priceCache.at < PRICE_RETRY_MS)) {
    return _priceCache.value;
  }
  try {
    const price = await getStripe().prices.retrieve(STRIPE_PRICE_ID);
    _priceCache = {
      at: Date.now(),
      value: {
        amount: price.unit_amount != null ? price.unit_amount / 100 : null,
        currency: (price.currency || 'cad').toUpperCase(),
        interval: (price.recurring && price.recurring.interval) || 'month'
      }
    };
  } catch (err) {
    console.warn('[billing] price lookup failed:', err.message);
    _priceCache = { at: Date.now(), value: null };
  }
  return _priceCache.value;
}

// ---------- Stripe operations ----------

async function createCheckoutSession({ ownerId, email, origin }) {
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: ownerId,
    customer_email: email || undefined,
    allow_promotion_codes: true,
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`
  });
  return { id: session.id, url: session.url };
}

/**
 * Cancel (or un-cancel) at period end — the hassle-free path: no proration
 * puzzles, no immediate loss. Pro stays active until the paid-for period
 * ends, and flipping `cancel` back re-activates renewal in one call.
 * Stripe's response is the source of truth; the local row mirrors it.
 */
async function setCancelAtPeriodEnd(ownerId, cancel) {
  const sub = await getSubscription(ownerId);
  if (!sub || !sub.stripe_subscription_id) {
    const err = new Error('No subscription on file for this account.');
    err.code = 'NO_SUBSCRIPTION';
    throw err;
  }
  const updated = await getStripe().subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: Boolean(cancel)
  });
  return upsertSubscription({
    owner_id: ownerId,
    stripe_subscription_id: updated.id,
    stripe_customer_id: typeof updated.customer === 'string' ? updated.customer : sub.stripe_customer_id || null,
    status: updated.status,
    cancel_at_period_end: Boolean(updated.cancel_at_period_end),
    current_period_end: updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : sub.current_period_end || null
  });
}

/**
 * Verify + handle a webhook. `rawBody` must be the unparsed request body.
 * Returns a short string describing what was handled (for logs).
 */
async function handleWebhook(rawBody, signature) {
  if (!STRIPE_WEBHOOK_SECRET) {
    const err = new Error('STRIPE_WEBHOOK_SECRET is not set — refusing unverified webhooks.');
    err.code = 'WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  const event = getStripe().webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const ownerId = session.client_reference_id;
      if (!ownerId) return 'checkout completed with no client_reference_id (ignored)';
      await upsertSubscription({
        owner_id: ownerId,
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
        status: 'active',
        current_period_end: null
      });
      return `activated pro for ${ownerId}`;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const ownerId = await findOwnerBySubscriptionId(sub.id);
      if (!ownerId) return `subscription ${sub.id} has no known owner (ignored)`;
      await upsertSubscription({
        owner_id: ownerId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
        status: event.type.endsWith('deleted') ? 'canceled' : sub.status,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null
      });
      return `subscription ${sub.id} → ${sub.status}${sub.cancel_at_period_end ? ' (cancels at period end)' : ''}`;
    }
    default:
      return `ignored ${event.type}`;
  }
}

module.exports = { isConfigured, status, isPro, getSubscription, getPriceInfo, createCheckoutSession, setCancelAtPeriodEnd, handleWebhook };
