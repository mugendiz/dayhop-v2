// services/promo.js — DayHop V2
// One source of truth for the running guide/Pro promotion.
//
// The end date used to be written out in six places — routes/cityGuides.js,
// public/app.js, guides.html, guide-richmond-hill.html, index.html and the
// test — and they drifted. Between Sep 5 and Sep 11 2026 the pages advertised
// "$5 with FALL75" while checkout still billed the full $20, because only the
// copy had been updated. The single external customer who reached checkout in
// that window (Sep 8) was quoted a price the page had not promised, and left.
//
// So: the window lives here, the client reads it from /api/config, and nothing
// hardcodes a date again.
//
// The three env vars let a promo be extended or retargeted without a deploy —
// but ENDS must never outlast the real `expires_at` on the Stripe promotion
// code, or checkout would send Stripe an expired discount. verify() below
// checks exactly that against the live account; scripts/promo-check.js runs it.

const ID = process.env.GUIDE_AUTO_PROMO_ID || 'promo_1UCHI2PtAVtoCYbZiubt3mcy';
const CODE = process.env.GUIDE_AUTO_PROMO_CODE || 'FALL75';
const ENDS = process.env.GUIDE_AUTO_PROMO_UNTIL || '2026-09-22T03:59:59Z';
// Human-facing deadline, e.g. "Sep 21". Copy says "until <LABEL>", so this is
// the last day the offer stands, not the instant it dies.
const LABEL = process.env.GUIDE_AUTO_PROMO_LABEL || 'Sep 21';
const PERCENT = Number(process.env.GUIDE_AUTO_PROMO_PERCENT || 75);

const ENDS_MS = Date.parse(ENDS);

function isOn(env = process.env) {
  return env.GUIDE_AUTO_PROMO !== 'off' && Boolean(ID) && Number.isFinite(ENDS_MS);
}

function active(now = Date.now(), env = process.env) {
  return isOn(env) && now < ENDS_MS;
}

/**
 * Stripe checkout params. Stripe accepts `discounts` or
 * `allow_promotion_codes`, never both — so once the window closes the code
 * box returns by itself.
 */
function promoParams(now = Date.now(), env = process.env) {
  if (active(now, env)) return { discounts: [{ promotion_code: ID }] };
  return { allow_promotion_codes: true };
}

/** What the browser needs to render the offer strip. Public values only. */
function publicConfig(now = Date.now()) {
  return {
    code: CODE,
    percentOff: PERCENT,
    endsUtc: Number.isFinite(ENDS_MS) ? new Date(ENDS_MS).toISOString() : null,
    label: LABEL,
    active: active(now)
  };
}

/**
 * Compare the configured window against the live Stripe promotion code.
 * Returns { ok, reason, stripeExpiresUtc, configuredEndsUtc }. Never throws —
 * a check that cannot run must not take anything down with it.
 */
async function verify(fetchImpl = fetch, env = process.env) {
  const key = env.STRIPE_SECRET_KEY;
  const configuredEndsUtc = Number.isFinite(ENDS_MS) ? new Date(ENDS_MS).toISOString() : null;
  if (!key) return { ok: null, reason: 'no STRIPE_SECRET_KEY', configuredEndsUtc };
  if (!ID) return { ok: null, reason: 'no promotion code configured', configuredEndsUtc };
  try {
    const res = await fetchImpl(`https://api.stripe.com/v1/promotion_codes/${ID}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    const body = await res.json();
    if (body.error) return { ok: false, reason: body.error.message, configuredEndsUtc };
    const stripeExpiresUtc = body.expires_at ? new Date(body.expires_at * 1000).toISOString() : null;
    const out = { stripeExpiresUtc, configuredEndsUtc, code: body.code, active: body.active };
    if (!body.active) return { ok: false, reason: `Stripe code ${body.code} is inactive`, ...out };
    if (body.code !== CODE) return { ok: false, reason: `Stripe code is ${body.code}, copy says ${CODE}`, ...out };
    if (stripeExpiresUtc && ENDS_MS > Date.parse(stripeExpiresUtc)) {
      return { ok: false, reason: `our window outlasts Stripe's by ${Math.round((ENDS_MS - Date.parse(stripeExpiresUtc)) / 36e5)}h — checkout would send an expired discount`, ...out };
    }
    return { ok: true, reason: 'window is within the Stripe code', ...out };
  } catch (err) {
    return { ok: null, reason: 'check failed: ' + err.message, configuredEndsUtc };
  }
}

module.exports = { ID, CODE, ENDS, LABEL, PERCENT, ENDS_MS, active, promoParams, publicConfig, verify };
