// services/testimonialAsk.js — DayHop V2
// The "how did the guide work out?" follow-up. Added 2026-10-20.
//
// Why: /guides and the Richmond Hill sales letter show a reader quote beside
// every buy button (data/testimonials.js), and that list is empty because
// nobody has been asked yet. This asks, once, and asks for consent in the
// same breath so a yes in the reply is the written consent the data file
// requires. Replies go to EMAIL_REPLY_TO (admin@dayhop.quest); turning one
// into a quote is a manual step on purpose (docs/testimonials.md).
//
// Flow:
//   1. fulfillCheckoutSessionOnce (services/billing.js) calls recordPurchase
//      for every PAID guide or bundle purchase. One row per buyer EMAIL, ever:
//      a second purchase by the same person never queues a second ask.
//   2. The 15 min sweep in server.js runs runAskSweep: rows purchased 7+
//      days ago (and under 30, so a late flip of the switch never mails a
//      stale buyer) with no asked_at get ONE email.
//
// COPY STATUS: DRAFT. Nothing sends until Andrew approves the copy AND sets
// TESTIMONIAL_EMAILS=on. Until then purchases are still recorded and the
// sweep stands down, so the backlog is intact when the switch flips.
//
// Idempotency: claim-then-send, same as checkoutRecovery.js
// (UPDATE ... SET asked_at=now() WHERE email=? AND asked_at IS NULL). Only
// the claim winner sends; a crash between claim and send costs one unsent
// ask, never a duplicate.

const dbClient = require('./db/client');
const { sendEmail } = require('./email');

const TABLE = 'testimonial_requests';
const ASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days after purchase
const ASK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // never ask about a purchase older than 30 days
const SWEEP_LIMIT = 10;

function emailsEnabled() {
  return process.env.TESTIMONIAL_EMAILS === 'on';
}

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

// In-memory mirror for the no-Supabase path (rows don't survive a restart).
const memoryRows = new Map(); // email -> row

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return null;
  return email;
}

function guideLabel(slug) {
  try {
    const cityGuides = require('./cityGuides');
    if (slug === cityGuides.BUNDLE.slug) return cityGuides.BUNDLE.title;
    const g = cityGuides.bySlug(slug);
    return g ? g.title : null;
  } catch (e) {
    return null;
  }
}

/**
 * Queue the follow-up for a completed guide checkout session. Never throws.
 * Skips sessions that are not guide purchases, have no email, or were free
 * (a 100% coupon or a founder fulfilment test is not a reader to quote).
 * `purchasedAt` is for tests only.
 */
