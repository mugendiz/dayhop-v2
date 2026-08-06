// services/metaPixel.js — DayHop V2
// Ad infrastructure, server half: Meta Conversions API (CAPI). Sends the
// conversion events ad delivery optimizes on — from the server, so they
// survive ad blockers and Safari's script throttling, and can fire at moments
// the browser never sees (double-opt-in confirm, Stripe webhook).
//
// Fail-soft like email.js: nothing configured → status() says so, sendEvent()
// is a silent no-op, nothing crashes. Browser and server deliberately send
// DISJOINT event names (browser: PageView only; server: Lead,
// NewsletterConfirmed, CompleteRegistration, InitiateCheckout, StartTrial) so
// no event_id dedup bookkeeping is needed — nothing is ever double-counted.
//
// Env:
//   META_PIXEL_ID         — the pixel/dataset ID (also drives the browser pixel
//                           via /api/config)
//   META_CAPI_TOKEN       — Conversions API access token (Events Manager →
//                           Settings → Generate access token)
//   META_TEST_EVENT_CODE  — optional; routes events to Events Manager's "Test
//                           events" tab instead of live data. Remove for prod.

const axios = require('axios');
const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const CAPI_TOKEN = process.env.META_CAPI_TOKEN;
const TEST_CODE = process.env.META_TEST_EVENT_CODE;
const GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

function isConfigured() {
  return Boolean(PIXEL_ID && CAPI_TOKEN);
}

function status() {
  if (isConfigured()) return { configured: true, mode: TEST_CODE ? 'test' : 'live' };
  // Pixel-only is a valid intermediate state: browser events flow, server
  // events wait on the token.
  if (PIXEL_ID) return { configured: false, mode: 'pixel-only (set META_CAPI_TOKEN for server events)' };
  return { configured: false, mode: null };
}

// Meta requires PII normalized then SHA-256 hashed.
function hashEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

let warnedUnconfigured = false;

/**
 * Send one server event. Fire-and-forget: never throws, never blocks.
 * @param {string} eventName  Meta standard or custom event name
 * @param {object} opts
 *   email      — plaintext; hashed here, never sent raw
 *   ip         — client IP (req.ip)
 *   userAgent  — req.headers['user-agent']
 *   sourceUrl  — page URL the action happened on (best-effort)
 *   customData — { value, currency, content_name, ... } (optional)
 *   eventId    — optional stable ID (retry-safe dedup on Meta's side)
 */
function sendEvent(eventName, { email, ip, userAgent, sourceUrl, customData, eventId } = {}) {
  if (!isConfigured()) {
    if (!warnedUnconfigured && PIXEL_ID) {
      warnedUnconfigured = true;
      console.warn('[meta] META_PIXEL_ID set but META_CAPI_TOKEN missing — server conversion events are OFF');
    }
    return;
  }
  const userData = {};
  const em = hashEmail(email);
  if (em) userData.em = [em];
  if (ip) userData.client_ip_address = String(ip);
  if (userAgent) userData.client_user_agent = String(userAgent).slice(0, 512);
  // Meta rejects events with an empty user_data — skip rather than error-spam.
  if (Object.keys(userData).length === 0) return;

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: sourceUrl || undefined,
      event_id: eventId || undefined,
      user_data: userData,
      custom_data: customData || undefined
    }],
    ...(TEST_CODE ? { test_event_code: TEST_CODE } : {})
  };

  axios.post(GRAPH_URL, payload, {
    params: { access_token: CAPI_TOKEN },
    timeout: 5000
  }).then(() => {
    console.log(`[meta] ${eventName} sent${TEST_CODE ? ' (test mode)' : ''}`);
  }).catch(err => {
    const detail = err.response && err.response.data && err.response.data.error
      ? err.response.data.error.message : err.message;
    console.warn(`[meta] ${eventName} failed:`, detail);
  });
}

module.exports = { isConfigured, status, sendEvent };
