// services/personalGuideFulfill.js — DayHop V2
// After payment: build the buyer's guide in the background, store it, email
// it, and hand out signed download links.
//
// Two paths start a build, like every guide sale (services/billing.js): the
// Stripe webhook and the thank-you page. Both are safe to repeat. A build
// that a restart killed is noticed by the thank-you page's status poll (a
// "building" row older than STALE_MS) and simply started again, so the free
// Render plan sleeping mid-build can delay a guide but never lose one.

const crypto = require('crypto');
const store = require('./personalGuideStore');
const { buildGuideData, findPlace, PRICE_CENTS } = require('./personalGuide');
const { renderPersonalGuidePdf } = require('./personalGuidePdf');

const TOKEN_DAYS = 365;             // a keepsake: a year of re-downloads
const STALE_MS = 20 * 60 * 1000;    // a build this old with no result died
const running = new Map();          // sid -> Promise (this process)
const pdfCache = new Map();         // sid -> Buffer (small LRU)

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const secret = () => require('./cityGuides').signingSecret();

function signToken(sid, days = TOKEN_DAYS) {
  const payload = `pg.${sid}.${Date.now() + days * 86400000}`;
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest();
  return `${b64url(payload)}.${b64url(mac)}`;
}

function verifyToken(token) {
  try {
    const [p, m] = String(token || '').split('.');
    if (!p || !m) return null;
    const payload = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const [kind, sid, expStr] = payload.split('.');
    if (kind !== 'pg' || !/^cs_[A-Za-z0-9_]+$/.test(sid || '') || !(Number(expStr) > Date.now())) return null;
    const mac = crypto.createHmac('sha256', secret()).update(payload).digest();
    const given = Buffer.from(m.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return given.length === mac.length && crypto.timingSafeEqual(given, mac) ? sid : null;
  } catch (e) {
    return null;
  }
}

// The order as checkout recorded it. Dates are not re-checked against
// today: a rebuild after the trip has started must still work.
function orderFromSession(session) {
  const md = session.metadata || {};
  const place = findPlace(md.city);
  if (!place || !/^\d{4}-\d{2}-\d{2}$/.test(md.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(md.end || '')) return null;
  return { city: place.name, region: place.region, start: md.start, end: md.end, name: md.name || null, notes: md.notes || null };
}

// The reverse: what checkout writes on the Stripe session. guide:'personal'
// routes fulfillment (services/billing.js) and books the sale as a guide.
function metadataFor(order) {
  return Object.assign(
    { guide: 'personal', city: order.city, start: order.start, end: order.end },
    order.name ? { name: order.name } : {},
    order.notes ? { notes: order.notes.slice(0, 480) } : {}
  );
}

// Who is travelling, for Grok's brief: their own words when they gave them.
function partyOf(order) {
  // Printed in headings ("Chosen for Noor, Sam and Leila"), so a name, not
  // a description; Grok reads the travellers' own words from order.notes.
  return order.name || 'your crew';
}

function buyerEmail(session) {
  return (session.customer_details && session.customer_details.email) || session.customer_email || null;
}

async function renderPdf(sid) {
  if (pdfCache.has(sid)) return pdfCache.get(sid);
  const guide = await store.getGuide(sid);
  if (!guide) return null;
  const buf = await renderPersonalGuidePdf(guide);
  pdfCache.set(sid, buf);
  if (pdfCache.size > 20) pdfCache.delete(pdfCache.keys().next().value);
  return buf;
}

function fileName(guide) {
  return `DayHop-${guide.order.city.replace(/[^A-Za-z0-9]+/g, '-')}-${guide.order.start}-trip-guide.pdf`;
}

async function sendGuideEmail(session, guide) {
  const to = buyerEmail(session);
  if (!to) return 'no email on session';
  const origin = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_ORIGIN || 'https://dayhop.quest';
  const link = `${origin}/api/personal-guides/download?t=${signToken(session.id)}`;
  const pdf = await renderPdf(session.id).catch(() => null);
  const city = guide.order.city;
  const result = await require('./email').sendEmail({
    to,
    subject: `Your ${city} trip guide is ready`,
    html:
      `<p>Your guide to ${city} is attached, made for your dates.</p>` +
      `<p>It is yours to re-download for a year: <a href="${link}">download your guide</a>.</p>` +
      '<p>Every name in it links to live directions. Check hours and bookings before you set out, and write in the journal pages at the back.</p>' +
      '<p>If it did not help your trip, reply within 14 days and we will refund it.</p>' +
      '<p>DayHop, Richmond Hill, Ontario</p>',
    text:
      `Your guide to ${city} is attached, made for your dates.\n\nRe-download for a year: ${link}\n\n` +
      'If it did not help your trip, reply within 14 days and we will refund it.\nDayHop',
    attachments: pdf ? [{ filename: fileName(guide), content: pdf }] : undefined
  });
  return result.sent ? `emailed ${to}` : `email FAILED: ${result.reason}`;
}

async function runBuild(session, { resend = false } = {}) {
  const sid = session.id;
  const order = orderFromSession(session);
  if (!order) {
    await store.setStatus(sid, { state: 'failed', error: 'order details missing from checkout' });
    return 'failed: order details missing';
  }
  // Carry "already emailed" through the building state, so a build retried
  // after a restart never sends the buyer a second email.
  const prior = await store.getStatus(sid).catch(() => null);
  const alreadyEmailed = prior && prior.emailed && !/FAILED|error/.test(prior.emailed) ? prior.emailed : null;
  await store.setStatus(sid, Object.assign({ state: 'building' }, alreadyEmailed ? { emailed: alreadyEmailed } : {}));
  try {
    const guide = await buildGuideData(order);
    // Grok as author (PERSONAL_GUIDE_AUTHOR=grok): writes the letter, the
    // must-sees and the week-by-week plan for these travellers from the
    // listings, checked by services/grokGuide.js. A Grok failure falls back
    // to the code-built edition; the buyer still gets a guide.
    if (process.env.PERSONAL_GUIDE_AUTHOR === 'grok') {
      try {
        const { authorWithGrok } = require('./grokGuide');
        const r = await authorWithGrok(guide, partyOf(order));
        guide.grok = r.grok;
        guide.grokChecks = { dropped: r.dropped }; // audit: what the checks refused
        console.log(`[personal-guide] ${sid} written by Grok; ${r.dropped.length} items dropped by checks`);
      } catch (err) {
        console.warn(`[personal-guide] ${sid} Grok author failed, code-built edition instead:`, err.message);
      }
    }
    // Real, credited photos of the places (services/placePhotos.js).
    try { guide.photos = await require('./placePhotos').attachPhotos(guide); }
    catch (err) { console.warn(`[personal-guide] ${sid} photos unavailable:`, err.message); }
    await store.saveGuide(sid, guide);
    pdfCache.delete(sid); // a rebuild must not serve the old render
    const emailed = alreadyEmailed && !resend ? alreadyEmailed : await sendGuideEmail(session, guide).catch(err => `email error: ${err.message}`);
    await store.setStatus(sid, { state: 'ready', emailed });
    console.log(`[personal-guide] ${sid} ready (${order.city}, ${order.start} to ${order.end}); ${emailed}`);
    return `personal guide ready; ${emailed}`;
  } catch (err) {
    console.error(`[personal-guide] build failed for ${sid}:`, err.message);
    await store.setStatus(sid, { state: 'failed', error: err.message.slice(0, 200) }).catch(() => {});
    return `personal guide build failed: ${err.message}`;
  }
}

/**
 * Start (or join) the build for a paid session. Returns immediately with the
 * current state; the build itself runs in the background.
 */
async function ensureBuild(session) {
  const sid = session.id;
  if (running.has(sid)) return { state: 'building' };
  const status = await store.getStatus(sid).catch(() => null);
  if (status && status.state === 'ready') return status;
  if (status && status.state === 'building' && Date.now() - Date.parse(status.at) < STALE_MS) return status;
  const p = runBuild(session).finally(() => running.delete(sid));
  running.set(sid, p);
  return { state: 'building' };
}

// billing.fulfillCheckoutSession → here for metadata.guide === 'personal'.
async function fulfill(session) {
  const paid = Number.isFinite(session.amount_total) ? session.amount_total : PRICE_CENTS;
  require('./analytics').recordEvent({
    type: 'guide_purchase',
    ownerKey: session.client_reference_id || 'anon',
    meta: { guide: 'personal', city: (session.metadata || {}).city, amount_cents: paid, currency: session.currency || 'cad', ...(paid === 0 ? { free: true } : {}) }
  });
  const s = await ensureBuild(session);
  return `personal guide ${s.state} for ${(session.metadata || {}).city || '?'}`;
}

module.exports = { fulfill, ensureBuild, runBuild, renderPdf, signToken, verifyToken, orderFromSession, metadataFor, partyOf, fileName, STALE_MS };
