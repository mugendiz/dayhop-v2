// services/newsletter.js — DayHop V2
// Subscriber list + consent flows for the weekly digest. Layered exactly like
// moderation.js:
//   - the in-memory map always works (no DB → subscribers last until restart);
//   - with SUPABASE_SERVICE_KEY, rows persist in public.newsletter_subscribers
//     and re-merge into memory on a throttled sync (merge-only — a wrong key
//     reading zero rows must never erase live subscribers).
//
// Consent model (CASL): double opt-in. subscribe() records a 'pending' row and
// sends ONE confirmation email (transactional — allowed pre-consent as it only
// completes the request the person just made). Nothing else is ever sent until
// they click the link and become 'subscribed'. Unsubscribes are flips, never
// deletes: the row is the suppression record that proves we stopped.

const crypto = require('crypto');
const dbClient = require('./db/client');
const { sendEmail } = require('./email');
const analytics = require('./analytics');

const TABLE = 'newsletter_subscribers';
const subscribers = new Map(); // email -> row
let lastSync = 0;
const SYNC_MS = 60 * 1000;

// Where confirm/unsubscribe links point. Render injects RENDER_EXTERNAL_URL;
// PUBLIC_BASE_URL overrides (e.g. a custom domain), localhost is the dev fallback.
function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  // Pragmatic shape check — the confirmation email is the real validator.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return null;
  return email;
}

async function syncFromDb(force) {
  if (!hasServiceKey()) return;
  if (!force && Date.now() - lastSync < SYNC_MS) return;
  lastSync = Date.now();
  try {
    const { data, error } = await dbClient.getClient()
      .from(TABLE).select('*').limit(50000);
    if (error) throw error;
    for (const row of data || []) subscribers.set(row.email, row);
  } catch (err) {
    console.warn('[newsletter] subscriber sync failed (memory list still active):', err.message);
  }
}

async function persist(row) {
  if (!hasServiceKey()) return;
  try {
    const { error } = await dbClient.getClient()
      .from(TABLE).upsert(row, { onConflict: 'email' });
    if (error) throw error;
  } catch (err) {
    console.warn('[newsletter] persist failed (memory-only until restart):', err.message);
  }
}

function confirmUrl(token) { return `${baseUrl()}/api/newsletter/confirm?token=${token}`; }
function unsubscribeUrl(token) { return `${baseUrl()}/api/newsletter/unsubscribe?token=${token}`; }
function playbookUrl(token) { return `${baseUrl()}/playbook?t=${token}`; }

// CASL identification block — required in every commercial email: who is
// sending, a real mailing address, and a working unsubscribe. Keep it honest.
function complianceFooter(token) {
  return `
  <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e8e2d4;font-size:12px;line-height:1.6;color:#6b7c7e;">
    You're receiving this because you subscribed at dayhop.quest.<br>
    DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:admin@dayhop.quest" style="color:#6b7c7e;">admin@dayhop.quest</a><br>
    <a href="${unsubscribeUrl(token)}" style="color:#6b7c7e;">Unsubscribe</a> — one click, no questions.
  </p>`;
}

function confirmEmailHtml(token) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:22px;font-weight:700;margin:0 0 4px;">DayHop</p>
    <h1 style="font-size:24px;line-height:1.25;margin:18px 0 10px;">One click and the Playbook is yours</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">
      Confirm your email and two things happen: <strong>The GTA Family Weekend
      Playbook</strong> — 70+ outings actually worth your Saturday — arrives in
      your welcome email, and every Thursday you'll get a short, honest brief on
      the best family things happening around the GTA. No spam, ever.
      Unsubscribe any time.
    </p>
    <a href="${confirmUrl(token)}"
       style="display:inline-block;background:#FF6B4A;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:10px;">
      Confirm my subscription</a>
    <p style="font-size:13px;color:#6b7c7e;line-height:1.6;margin:22px 0 0;">
      Didn't sign up? Just ignore this — you won't hear from us again.
    </p>
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e8e2d4;font-size:12px;line-height:1.6;color:#6b7c7e;">
      DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:admin@dayhop.quest" style="color:#6b7c7e;">admin@dayhop.quest</a>
    </p>
  </div></body></html>`;
}

function confirmEmailText(token) {
  return `Confirm your DayHop subscription

Confirm and two things happen: The GTA Family Weekend Playbook (70+ outings actually worth your Saturday) arrives in your welcome email, and every Thursday you get a short, honest brief on the best family things happening around the GTA. No spam, ever.