async function recordPurchase(session, { purchasedAt } = {}) {
  try {
    const slug = session && session.mode === 'payment' && session.metadata && session.metadata.guide;
    if (!slug) return { ok: false, reason: 'not-a-guide' };
    if (session.amount_total === 0) return { ok: false, reason: 'free' };
    const email = normalizeEmail((session.customer_details && session.customer_details.email) || session.customer_email);
    if (!email) return { ok: false, reason: 'no-email' };
    const row = {
      email,
      guide_slug: String(slug).slice(0, 80),
      guide_label: String(guideLabel(slug) || 'DayHop guide').slice(0, 120),
      stripe_session_id: session.id ? String(session.id).slice(0, 120) : null,
      purchased_at: purchasedAt || new Date().toISOString(),
      asked_at: null
    };
    if (!memoryRows.has(email)) memoryRows.set(email, row);
    if (!hasServiceKey()) return { ok: true, stored: 'memory' };
    // email is unique: the first purchase wins and later ones are ignored.
    const { error } = await dbClient.getClient().from(TABLE)
      .upsert(row, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
    return { ok: true, stored: 'db' };
  } catch (err) {
    console.warn('[testimonial-ask] recordPurchase failed (non-fatal):', err.message);
    return { ok: false, reason: err.message };
  }
}

// ---------- the ask ----------
// DRAFT (2026-10-20): unapproved. House voice, no dash punctuation
// (services/copyStyle.js). The consent sentence is the load-bearing part:
// it names exactly what we would publish (first name, last initial, city)
// and makes silence a no.

function askEmail(row) {
  const guide = (row && row.guide_label) || 'DayHop guide';
  const subject = `How did the ${guide} work out?`;
  const text =
`Hi there,

It's been about a week since you picked up the ${guide}, and we'd love to know how it went. Did you get out to any of the spots? Was there a day plan that worked, or one that didn't?

Just hit reply. A line or two is plenty, and the parts that didn't work are the most useful to us.

One more thing, and only if you're comfortable: may we quote your reply on dayhop.quest, credited with your first name, last initial and city (like "Sam T., Markham")? If yes, just say so in your reply. If you don't say yes, your words stay between us.

We outside,
The DayHop team
DayHop · Richmond Hill, Ontario`;
  const html = `<p>Hi there,</p>
<p>It's been about a week since you picked up the <strong>${escapeHtml(guide)}</strong>, and we'd love to know how it went. Did you get out to any of the spots? Was there a day plan that worked, or one that didn't?</p>
<p>Just hit reply. A line or two is plenty, and the parts that didn't work are the most useful to us.</p>
<p>One more thing, and only if you're comfortable: may we quote your reply on dayhop.quest, credited with your first name, last initial and city (like "Sam T., Markham")? If yes, just say so in your reply. If you don't say yes, your words stay between us.</p>
<p>We outside,<br>The DayHop team<br>DayHop · Richmond Hill, Ontario</p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function selectCandidates(now = Date.now()) {
  const dueBefore = new Date(now - ASK_AFTER_MS).toISOString();
  const staleBefore = new Date(now - ASK_MAX_AGE_MS).toISOString();
  if (!hasServiceKey()) {
    return [...memoryRows.values()]
      .filter(r => !r.asked_at && r.purchased_at < dueBefore && r.purchased_at > staleBefore)
      .sort((a, b) => (a.purchased_at < b.purchased_at ? -1 : 1))
      .slice(0, SWEEP_LIMIT);
  }
  try {
    const { data, error } = await dbClient.getClient().from(TABLE)
      .select('*')
      .is('asked_at', null)
      .lt('purchased_at', dueBefore)
      .gt('purchased_at', staleBefore)
      .order('purchased_at', { ascending: true })
      .limit(SWEEP_LIMIT);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[testimonial-ask] candidate select failed:', err.message);
    return [];
  }
}

// Claim-then-send. Returns true only when an email actually went out.
async function claimAndSend(row) {
  const now = new Date().toISOString();
  if (!hasServiceKey()) {
    const mem = memoryRows.get(row.email);
    if (!mem || mem.asked_at) return false;
    mem.asked_at = now;
  } else {
    try {
      const { data, error } = await dbClient.getClient().from(TABLE)
        .update({ asked_at: now })
        .eq('email', row.email)
        .is('asked_at', null)
        .select('email');
      if (error) throw error;
      if (!data || !data.length) return false; // someone else claimed it
    } catch (err) {
      console.warn('[testimonial-ask] claim failed:', err.message);
      return false;
    }
  }
  // One personal follow-up to a buyer about their own purchase, sent once.
  // Transactional in character, so no List-Unsubscribe headers (email.js).
  const result = await sendEmail({ to: row.email, ...askEmail(row) });
  if (result.sent) {
    console.log(`[testimonial-ask] sent to ${row.email} (${row.guide_slug})`);
    try {
      require('./analytics').recordEvent({
        type: 'testimonial_ask_email', ownerKey: 'anon', meta: { guide: row.guide_slug }
      });
    } catch (e) { /* analytics is fail-soft anyway */ }
  } else {
    console.warn(`[testimonial-ask] send failed for ${row.email}:`, result.reason);
  }
  return result.sent;
}

async function runAskSweep() {
  if (!emailsEnabled()) return { ok: true, enabled: false, sent: 0 };
  if (!require('./email').isConfigured()) {
    console.warn('[testimonial-ask] sweep skipped: RESEND_API_KEY not set');
    return { ok: false, reason: 'EMAIL_NOT_CONFIGURED', sent: 0 };
  }
  const candidates = await selectCandidates();
  let sent = 0;
  for (const row of candidates) {
    try {
      if (await claimAndSend(row)) sent++;
    } catch (err) {
      console.warn('[testimonial-ask] candidate failed:', err.message);
    }
  }
  if (candidates.length) console.log(`[testimonial-ask] sweep: ${candidates.length} candidates, ${sent} sent`);
  return { ok: true, enabled: true, candidates: candidates.length, sent };
}

module.exports = { recordPurchase, runAskSweep, selectCandidates, askEmail, emailsEnabled, ASK_AFTER_MS };
