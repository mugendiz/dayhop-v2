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

// ---------- webhook replay dedupe ----------
// Signature verification proves the payload came from Stripe — it does NOT
// prove we haven't seen it before. Stripe retries on non-2xx, and a replayed
// checkout.session.completed re-sends guide PDFs / re-activates a sub. Track
// processed event ids: in-memory always (covers retries within a process
// lifetime), plus public.stripe_webhook_events when Supabase is configured
// (covers replays across restarts). Fail-open on DB trouble — a dedupe-store
// hiccup must not make us drop real events.
const seenEvents = new Set();
const SEEN_EVENTS_CAP = 2000;
function rememberEvent(id) {
  seenEvents.add(id);
  if (seenEvents.size > SEEN_EVENTS_CAP) {
    // Sets iterate in insertion order — drop the oldest half.
    let drop = seenEvents.size - SEEN_EVENTS_CAP / 2;
    for (const v of seenEvents) { if (drop-- <= 0) break; seenEvents.delete(v); }
  }
}

async function wasProcessed(eventId) {
  if (seenEvents.has(eventId)) return true;
  if (!hasServiceKey()) return false;
  try {
    const { data, error } = await dbClient.getClient()
      .from('stripe_webhook_events').select('event_id').eq('event_id', eventId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch (err) {
    console.warn('[billing] event dedupe lookup failed (processing anyway):', err.message);
    return false;
  }
}

async function markProcessed(eventId, eventType) {
  rememberEvent(eventId);
  if (!hasServiceKey()) return;
  try {
    const { error } = await dbClient.getClient()
      .from('stripe_webhook_events')
      .insert({ event_id: eventId, event_type: eventType });
    if (error && error.code !== '23505') throw error; // unique violation = fine
  } catch (err) {
    console.warn('[billing] event dedupe record failed (non-fatal):', err.message);
  }
}

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
    // Which Stripe mode the deployed key is in — "sandbox checkout on the
    // live site" is invisible from outside without this.
    livemode: Boolean(STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_live_')),
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

// ---------- admin: premium members panel ----------
// Stripe is the source of truth for subscription lifecycle (trial dates,
// cancel state, end reasons); the subscriptions table only maps a Stripe
// subscription back to an app owner. One list call, merged, cached 60s.

const DAY_MS = 24 * 3600 * 1000;

// Pure per-subscription summary — exported for tests. `sub` is a Stripe
// subscription object (customer expanded or not).
function summarizeSubscription(sub, ownerId, nowMs = Date.now()) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price;
  const customer = typeof sub.customer === 'object' && sub.customer !== null ? sub.customer : null;
  const trialStart = sub.trial_start ? sub.trial_start * 1000 : null;
  const trialEnd = sub.trial_end ? sub.trial_end * 1000 : null;
  const startedMs = (sub.start_date || sub.created) * 1000;

  // Trial stage: day N of the trial window (1-based), only meaningful while
  // Stripe says `trialing`. A completed trial keeps its dates for the
  // conversion math below.
  const trialDays = trialStart && trialEnd ? Math.round((trialEnd - trialStart) / DAY_MS) : null;
  const inTrial = sub.status === 'trialing';
  const trialDay = inTrial && trialStart
    ? Math.min(trialDays || 1, Math.floor((nowMs - trialStart) / DAY_MS) + 1)
    : null;
  const hadTrial = Boolean(trialStart && trialEnd);
  const trialCompleted = hadTrial && nowMs >= trialEnd;

  // Monday-anchored start week — the "launch cohort" a member belongs to.
  const d = new Date(startedMs);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const cohortWeek = d.toISOString().slice(0, 10);

  return {
    owner_id: ownerId || null,
    email: (customer && (customer.email || (customer.deleted ? null : customer.name))) || sub.customer_email || null,
    status: sub.status, // trialing | active | past_due | canceled | incomplete | unpaid
    started_at: new Date(startedMs).toISOString(),
    cohort_week: cohortWeek,
    in_trial: inTrial,
    trial_day: trialDay,
    trial_days: trialDays,
    trial_ends_at: trialEnd ? new Date(trialEnd).toISOString() : null,
    had_trial: hadTrial,
    trial_completed: trialCompleted,
    // Converted = finished the trial and is still paying (past_due counts:
    // the card failed, the intent to pay didn't).
    converted: trialCompleted && (sub.status === 'active' || sub.status === 'past_due'),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    ended_at: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    amount: price && price.unit_amount != null ? price.unit_amount / 100 : null,
    currency: price && price.currency ? price.currency.toUpperCase() : null,
    interval: (price && price.recurring && price.recurring.interval) || 'month',
    utm_campaign: (sub.metadata && sub.metadata.utm_campaign) || null,
    utm_source: (sub.metadata && sub.metadata.utm_source) || null
  };
}

let _adminSubsCache = null; // { at, value }
const ADMIN_SUBS_TTL_MS = 60 * 1000;

async function adminSubscriptions() {
  if (!isConfigured()) return { configured: false, members: [], summary: null, cohorts: [] };
  if (_adminSubsCache && Date.now() - _adminSubsCache.at < ADMIN_SUBS_TTL_MS) {
    return _adminSubsCache.value;
  }

  // Owner mapping from the app's table (webhook-written).
  const ownerBySub = new Map();
  if (hasServiceKey()) {
    try {
      const { data } = await dbClient.getClient()
        .from('subscriptions').select('owner_id, stripe_subscription_id').limit(1000);
      for (const row of data || []) {
        if (row.stripe_subscription_id) ownerBySub.set(row.stripe_subscription_id, row.owner_id);
      }
    } catch (err) {
      console.warn('[billing] admin owner mapping failed:', err.message);
    }
  }

  const subs = await getStripe().subscriptions.list({
    status: 'all', limit: 100, expand: ['data.customer']
  });
  const now = Date.now();
  const members = subs.data
    .map(s => summarizeSubscription(s, ownerBySub.get(s.id), now))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  const isOn = m => m.status === 'active' || m.status === 'trialing' || m.status === 'past_due';
  const activePaying = members.filter(m => m.status === 'active');
  const trialsDone = members.filter(m => m.trial_completed);
  const summary = {
    total: members.length,
    active_paying: activePaying.length,
    in_trial: members.filter(m => m.in_trial).length,
    past_due: members.filter(m => m.status === 'past_due').length,
    pending_cancel: members.filter(m => isOn(m) && m.cancel_at_period_end).length,
    churned: members.filter(m => m.status === 'canceled' || m.status === 'unpaid').length,
    new_last_7d: members.filter(m => now - Date.parse(m.started_at) <= 7 * DAY_MS).length,
    trials_completed: trialsDone.length,
    trial_conversion_pct: trialsDone.length
      ? Math.round((trialsDone.filter(m => m.converted).length / trialsDone.length) * 100)
      : null,
    // MRR from what active members actually pay (yearly prices prorated).
    mrr: Math.round(activePaying.reduce((sum, m) =>
      sum + (m.amount || 0) / (m.interval === 'year' ? 12 : 1), 0) * 100) / 100,
    currency: (activePaying[0] && activePaying[0].currency) || (members[0] && members[0].currency) || 'CAD'
  };

  // Launch cohorts: start week → how that week's signups are doing now.
  const cohortMap = new Map();
  for (const m of members) {
    if (!cohortMap.has(m.cohort_week)) {
      cohortMap.set(m.cohort_week, { week: m.cohort_week, started: 0, in_trial: 0, active: 0, churned: 0 });
    }
    const c = cohortMap.get(m.cohort_week);
    c.started++;
    if (m.in_trial) c.in_trial++;
    if (m.status === 'active') c.active++;
    if (m.status === 'canceled' || m.status === 'unpaid') c.churned++;
  }
  const cohorts = [...cohortMap.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 12);

  const value = { configured: true, members, summary, cohorts, generated_at: new Date().toISOString() };
  _adminSubsCache = { at: Date.now(), value };
  return value;
}

// ---------- Stripe operations ----------

// Card up front, 7 days free. Seven (not three) so every trial spans at
// least one full weekend — the product proves itself on Saturdays. The
// `trialing` status is already treated as Pro everywhere status is checked,
// and Stripe emails the customer before the first charge.
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);

async function createCheckoutSession({ ownerId, email, origin, attrib }) {
  // Campaign attribution lands in Stripe metadata (session AND subscription):
  // the answer to "which ad produced this paying customer" then lives where
  // the money is — visible in the Stripe dashboard per customer, forever.
  const metadata = attrib && Object.keys(attrib).length ? attrib : undefined;
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: ownerId,
    customer_email: email || undefined,
    allow_promotion_codes: true,
    metadata,
    subscription_data: TRIAL_DAYS > 0 || metadata
      ? {
          ...(TRIAL_DAYS > 0 ? { trial_period_days: TRIAL_DAYS } : {}),
          ...(metadata ? { metadata } : {})
        }
      : undefined,
    // The session id rides in the return URL so the thank-you page can
    // reconcile directly (see routes/billing.js POST /fulfill) instead of
    // waiting on a webhook that may never arrive — see fulfillCheckoutSession's
    // comment below for why that's a real risk here, not a hypothetical one.
    success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?billing=cancelled`
  });
  return { id: session.id, url: session.url };
}

/** Fetch a Checkout Session by id — the thank-you-page fallback's only use
 * of Stripe directly (routes/billing.js POST /fulfill). */
async function retrieveCheckoutSession(sessionId) {
  return getStripe().checkout.sessions.retrieve(sessionId);
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

  // Check-then-process-then-record: recording only after success means a
  // crash mid-fulfillment lets Stripe's retry actually retry (the tiny
  // concurrent-duplicate window is additionally covered by the idempotent
  // ledger upserts and subscription upserts downstream).
  if (await wasProcessed(event.id)) {
    return `duplicate ${event.type} skipped (${event.id})`;
  }
  const outcome = await dispatchWebhookEvent(event);
  await markProcessed(event.id, event.type);
  return outcome;
}

// Fulfillment for one completed checkout, at most once, whichever path
// reaches it first.
//
// Two paths do now. The webhook is one. The other is the thank-you page,
// which calls this directly after Stripe redirects the buyer back — because
// the webhook is not reliable enough to be the only way a paid guide OR a
// Pro subscription gets activated (routes/cityGuides.js POST /fulfill and
// routes/billing.js POST /fulfill respectively — both funnel through here).
// This service runs on Render's free plan, which spins down after
// roughly 15 minutes idle, and a cold start takes longer than Stripe's
// delivery timeout, so a webhook aimed at a sleeping instance fails at the
// connection level. That is what Stripe reported on 2026-09-10: "2 requests
// had other errors" — a connection failure, not a status code. With zero
// completed checkouts it cost nothing. On the first real sale it would have
// meant a customer paying and getting no PDF until a retry happened to catch
// the instance awake.
//
// The dedupe key is the SESSION id, not the event id, so the two paths block
// each other. The event-id guard in handleWebhook only stops Stripe
// redelivering the same event; it would not have stopped a second email.
//
// Check-then-process-then-record, matching handleWebhook's choice above: a
// crash mid-fulfillment leaves the session unclaimed so a retry can still
// deliver it. The cost is that a genuinely simultaneous webhook and page load
// could both send. That window is milliseconds, the two paths are normally
// seconds to minutes apart, and a duplicate email is a much better failure
// than a paying customer with no guide.
async function fulfillCheckoutSessionOnce(session, source) {
  const key = `cs:${session.id}`;
  if (await wasProcessed(key)) {
    return `checkout ${session.id} already fulfilled (${source} skipped)`;
  }
  const outcome = await fulfillCheckoutSession(session);
  // Abandoned-checkout recovery (2026-10-19): stamp completed_at so the
  // 60-minute sweep never nudges a buyer who paid. Runs on BOTH the webhook
  // and thanks-page paths (both funnel through here). Fail-soft — a missed
  // stamp just means the sweep's Stripe re-verification skips the send.
  try {
    await require('./checkoutRecovery').markCompleted(session.id);
  } catch (err) {
    console.warn('[billing] recovery markCompleted failed (non-fatal):', err.message);
  }
  await markProcessed(key, `checkout.session.completed:${source}`);
  return outcome;
}

async function fulfillCheckoutSession(session) {
  // One-time purchases (city guide PDFs) share this event with Pro
  // signups — branch BEFORE the subscription path, or a $20 guide would
  // activate a Pro membership. The ledger entry rides invoice.paid.
  if (session.mode === 'payment' && session.metadata && session.metadata.guide === 'personal') {
    // Personalized trip guide: built in the background after payment.
    return require('./personalGuideFulfill').fulfill(session);
  }
  if (session.mode === 'payment' && session.metadata && session.metadata.guide) {
    return require('./cityGuides').fulfillPurchase(session);
  }
  const ownerId = session.client_reference_id;
  if (!ownerId) return 'checkout completed with no client_reference_id (ignored)';
  await upsertSubscription({
    owner_id: ownerId,
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    status: 'active',
    current_period_end: null
  });
  // The conversion ads ultimately optimize toward. Trial checkouts have
  // amount_total 0 — report the subscription's real monthly value so
  // Meta's value optimization isn't fed zeros. Fail-soft: no email or no
  // META_* config → silent no-op.
  const price = await getPriceInfo().catch(() => null);
  require('./metaPixel').sendEvent('StartTrial', {
    email: (session.customer_details && session.customer_details.email) || session.customer_email,
    customData: {
      currency: (price && price.currency) || 'CAD',
      value: (price && price.amount) || 0,
      ...(session.metadata && session.metadata.utm_campaign
        ? { content_name: session.metadata.utm_campaign } : {})
    }
  });
  return `activated pro for ${ownerId}`;
}

async function dispatchWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return fulfillCheckoutSessionOnce(event.data.object, 'webhook');
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
    // ---- accounting ledger (2026-08-20) ----
    // Real money movements land in ledger_entries. Fail-soft throughout:
    // recordStripeEntries never throws (a DB hiccup must not make Stripe
    // retry forever), and the backfill endpoint re-syncs any gap. These
    // event types must also be ENABLED on the webhook endpoint in the
    // Stripe dashboard, or nothing arrives here.
    case 'invoice.paid': {
      const invoice = event.data.object;
      const accounting = require('./accounting');
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : (invoice.customer && invoice.customer.id) || null;
      // Guide-sale invoices carry metadata.guide (set at checkout) — book
      // them as other_income; customer-set categorization is for recurring
      // sponsor/member relationships, which one-time buyers aren't.
      const category = invoice.metadata && invoice.metadata.guide
        ? 'other_income'
        : await accounting.categorizeCustomer(customerId).catch(() => 'uncategorized');
      const row = accounting.ledgerEntryFromInvoice(invoice, category, 'stripe_webhook');
      if (!row) return `invoice ${invoice.id} zero-amount (ignored)`;
      // Stripe's processing fee: best-effort, one extra API call, never blocks.
      if (invoice.charge) {
        try {
          const charge = await getStripe().charges.retrieve(
            typeof invoice.charge === 'string' ? invoice.charge : invoice.charge.id,
            { expand: ['balance_transaction'] }
          );
          if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
            row.fee_cents = charge.balance_transaction.fee;
          }
        } catch (err) {
          console.warn('[billing] fee lookup failed (ledger row kept):', err.message);
        }
      }
      await accounting.recordStripeEntries([row]);
      return `ledger: invoice ${invoice.id} +${row.amount_cents}¢ (${category})`;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const accounting = require('./accounting');
      const customerId = typeof charge.customer === 'string' ? charge.customer : null;
      const category = await accounting.categorizeCustomer(customerId).catch(() => 'uncategorized');
      const rows = accounting.ledgerEntriesFromRefundedCharge(charge, category, 'stripe_webhook');
      if (!rows.length) return `charge ${charge.id} refunded with no refund rows (ignored)`;
      await accounting.recordStripeEntries(rows);
      return `ledger: ${rows.length} refund entr${rows.length === 1 ? 'y' : 'ies'} for ${charge.id}`;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      return `invoice payment failed for ${invoice.customer_email || invoice.customer} (logged only)`;
    }
    default:
      return `ignored ${event.type}`;
  }
}

module.exports = { isConfigured, getStripe, status, isPro, getSubscription, getPriceInfo, createCheckoutSession, retrieveCheckoutSession, setCancelAtPeriodEnd, handleWebhook, fulfillCheckoutSessionOnce, adminSubscriptions, summarizeSubscription };
