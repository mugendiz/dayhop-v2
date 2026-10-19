// services/checkoutRecovery.js — DayHop V2
// Abandoned-checkout recovery. Added 2026-10-19.
//
// The leak: guests went straight to Stripe and bounced before typing an
// email there. 20 of 23 historical checkout sessions have no customer email,
// which made recovery impossible. The fix has two halves:
//   1. Email-first checkout: routes collect the buyer's email on dayhop.quest
//      BEFORE minting the Stripe session, and every attempt is recorded here.
//   2. This sweep: every 15 min (server.js), find attempts older than 60
//      minutes with no completed_at and no recovered_at, and send ONE
//      recovery email. completed_at is stamped by fulfillCheckoutSessionOnce
//      (services/billing.js) on BOTH the webhook and thanks-page paths, so
//      a buyer who paid never gets nudged.
//
// COPY STATUS: DRAFT. The templates below are unapproved. Nothing sends until
// Andrew approves the copy AND sets RECOVERY_EMAILS=on. Until then the sweep
// runs, selects candidates, and stands down (rows stay unrecovered, so the
// backlog is intact when the switch flips).
//
// Idempotency: the sweep CLAIMS a row first
// (UPDATE ... SET recovered_at=now() WHERE id=? AND recovered_at IS NULL).
// Only the claim winner sends. A crash between claim and send costs at most
// one unsent email, never a duplicate. completed_at is re-checked after the
// claim, and the Stripe session is re-verified before sending, so a payer
// who completed between select and send is skipped.

const dbClient = require('./db/client');
const { sendEmail } = require('./email');

const TABLE = 'checkout_attempts';
const RECOVERY_AFTER_MS = 60 * 60 * 1000;   // 60 minutes
const RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // never chase carts older than 7 days
const SWEEP_LIMIT = 10;

function emailsEnabled() {
  return process.env.RECOVERY_EMAILS === 'on';
}

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

// In-memory mirror for the no-Supabase path (same fail-soft layering as
// newsletter.js: the feature works, rows just don't survive a restart).
const memoryAttempts = new Map(); // stripeSessionId -> row

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return null;
  return email;
}

async function recordAttempt({ email, productType, productLabel, guideSlug, stripeSessionId }) {
  const clean = normalizeEmail(email);
  if (!clean || !stripeSessionId) return { ok: false, reason: 'bad-input' };
  const row = {
    email: clean,
    product_type: productType === 'pro' ? 'pro' : 'guide',
    product_label: String(productLabel || '').slice(0, 120),
    guide_slug: guideSlug ? String(guideSlug).slice(0, 80) : null,
    stripe_session_id: String(stripeSessionId).slice(0, 120),
    created_at: new Date().toISOString(),
    recovered_at: null,
    completed_at: null
  };
  memoryAttempts.set(row.stripe_session_id, row);
  if (!hasServiceKey()) return { ok: true, stored: 'memory' };
  try {
    const { error } = await dbClient.getClient().from(TABLE).insert(row);
    if (error) throw error;
    return { ok: true, stored: 'db' };
  } catch (err) {
    console.warn('[recovery] recordAttempt failed (memory row kept):', err.message);
    return { ok: true, stored: 'memory' };
  }
}

async function markCompleted(stripeSessionId) {
  if (!stripeSessionId) return;
  const now = new Date().toISOString();
  const mem = memoryAttempts.get(stripeSessionId);
  if (mem) mem.completed_at = mem.completed_at || now;
  if (!hasServiceKey()) return;
  try {
    const { error } = await dbClient.getClient().from(TABLE)
      .update({ completed_at: now })
      .eq('stripe_session_id', stripeSessionId)
      .is('completed_at', null);
    if (error) throw error;
  } catch (err) {
    console.warn('[recovery] markCompleted failed (non-fatal):', err.message);
  }
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    return new (require('stripe'))(key);
  } catch (err) {
    console.warn('[recovery] stripe init failed:', err.message);
    return null;
  }
}

// ---------- recovery email copy ----------
// DRAFT (2026-10-19): unapproved. Voice: "We outside" — warm, direct,
// plain-spoken. House rule: NO em-dashes (reads as an AI tell). Headlines
// carry the weight, specifics over adjectives, a reason-why for every claim.

function guideEmail(attempt) {
  const guide = attempt.product_label || 'DayHop guide';
  const subject = `Your ${guide} is still here`;
  const text =
`Hi there,

You started grabbing the ${guide} and didn't finish checking out. No pressure from us.

Here's the honest pitch: every trail in it was walked, every playground tested, and the "is this actually stroller-friendly?" questions are answered before you load the car. One PDF replaces the 47 open tabs. It lands in your inbox, updated editions are free whenever we re-walk a route, and the 14-day make-it-right guarantee means if it doesn't earn its place in your plans, you don't pay for it.

Get the guide: https://dayhop.quest/guides

We outside,
The DayHop team
DayHop · Richmond Hill, Ontario`;
  const html = `<p>Hi there,</p>
<p>You started grabbing the <strong>${escapeHtml(guide)}</strong> and didn't finish checking out. No pressure from us.</p>
<p>Here's the honest pitch: every trail in it was walked, every playground tested, and the "is this actually stroller-friendly?" questions are answered before you load the car. One PDF replaces the 47 open tabs. It lands in your inbox, updated editions are free whenever we re-walk a route, and the 14-day make-it-right guarantee means if it doesn't earn its place in your plans, you don't pay for it.</p>
<p><a href="https://dayhop.quest/guides">Get the guide</a></p>
<p>We outside,<br>The DayHop team<br>DayHop · Richmond Hill, Ontario</p>`;
  return { subject, text, html };
}

