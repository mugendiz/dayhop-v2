// services/email.js — DayHop V2
// Outbound email transport (Resend HTTP API — no SDK, axios is already here).
// Fail-soft like every other integration: no RESEND_API_KEY → status() says
// so, send() resolves { sent:false, reason } and nothing crashes. Callers
// treat email as best-effort; the product never depends on a send landing.
//
// Env:
//   RESEND_API_KEY   — from resend.com (free tier: 3k emails/mo, 100/day)
//   EMAIL_FROM       — verified sender, e.g. "DayHop <hello@dayhop.quest>"
//   EMAIL_REPLY_TO   — optional human reply address (default admin@dayhop.quest)
//
// Deliverability contract (Gmail/Yahoo bulk-sender rules, Feb 2024+): the
// domain in EMAIL_FROM must carry SPF + DKIM (Resend's DNS records) and a
// DMARC policy, and every bulk send must include RFC 8058 one-click
// List-Unsubscribe headers — sendEmail() attaches them whenever the caller
// passes unsubscribeUrl. Transactional sends (confirm-your-email) skip them.

const axios = require('axios');

const RESEND_URL = 'https://api.resend.com/emails';
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'DayHop <hello@dayhop.quest>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'admin@dayhop.quest';

function isConfigured() {
  return Boolean(API_KEY);
}

function status() {
  return { configured: isConfigured(), from: isConfigured() ? FROM : null };
}

// One warning at boot-time-of-first-use, not one per send.
let warnedUnconfigured = false;

/**
 * Send one email. Returns { sent, id?, reason? } — never throws.
 * @param {object} opts
 *   to             — recipient address (string)
 *   subject        — subject line
 *   html           — HTML body
 *   text           — plain-text body (always pass one: multipart improves
 *                    spam placement and serves text-only clients)
 *   unsubscribeUrl — marketing sends ONLY: enables RFC 8058 one-click
 *                    unsubscribe headers. Omit for transactional email.
 *   attachments    — optional [{ filename, content: Buffer }] (kept small:
 *                    Resend caps messages at 40MB but inboxes punish bulk)
 */
async function sendEmail({ to, subject, html, text, unsubscribeUrl, attachments }) {
  if (!isConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[email] RESEND_API_KEY not set — outbound email disabled (subscribe flows still record consent).');
    }
    return { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
  }
  const payload = { from: FROM, to: [to], subject, html, text, reply_to: REPLY_TO };
  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content
    }));
  }
  if (unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };
  }
  try {
    const { data } = await axios.post(RESEND_URL, payload, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: 15000
    });
    return { sent: true, id: data && data.id };
  } catch (err) {
    const detail = (err.response && err.response.data && err.response.data.message) || err.message;
    console.warn(`[email] send to ${to} failed:`, detail);
    return { sent: false, reason: detail };
  }
}

module.exports = { isConfigured, status, sendEmail };
