// services/digest.js — DayHop V2
// The weekly "This weekend in the GTA" email. Content comes from the exact
// pipeline that powers the product (gatherCandidates: curated catalog +
// auto-discovered finds + live event feeds + weather + advisories), scoped to
// the coming weekend — so the email is never stale marketing copy, it IS the
// product, delivered. One template, mobile-first, single column, inline
// styles (email clients strip <style> unpredictably), multipart text+HTML.
//
// Advisory trust contract carries over from the app: if advisory data is
// unavailable we say NOTHING about conditions — never an implied all-clear.

const { gatherCandidates, parseDateWindow } = require('./candidates');
const { sendEmail, isConfigured: emailConfigured } = require('./email');
const newsletter = require('./newsletter');
const analytics = require('./analytics');
const digestLinks = require('./digestLinks');

const PICK_COUNT = 5;

// ---------- weekend math (Toronto) ----------
const TORONTO_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD
const TORONTO_WEEKDAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short' });

function upcomingWeekend() {
  // Next Saturday+Sunday (if today IS the weekend, this weekend).
  const now = new Date();
  const weekday = TORONTO_WEEKDAY_FMT.format(now); // 'Sat', 'Sun', ...
  const offsets = { Mon: 5, Tue: 4, Wed: 3, Thu: 2, Fri: 1, Sat: 0, Sun: -1 };
  const toSat = offsets[weekday] ?? 0;
  const sat = new Date(now.getTime() + toSat * 86400000);
  const sun = new Date(sat.getTime() + 86400000);
  return { start: TORONTO_DAY_FMT.format(sat), end: TORONTO_DAY_FMT.format(sun) };
}

function fmtWeekendLabel({ start }) {
  const [y, m, d] = start.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ---------- content selection ----------
function trim(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)) + '…';
}

function pickIdeas(candidates) {
  const seen = new Set();
  const unique = [];
  for (const c of candidates || []) {
    const key = String(c.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    if (!c.description) continue;
    seen.add(key);
    unique.push(c);
  }
  // Dated events (they expire — the digest is their moment) first, then
  // wow-flagged evergreen picks, then the rest in relevance order.
  const dated = unique.filter(c => c.date || c.datetime);
  const wow = unique.filter(c => !c.date && !c.datetime && c.wow);
  const rest = unique.filter(c => !c.date && !c.datetime && !c.wow);
  return [...dated, ...wow, ...rest].slice(0, PICK_COUNT);
}

async function buildDigest() {
  const window = upcomingWeekend();
  const dateWindow = parseDateWindow(window.start, window.end);
  const { candidates, weather, advisories, advisoriesStatus, resolvedCity } = await gatherCandidates(
    'A fantastic family weekend: standout events, new openings, and places genuinely worth the drive',
    'Toronto', '', null, null, undefined, dateWindow
  );
  const picks = pickIdeas(candidates);
  if (!picks.length) throw new Error('digest has no picks — refusing to send an empty email');

  const weekendLabel = fmtWeekendLabel(window);
  const lead = picks[0];
  const subject = `This weekend: ${trim(lead.title, 55)} + ${picks.length - 1} more GTA picks`;
  return { subject, picks, weather, advisories, advisoriesStatus, city: resolvedCity || 'the GTA', weekendLabel, window };
}

// ---------- templates ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function weatherLine(weather) {
  if (!weather) return null;
  let call = 'It looks fine for being out and about.';
  if (weather.is_rainy) call = 'Lean on the indoor picks below.';
  else if (weather.is_extreme_heat) call = 'Plan shade, water, and early starts.';
  else if (weather.is_extreme_cold) call = 'Short outdoor stints only today.';
  return `${weather.description}, around ${weather.temp_c}°C. ${call}`;
}

