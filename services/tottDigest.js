// services/tottDigest.js — DayHop V2
// The "Talk of the town" weekly newsletter: every Monday morning, the live
// outdoor-happenings shelf (services/talkOfTown.js) goes out to the same
// confirmed subscriber list the Thursday weekend brief (services/digest.js)
// uses. Same template shape, same tracking/unsubscribe plumbing — a second
// weekly issue, not a second list.
//
// Retirement is already automatic and per-event, nothing added here:
// talkOfTown.active() only ever returns picks whose date_end hasn't passed
// (services/talkOfTown.js line ~412), so the moment an event is over it drops
// out of the site AND this email in the same request-time check — no
// separate cleanup step, no event lingering until the next weekly refresh.

const talkOfTown = require('./talkOfTown');
const { hubById } = require('../data/tottHubs');
const { sendEmail, isConfigured: emailConfigured } = require('./email');
const newsletter = require('./newsletter');
const analytics = require('./analytics');
const digestLinks = require('./digestLinks');

const TORONTO_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
const HUB_ID = 'toronto'; // GTA-only for v1, same scope as the Thursday brief

// ---------- content ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function trim(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)) + '…';
}
function fmtDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtDateRange(start, end) {
  if (!isYmd(start)) return '';
  if (!isYmd(end) || end === start) return fmtDate(start);
  return `${fmtDate(start)} to ${fmtDate(end)}`;
}
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

async function buildTottDigest() {
  const hub = hubById(HUB_ID);
  // No maxKm on purpose. The live feeds cap at FEED_MAX_KM (80) because a
  // Saturday-morning scroll wants somewhere to go today; the Monday
  // newsletter goes out with a week's notice, so the full reach of the store
  // (HUB_REACH_KM, 180) is exactly what earns the open. Do not "fix" this to
  // match the feeds — the difference is the point.
  const picks = talkOfTown.active({ point: { lat: hub.lat, lng: hub.lng }, limit: talkOfTown.SHELF_SIZE });
  if (!picks.length) throw new Error('talk-of-town digest has no live picks — refusing to send an empty email');
  const subject = `Talk of the town: ${trim(picks[0].title, 55)}${picks.length > 1 ? ` + ${picks.length - 1} more this week` : ''}`;
  return { subject, picks, hubName: hub.name };
}

