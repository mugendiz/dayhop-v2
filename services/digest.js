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
const kit = require('./emailKit');
const { enrichIssue, applyEnrichment } = require('./issueEnrich');
const issueStore = require('./issueStore');

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

// opts.preview: no Grok call (admin previews refresh often); hooks fall back
// to each pick's own first sentence.
async function buildDigest({ preview = false } = {}) {
  const window = upcomingWeekend();
  const dateWindow = parseDateWindow(window.start, window.end);
  const { candidates, weather, advisories, advisoriesStatus, resolvedCity } = await gatherCandidates(
    'A fantastic family weekend: standout events, new openings, and places genuinely worth the drive',
    'Toronto', '', null, null, undefined, dateWindow
  );
  const raw = pickIdeas(candidates);
  if (!raw.length) throw new Error('digest has no picks — refusing to send an empty email');
  // Hooks, best-for tags and the standout pick (services/issueEnrich.js):
  // the parts that make an issue worth forwarding. Never blocks a send.
  const picks = applyEnrichment(raw, await enrichIssue(raw, { kind: 'weekend', offline: preview }));

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

// The issue itself, shared by the email (digestHtml) and its public web
// copy (routes/issues.js). ctx: { base, wrap, web, webUrl, subject }.
function digestBody(d, { base, wrap = u => u, web = false, webUrl = null }) {
  // Picture cards (services/emailKit.js): a photo or the category's own
  // banner, a numbered badge, and a second button that opens the planner on
  // that pick. Plan links get their own click index (100+) so the open/click
  // report can tell "went to the venue" from "planned a day".
  const picksHtml = d.picks.map((p, i) => kit.pickCard(p, {
    index: i,
    base,
    link: wrap(p.booking_url || p.maps_url || base, i),
    planLink: wrap(kit.planUrl(base, p.title, 'weekend-brief'), 100 + i),
    ribbon: null,
    period: 'weekend',
    metaLines: [
      p.venue || p.location || '',
      [p.cost_tier, p.good_for_ages && `ages ${p.good_for_ages}`].filter(Boolean).join(' · ')
    ],
    description: trim(p.description, 190),
    ctaLabel: p.booking_url ? 'Details & tickets' : 'See it on the map'
  }));

  const weather = weatherLine(d.weather);
  const advisoriesHtml = (d.advisories && d.advisories.length) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      <tr><td style="background:#FFF4E5;border:1px solid #f0ddb8;border-radius:10px;padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#8a5a00;">Heads-up before you head out</p>
        ${d.advisories.slice(0, 3).map(a => `<p style="margin:0 0 4px;font-size:13.5px;line-height:1.5;color:#5c4a1e;">• ${esc(a.title || a.summary || a)}</p>`).join('')}
      </td></tr>
    </table>` : '';

  // Share row: under the first pick and again at the end, the two places a
  // reader decides "someone should see this". Email links are click-tracked
  // (indexes 200+); the web copy gets a real copy-link button.
  const share = webUrl
    ? kit.shareRow(kit.shareLinks(webUrl, 'weekend', d.subject), {
      wrap: (u, ch) => wrap(u, 200 + ['web', 'email', 'whatsapp', 'facebook'].indexOf(ch)), web
    })
    : '';
  const [first, ...rest] = picksHtml;
  return `
    ${kit.masthead(base, 'weekend', 'DayHop: the weekend brief')}
    ${!web && webUrl ? `<p style="margin:-10px 0 14px;font-size:12.5px;text-align:right;"><a href="${esc(wrap(kit.shareLinks(webUrl, 'weekend').web, 210))}" style="color:#3F6F5C;font-weight:700;text-decoration:none;">View and share this issue on the web →</a></p>` : ''}
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#3F6F5C;font-weight:700;">The weekend brief · ${esc(d.weekendLabel)}</p>
    <h1 style="font-size:26px;line-height:1.25;margin:0 0 8px;">${d.picks.length} things worth your Saturday 🎒</h1>
    <p style="font-size:15.5px;line-height:1.6;margin:0 0 18px;color:#2C4A4E;">
      Hand-picked around ${esc(d.city)} for this weekend. Tap a picture for the details, or let DayHop build the whole day around it.
    </p>
    ${kit.weatherBox(d.weather, weather && weather.replace(/, around -?\d+(\.\d+)?°C\./, '.'))}
    ${advisoriesHtml}
    ${first || ''}
    ${share}
    ${rest.join('')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#102A2E;border-radius:14px;margin:0 0 22px;"><tr><td align="center" style="padding:24px 20px;">
      <p style="margin:0 0 6px;font-size:19px;font-weight:800;color:#ffffff;">Not quite your weekend? ✨</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#d9e3df;">One sentence in, a whole day out. Venues, timing, weather, the lot.</p>
      ${kit.button(wrap(`${base}/`), 'Plan my own day')}
    </td></tr></table>
    ${share}`;
}

function digestHtml(d, token, tracking) {
  const base = newsletter.baseUrl();
  const unsub = newsletter.unsubscribeUrl(token);
  // First-party click/open tracking (services/digestLinks.js). `tracking`
  // is { issue, sid } per recipient; absent (previews) → bare links.
  const wrap = (url, idx) => tracking
    ? digestLinks.clickUrl(base, { issue: tracking.issue, sid: tracking.sid, url, idx })
    : url;
  // Only a published issue (d.issueDate, set once its snapshot is saved)
  // links to its web copy.
  const webUrl = d.issueDate ? kit.issueUrl(base, 'weekend', d.issueDate) : null;
  return kit.page(`
    ${digestBody(d, { base, wrap, webUrl })}
    ${kit.footer(unsub)}
    ${tracking ? `<img src="${esc(digestLinks.openPixelUrl(base, tracking))}" width="1" height="1" alt="" style="display:block;border:0;">` : ''}`);
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
    if (p.standout) lines.push('IF YOU ONLY DO ONE THING:');
    lines.push(`${i + 1}. ${p.title}${p.venue || p.location ? `, ${p.venue || p.location}` : ''}`);
    if (p.hook) lines.push(`   ${p.hook}`);
    if ((p.best_for || []).length) lines.push(`   Best for: ${p.best_for.join(', ')}`);
    lines.push(`   ${trim(p.description, 160)}`);
    lines.push(`   ${p.booking_url || p.maps_url || base}`);
    lines.push('');
  });
  lines.push(`Turn one into a full day plan: ${base}/`);
  if (d.issueDate) lines.push(`Share this issue: ${kit.shareLinks(kit.issueUrl(base, 'weekend', d.issueDate), 'weekend').copy}`);
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
  // The public web copy (/weekend/<date>, routes/issues.js) must exist before
  // the first inbox opens it. A test send publishes nothing, so its email
  // carries no web or share links (they would 404). A same-day re-send gets
  // the saved snapshot back and sends exactly that issue again.
  if (!testTo) {
    try {
      const snap = await issueStore.saveIssue('weekend', issue, digest);
      digest.picks = snap.picks;
      digest.subject = snap.subject || digest.subject;
      digest.issueDate = issue;
    } catch (err) { console.warn('[digest] web copy not saved, emails go out without web or share links:', err.message); }
  }

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
  const digest = await buildDigest({ preview: true });
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
module.exports.digestBody = digestBody;
module.exports.weatherLine = weatherLine;