function digestHtml(d, token, tracking) {
  const base = newsletter.baseUrl();
  const unsub = newsletter.unsubscribeUrl(token);
  // First-party click/open tracking (services/digestLinks.js). `tracking`
  // is { issue, sid } per recipient; absent (previews) → bare links.
  const wrap = (url, idx) => tracking
    ? digestLinks.clickUrl(base, { issue: tracking.issue, sid: tracking.sid, url, idx })
    : url;
  const picksHtml = d.picks.map((p, i) => {
    const link = wrap(p.booking_url || p.maps_url || base, i);
    const where = p.venue || p.location || '';
    const chips = [p.cost_tier, p.good_for_ages && `ages ${p.good_for_ages}`].filter(Boolean).join(' · ');
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#ffffff;border:1px solid #e8e2d4;border-radius:0 14px 14px 0;padding:18px 20px;">
        <p style="margin:0 0 2px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#3F6F5C;font-weight:600;">${i === 0 ? '★ Top pick' : esc(p.category || 'worth a look')}</p>
        <p style="margin:0 0 6px;font-size:18px;font-weight:700;line-height:1.3;"><a href="${esc(link)}" style="color:#102A2E;text-decoration:none;">${esc(p.title)}</a></p>
        ${where ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7c7e;">${esc(where)}</p>` : ''}
        <p style="margin:0 0 10px;font-size:14.5px;line-height:1.55;color:#2C4A4E;">${esc(trim(p.description, 190))}</p>
        <p style="margin:0;font-size:13px;">
          <a href="${esc(link)}" style="color:#E1502F;font-weight:600;text-decoration:none;">${p.booking_url ? 'Details & tickets →' : 'See it on the map →'}</a>
          ${chips ? `<span style="color:#6b7c7e;">&nbsp; ${esc(chips)}</span>` : ''}
        </p>
      </td></tr>
    </table>`;
  }).join('');

  const weather = weatherLine(d.weather);
  const advisoriesHtml = (d.advisories && d.advisories.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#FFF4E5;border:1px solid #f0ddb8;border-radius:10px;padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#8a5a00;">Heads-up before you head out</p>
        ${d.advisories.slice(0, 3).map(a => `<p style="margin:0 0 4px;font-size:13.5px;line-height:1.5;color:#5c4a1e;">• ${esc(a.title || a.summary || a)}</p>`).join('')}
      </td></tr>
    </table>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px 36px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:21px;font-weight:700;margin:0;">DayHop</p>
    <p style="margin:2px 0 0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#3F6F5C;font-weight:600;">The weekend brief · ${esc(d.weekendLabel)}</p>
    <h1 style="font-size:25px;line-height:1.25;margin:16px 0 8px;">Your weekend, sorted.</h1>
    <p style="font-size:15.5px;line-height:1.6;margin:0 0 20px;color:#2C4A4E;">
      ${d.picks.length} things around ${esc(d.city)} actually worth your Saturday.${weather ? ` ${esc(weather)}` : ''}
    </p>
    ${advisoriesHtml}
    ${picksHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 0;">
      <a href="${esc(wrap(`${base}/`))}" style="display:inline-block;background:#FF6B4A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15.5px;padding:13px 28px;border-radius:10px;">
        Turn one into a full day plan</a>
      <p style="margin:10px 0 0;font-size:13px;color:#6b7c7e;">One sentence in, a whole day out. Venues, timing, weather, the lot.</p>
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
  const weather = weatherLine(d.weather);
  const lines = [
    `DAYHOP: THE WEEKEND BRIEF (${d.weekendLabel})`,
    '',
    weather ? `Weather: ${weather}` : null,
    (d.advisories && d.advisories.length) ? `Heads-up: ${d.advisories.slice(0, 3).map(a => a.title || a.summary || a).join(' | ')}` : null,
    ''
  ].filter(v => v !== null);
  d.picks.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.title}${p.venue || p.location ? `, ${p.venue || p.location}` : ''}`);
    lines.push(`   ${trim(p.description, 160)}`);
    lines.push(`   ${p.booking_url || p.maps_url || base}`);
    lines.push('');
  });
  lines.push(`Turn one into a full day plan: ${base}/`);
  lines.push('');
  lines.push(`Unsubscribe: ${newsletter.unsubscribeUrl(token)}`);
  lines.push('DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest');
  return lines.join('\n');
}

// ---------- sending ----------
// Resend's free tier allows 2 requests/sec — pace sends instead of bursting.
const SEND_GAP_MS = 600;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let lastRun = null; // surfaced on the admin dashboard

/**
 * Build once, send to every confirmed subscriber (or just `testTo`).
 * Returns a summary; never throws for individual send failures.
 */
async function sendDigest({ testTo = null } = {}) {
  if (!emailConfigured()) return { sent: 0, skipped: 'EMAIL_NOT_CONFIGURED' };
  const digest = await buildDigest();

  let recipients;
  if (testTo) {
    // Test sends go out regardless of list state, with a throwaway token.
    recipients = [{ email: testTo, token: 'test-send' }];
  } else {
    recipients = await newsletter.listSubscribed();
    if (!recipients.length) return { sent: 0, skipped: 'NO_SUBSCRIBERS', subject: digest.subject };
  }

  // Issue id = the Toronto date of the send; digest_opened/digest_clicked
  // events carry it, and digest_sent below records the denominator for it.
  const issue = TORONTO_DAY_FMT.format(new Date());

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
  console.log(`[digest] ${testTo ? 'test ' : ''}send complete: ${sent}/${recipients.length} delivered — "${digest.subject}"`);
  return lastRun;
}

/** Admin preview: the rendered HTML without sending anything. */
async function previewDigest() {
  const digest = await buildDigest();
  return { subject: digest.subject, html: digestHtml(digest, 'preview-token'), picks: digest.picks.length };
}

function digestStatus() {
  return { last_run: lastRun };
}

module.exports = { buildDigest, sendDigest, previewDigest, digestStatus };
// Exported for the house-style test (test/copyStyle.test.js) — pure
// template functions over a plain data object, no network.
module.exports.digestHtml = digestHtml;
module.exports.digestText = digestText;