function proEmail() {
  const subject = 'Your DayHop Pro trial is one click away';
  const text =
`Hi there,

You started a DayHop Pro trial and didn't finish. The trial is 7 days free, and it spans a full weekend on purpose. That's when the product proves itself.

Pro unlocks 2 to 3 day trips and saved plans. No charge until the trial ends, cancel anytime.

Start the trial: https://dayhop.quest/

We outside,
The DayHop team
DayHop · Richmond Hill, Ontario`;
  const html = `<p>Hi there,</p>
<p>You started a DayHop Pro trial and didn't finish. The trial is 7 days free, and it spans a full weekend on purpose. That's when the product proves itself.</p>
<p>Pro unlocks 2 to 3 day trips and saved plans. No charge until the trial ends, cancel anytime.</p>
<p><a href="https://dayhop.quest/">Start the trial</a></p>
<p>We outside,<br>The DayHop team<br>DayHop · Richmond Hill, Ontario</p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function selectCandidates() {
  const now = Date.now();
  const minCreated = new Date(now - RECOVERY_AFTER_MS).toISOString();
  const maxCreated = new Date(now - RECOVERY_MAX_AGE_MS).toISOString();
  if (!hasServiceKey()) {
    return [...memoryAttempts.values()]
      .filter(r => !r.completed_at && !r.recovered_at && r.created_at < minCreated && r.created_at > maxCreated)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, SWEEP_LIMIT);
  }
  try {
    const { data, error } = await dbClient.getClient().from(TABLE)
      .select('*')
      .is('completed_at', null)
      .is('recovered_at', null)
      .lt('created_at', minCreated)
      .gt('created_at', maxCreated)
      .order('created_at', { ascending: false })
      .limit(SWEEP_LIMIT);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[recovery] candidate select failed:', err.message);
    return [];
  }
}

// Claim-then-send: only the claim winner sends. Returns true when an email
// was actually sent.
async function claimAndSend(attempt) {
  const now = new Date().toISOString();
  if (!hasServiceKey()) {
    const mem = memoryAttempts.get(attempt.stripe_session_id);
    if (!mem || mem.recovered_at || mem.completed_at) return false;
    mem.recovered_at = now; // claim
  } else {
    try {
      const { data, error } = await dbClient.getClient().from(TABLE)
        .update({ recovered_at: now })
        .eq('stripe_session_id', attempt.stripe_session_id)
        .is('recovered_at', null)
        .select('id, completed_at');
      if (error) throw error;
      if (!data || !data.length) return false; // someone else claimed it
      if (data[0].completed_at) return false; // completed between select and claim
    } catch (err) {
      console.warn('[recovery] claim failed:', err.message);
      return false;
    }
  }

  // Final guard: re-verify the Stripe session itself. A buyer who paid in
  // the seconds between our select and this check must never get nudged.
  const stripe = getStripe();
  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
      const settled = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
      if (settled) {
        await markCompleted(attempt.stripe_session_id);
        return false;
      }
    } catch (err) {
      // Fail closed: if we cannot verify, skip this round and retry next
      // sweep (15 min). Never email a possible payer on a guess.
      console.warn('[recovery] stripe verify failed, skipping this round:', err.message);
      return false;
    }
  }

  const copy = attempt.product_type === 'pro' ? proEmail() : guideEmail(attempt);
  // One recovery email per abandoned checkout, ever. Transactional in
  // character (it continues a purchase the recipient started), so no
  // List-Unsubscribe headers — matching email.js's contract.
  const result = await sendEmail({ to: attempt.email, ...copy });
  if (result.sent) {
    console.log(`[recovery] sent to ${attempt.email} (${attempt.product_type}, ${attempt.stripe_session_id})`);
    try {
      require('./analytics').recordEvent({
        type: 'checkout_recovered_email', ownerKey: 'anon',
        meta: { product_type: attempt.product_type, guide: attempt.guide_slug || undefined }
      });
    } catch (e) { /* analytics is fail-soft anyway */ }
  } else {
    console.warn(`[recovery] send failed for ${attempt.email}:`, result.reason);
  }
  return result.sent;
}

async function runRecoverySweep() {
  if (!emailsEnabled()) return { ok: true, enabled: false, sent: 0 };
  if (!require('./email').isConfigured()) {
    console.warn('[recovery] sweep skipped: RESEND_API_KEY not set');
    return { ok: false, reason: 'EMAIL_NOT_CONFIGURED', sent: 0 };
  }
  const candidates = await selectCandidates();
  let sent = 0;
  for (const attempt of candidates) {
    try {
      if (await claimAndSend(attempt)) sent++;
    } catch (err) {
      console.warn('[recovery] candidate failed:', err.message);
    }
  }
  if (candidates.length) console.log(`[recovery] sweep: ${candidates.length} candidates, ${sent} sent`);
  return { ok: true, enabled: true, candidates: candidates.length, sent };
}

module.exports = { recordAttempt, markCompleted, runRecoverySweep, normalizeEmail, guideEmail, proEmail };