// ---------- templates ----------
function digestHtml(d, token, tracking) {
  const base = newsletter.baseUrl();
  const unsub = newsletter.unsubscribeUrl(token);
  const wrap = (url, idx) => tracking
    ? digestLinks.clickUrl(base, { issue: tracking.issue, sid: tracking.sid, url, idx })
    : url;
  const picksHtml = d.picks.map((p, i) => {
    const link = wrap(p.booking_url || p.maps_url || base, i);
    // venue/location are frequently the identical string for a single-venue
    // pick — never repeat it (public/app.js's detail panel hit this same bug).
    const where = [p.venue, p.location && p.location !== p.venue ? p.location : null].filter(Boolean).join(' · ');
    const dateCost = [fmtDateRange(p.date, p.date_end), p.cost_tier].filter(Boolean).join(' · ');
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ffffff;border:1px solid #e8e2d4;border-radius:0 14px 14px 0;padding:18px 20px;">
        <p style="margin:0 0 2px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#3F6F5C;font-weight:600;">${i === 0 ? '🔥 Most talked about' : `#${i + 1} this week`}</p>
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;line-height:1.3;"><a href="${esc(link)}" style="color:#102A2E;text-decoration:none;">${esc(p.title)}</a></p>
        ${where ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7c7e;">${esc(where)}</p>` : ''}
        ${dateCost ? `<p style="margin:0 0 8px;font-size:12.5px;color:#6b7c7e;">${esc(dateCost)}</p>` : ''}
        ${p.description ? `<p style="margin:0 0 10px;font-size:14.5px;line-height:1.55;color:#2C4A4E;">${esc(trim(p.description, 190))}</p>` : ''}
        <p style="margin:0;font-size:13px;"><a href="${esc(link)}" style="color:#E1502F;font-weight:600;text-decoration:none;">${p.booking_url ? 'Details →' : 'See it on the map →'}</a></p>
      </td></tr>
    </table>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px 36px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:21px;font-weight:700;margin:0;">DayHop</p>
    <p style="margin:2px 0 0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#3F6F5C;font-weight:600;">Talk of the town · ${esc(d.hubName)}</p>
    <h1 style="font-size:25px;line-height:1.25;margin:16px 0 8px;">What everyone's going to this week.</h1>
    <p style="font-size:15.5px;line-height:1.6;margin:0 0 20px;color:#2C4A4E;">
      ${d.picks.length} verified outdoor happenings people around ${esc(d.hubName)} are actually talking about right now. Festivals, fairs, markets, the works.
    </p>
    ${picksHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 0;">
      <a href="${esc(wrap(`${base}/`))}" style="display:inline-block;background:#FF6B4A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15.5px;padding:13px 28px;border-radius:10px;">
        See the full shelf on DayHop</a>
      <p style="margin:10px 0 0;font-size:13px;color:#6b7c7e;">Once an event's over, it drops off automatically. This list is always this week's.</p>
    </td></tr></table>
    <p style="margin:30px 0 0;padding-top:16px;border-top:1px solid #e8e2d4;font-size:12px;line-height:1.6;color:#6b7c7e;">
      You're receiving this because you subscribed at dayhop.quest.<br>
      DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:admin@dayhop.quest" style="color:#6b7c7e;">admin@dayhop.quest</a><br>
      <a href="${unsub}" style="color:#6b7c7e;">Unsubscribe</a>. One click, no questions.
    </p>
    ${tracking ? `<img src="${esc(digestLinks.openPixelUrl(base, tracking))}" width="1" height="1" alt="" style="display:block;border:0;">` : ''}
  </div></body></html>`;
}

function digestText(d, token) {
  const base = newsletter.baseUrl();
  const lines = [`DAYHOP: TALK OF THE TOWN (${d.hubName})`, ''];
  d.picks.forEach((p, i) => {
    const where = [p.venue, p.location && p.location !== p.venue ? p.location : null].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. ${p.title}${where ? `, ${where}` : ''}`);
    const dateCost = [fmtDateRange(p.date, p.date_end), p.cost_tier].filter(Boolean).join(' · ');
    if (dateCost) lines.push(`   ${dateCost}`);
    if (p.description) lines.push(`   ${trim(p.description, 160)}`);
    lines.push(`   ${p.booking_url || p.maps_url || base}`);
    lines.push('');
  });
  lines.push(`See the full shelf: ${base}/`);
  lines.push('');
  lines.push(`Unsubscribe: ${newsletter.unsubscribeUrl(token)}`);
  lines.push('DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest');
  return lines.join('\n');
}

// ---------- sending ----------
const SEND_GAP_MS = 600; // Resend free tier: 2 req/sec
const sleep = ms => new Promise(r => setTimeout(r, ms));

let lastRun = null;

async function sendTottDigest({ testTo = null } = {}) {
  if (!emailConfigured()) return { sent: 0, skipped: 'EMAIL_NOT_CONFIGURED' };
  const digest = await buildTottDigest();

  let recipients;
  if (testTo) {
    recipients = [{ email: testTo, token: 'test-send' }];
  } else {
    recipients = await newsletter.listSubscribed();
    if (!recipients.length) return { sent: 0, skipped: 'NO_SUBSCRIBERS', subject: digest.subject };
  }

  // Prefixed so this issue never collides with the Thursday brief's plain-date
  // issue id in the digest_opened/digest_clicked analytics rollup.
  const issue = `tott-${TORONTO_DAY_FMT.format(new Date())}`;

  let sent = 0;
  const delivered = [];
  for (const r of recipients) {
    const tracking = { issue, sid: digestLinks.subscriberId(r.email) };
    const result = await sendEmail({
      to: r.email,
      subject: digest.subject,
      html: digestHtml(digest, r.token, tracking),
      text: digestText(digest, r.token),
      unsubscribeUrl: newsletter.unsubscribeUrl(r.token)
    });
    if (result.sent) { sent++; delivered.push(r.email); }
    if (recipients.length > 1) await sleep(SEND_GAP_MS);
  }

  if (!testTo && delivered.length) {
    await newsletter.markSent(delivered);
    analytics.recordEvent({ type: 'digest_sent', ownerKey: 'system', meta: { issue, recipients: recipients.length, sent, subject: digest.subject } });
  }
  lastRun = { at: new Date().toISOString(), test: Boolean(testTo), recipients: recipients.length, sent, subject: digest.subject };
  console.log(`[tott-digest] ${testTo ? 'test ' : ''}send complete: ${sent}/${recipients.length} delivered — "${digest.subject}"`);
  return lastRun;
}

/** Admin preview: the rendered HTML without sending anything. */
async function previewTottDigest() {
  const digest = await buildTottDigest();
  return { subject: digest.subject, html: digestHtml(digest, 'preview-token'), picks: digest.picks.length };
}

function tottDigestStatus() {
  return { last_run: lastRun };
}

module.exports = { buildTottDigest, sendTottDigest, previewTottDigest, tottDigestStatus };
// Exported for the house-style test (test/copyStyle.test.js) — pure
// template functions over a plain data object, no network.
module.exports.digestHtml = digestHtml;
module.exports.digestText = digestText;