Confirm here: ${confirmUrl(token)}

Didn't sign up? Ignore this and you won't hear from us again.

DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest`;
}

function welcomeEmailHtml(token, hasPdf = false) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:22px;font-weight:700;margin:0 0 4px;">DayHop</p>
    <h1 style="font-size:24px;line-height:1.25;margin:18px 0 10px;">You're in — here's your Playbook.</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      As promised: <strong>The GTA Family Weekend Playbook</strong> — 70+
      outings actually worth your Saturday, organized by age, budget, and
      rain-proofness. It regenerates from live data, so bookmark it; it only
      gets better.
    </p>
    <p style="margin:0 0 ${hasPdf ? '10px' : '22px'};">
      <a href="${playbookUrl(token)}"
         style="display:inline-block;background:#FF6B4A;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:10px;">
        Open my Playbook</a>
    </p>
    ${hasPdf ? `<p style="font-size:13.5px;line-height:1.5;color:#6b7c7e;margin:0 0 22px;">
      📎 It's also attached as a PDF — save it, print it, or share it with your
      co-parent. The link above always has the freshest version.
    </p>` : ''}
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">
      And every <strong>Thursday morning</strong> — in time to actually plan
      your weekend — you'll get 4-5 things genuinely worth doing with your crew
      around the GTA, a weather call, and a heads-up if anything's closed or
      flooded. That's it. No spam, ever.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">
      Two quick favours so we don't get lost: if this landed in Promotions or
      spam, <strong>drag it to your Primary tab</strong> — and hit reply to
      tell us your kids' ages and your corner of the GTA. A real person reads
      every reply, and it makes your picks sharper.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">
      Ready to go deeper? <a href="${baseUrl()}/" style="color:#E1502F;font-weight:600;">Tell the planner
      what kind of day you want</a> — one sentence in, a whole day out.
    </p>
    ${complianceFooter(token)}
  </div></body></html>`;
}

function welcomeEmailText(token, hasPdf = false) {
  return `You're in — here's your Playbook.

The GTA Family Weekend Playbook (70+ outings actually worth your Saturday, organized by age, budget, and rain-proofness):
${playbookUrl(token)}${hasPdf ? '\n\nIt is also attached as a PDF — save it, print it, share it. The link above always has the freshest version.' : ''}

And every Thursday morning you'll get 4-5 things genuinely worth doing with your crew around the GTA, a weather call, and a heads-up if anything's closed. That's it. No spam, ever.

Two quick favours: if this landed in spam or Promotions, move it to your inbox — and hit reply with your kids' ages and your corner of the GTA. A real person reads every reply.

Can't wait until Thursday? Plan a day now: ${baseUrl()}/

Unsubscribe: ${unsubscribeUrl(token)}
DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest`;
}

/**
 * Sign an email up. Idempotent and enumeration-safe: callers always get
 * { ok:true } for a plausible email; what actually happened rides in `state`
 * for logging only, never for the HTTP response body.
 */
async function subscribe(rawEmail, { source = 'unknown', ownerId = null, ip = null, attrib = null, userAgent = null } = {}) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, state: 'invalid' };

  await syncFromDb(false);
  const existing = subscribers.get(email);
  if (existing && existing.status === 'subscribed') {
    return { ok: true, state: 'already_subscribed' };
  }

  // New signup, still-pending re-request, or an unsubscriber opting back in
  // (a fresh express request — CASL is fine with that; re-confirm anyway).
  // consent_source + consent_ip + timestamps ARE the CASL consent record:
  // the burden of proving consent is on the sender, so where/when/how the
  // opt-in happened must survive in the row.
  const row = {
    email,
    status: 'pending',
    token: (existing && existing.token) || crypto.randomBytes(24).toString('base64url'),
    consent_source: String(source).slice(0, 80),
    consent_ip: ip ? String(ip).slice(0, 60) : (existing && existing.consent_ip) || null,
    owner_id: ownerId ? String(ownerId).slice(0, 80) : (existing && existing.owner_id) || null,
    created_at: (existing && existing.created_at) || new Date().toISOString(),
    confirmed_at: null,
    unsubscribed_at: null,
    last_sent_at: (existing && existing.last_sent_at) || null
  };
  subscribers.set(email, row);
  await persist(row);
  // Attribution rides in the analytics event (the subscribers table is the
  // CASL consent record — campaign data doesn't belong in it).
  const utm = analytics.sanitizeAttrib(attrib);
  analytics.recordEvent({
    type: 'newsletter_subscribe', ownerKey: ownerId || 'anon',
    source: row.consent_source, meta: utm ? { utm } : null
  });
  // Server-side Lead for ad optimization — fires at the subscribe (the
  // in-session action ads can be optimized on), not the later confirm.
  require('./metaPixel').sendEvent('Lead', {
    email, ip, userAgent,
    customData: { content_name: 'newsletter', content_category: row.consent_source }
  });

  const result = await sendEmail({
    to: email,
    subject: 'Confirm your DayHop subscription',
    html: confirmEmailHtml(row.token),
    text: confirmEmailText(row.token)
    // Transactional: no List-Unsubscribe — it completes the user's own request.
  });
  return { ok: true, state: existing ? 'reconfirm_sent' : 'confirm_sent', emailSent: result.sent };
}

async function findByToken(token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  await syncFromDb(true);
  for (const row of subscribers.values()) {
    if (row.token === token) return row;
  }
  return null;
}

async function confirm(token) {
  const row = await findByToken(token);
  if (!row) return { ok: false };
  if (row.status !== 'subscribed') {
    row.status = 'subscribed';
    row.confirmed_at = new Date().toISOString();
    row.unsubscribed_at = null;
    subscribers.set(row.email, row);
    await persist(row);
    analytics.recordEvent({ type: 'newsletter_confirmed', ownerKey: row.owner_id || 'anon' });
    // Custom (non-standard) name on purpose: the Lead already fired at
    // subscribe — this measures double-opt-in completion quality per campaign.
    require('./metaPixel').sendEvent('NewsletterConfirmed', { email: row.email });
    // Welcome email is a marketing send (they're now consented) → carries
    // the one-click unsubscribe headers like every send after it. The
    // Playbook rides along as a PDF (cached build; a build failure just
    // means the email goes out with the link only).
    (async () => {
      const pdf = await require('./playbookPdf').getPlaybookPdf();
      await sendEmail({
        to: row.email,
        subject: 'Welcome to DayHop — your Weekend Playbook is inside',
        html: welcomeEmailHtml(row.token, Boolean(pdf)),
        text: welcomeEmailText(row.token, Boolean(pdf)),
        unsubscribeUrl: unsubscribeUrl(row.token),
        attachments: pdf ? [{ filename: 'DayHop-GTA-Family-Weekend-Playbook.pdf', content: pdf.buffer }] : undefined
      });
    })().catch(() => {});
  }
  return { ok: true, email: row.email };
}

async function unsubscribe(token) {
  const row = await findByToken(token);
  if (!row) return { ok: false };
  if (row.status !== 'unsubscribed') {
    row.status = 'unsubscribed';
    row.unsubscribed_at = new Date().toISOString();
    subscribers.set(row.email, row);
    await persist(row);
    analytics.recordEvent({ type: 'newsletter_unsubscribed', ownerKey: row.owner_id || 'anon' });
  }
  return { ok: true, email: row.email };
}

/** Confirmed recipients for the weekly digest. */
async function listSubscribed() {
  await syncFromDb(true);
  return [...subscribers.values()].filter(r => r.status === 'subscribed');
}

async function markSent(emails) {
  const now = new Date().toISOString();
  for (const email of emails) {
    const row = subscribers.get(email);
    if (!row) continue;
    row.last_sent_at = now;
    subscribers.set(email, row);
    await persist(row);
  }
}

async function stats() {
  await syncFromDb(true);
  const counts = { pending: 0, subscribed: 0, unsubscribed: 0 };
  for (const row of subscribers.values()) counts[row.status] = (counts[row.status] || 0) + 1;
  return {
    counts,
    total: subscribers.size,
    persistent: hasServiceKey(),
    recent: [...subscribers.values()]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 100)
      .map(r => ({
        email: r.email,
        status: r.status,
        source: r.consent_source,
        created_at: r.created_at,
        confirmed_at: r.confirmed_at,
        last_sent_at: r.last_sent_at
      }))
  };
}

/** Row lookup for token-gated surfaces (the Playbook). Null when unknown. */
async function getByToken(token) {
  return findByToken(token);
}

module.exports = { subscribe, confirm, unsubscribe, listSubscribed, markSent, stats, unsubscribeUrl, baseUrl, getByToken };
