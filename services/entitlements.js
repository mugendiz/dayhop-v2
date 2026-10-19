// services/entitlements.js — DayHop V2 (Freemium)
// Single source of truth for what Free vs Pro can do. Routes never hardcode
// tier logic — they ask here, then compare against usage counts.
//
// Follows the app's fail-soft pattern:
//   - Stripe not configured → "preview" tier (everything unlocked, matching
//     the existing behavior where limits only turn on once billing is live).
//   - Billing lookup fails → fail OPEN for this request (never lock a paying
//     user out because Stripe/Supabase hiccuped).
//
// A `null` limit means unlimited.

const billing = require('./billing');

// 3 generates/day: enough to plan a real day (first try + two refinements),
// scarce enough that the daily reset is felt — the "come back tomorrow"
// rhythm is the retention loop, and the third plan is the upgrade moment.
const FREE_DAILY_GENERATES = Number(process.env.FREE_DAILY_GENERATES || 3);
// 5 saved plans (was 2): enough room to form a habit before hitting the
// gate — the upgrade moment should come from love, not from a wall.
const FREE_GUIDE_LIMIT = Number(process.env.FREE_GUIDE_LIMIT || 5);
const FREE_DAILY_REPLANS = Number(process.env.FREE_DAILY_REPLANS || 1);
const MAX_TRIP_DAYS = 3;

const FREE_TIER = Object.freeze({
  tier: 'free',
  daily_generates: FREE_DAILY_GENERATES,
  saved_guides: FREE_GUIDE_LIMIT,     // total saved plans
  can_edit_saved_guides: false,       // can edit locally, cannot persist edits
  max_trip_days: 1,                   // single-day plans only
  daily_replans: FREE_DAILY_REPLANS   // a taste of smart re-planning per day
});

const PRO_TIER = Object.freeze({
  tier: 'pro',
  daily_generates: null,
  saved_guides: null,
  can_edit_saved_guides: true,
  max_trip_days: MAX_TRIP_DAYS,
  daily_replans: null
});

// Pre-Stripe preview mode: Pro capabilities without the Pro label.
const PREVIEW_TIER = Object.freeze(Object.assign({}, PRO_TIER, { tier: 'preview' }));

// Super admins: everything Pro has, free forever, no Stripe involved. The
// founder account is baked in so it survives any env misconfiguration;
// ADMIN_EMAILS (comma-separated) extends the list per deployment.
const ADMIN_TIER = Object.freeze(Object.assign({}, PRO_TIER, { tier: 'admin' }));
const ADMIN_EMAILS = new Set(
  ['mugendiz@gmail.com', ...String(process.env.ADMIN_EMAILS || '').split(',')]
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

// Admin status comes from the verified Supabase JWT (attachUser), never
// from anything client-supplied.
function isAdmin(user) {
  return Boolean(user && user.email && ADMIN_EMAILS.has(String(user.email).toLowerCase()));
}

/**
 * Resolve the capability set for a caller. Accepts the authenticated user
 * object ({ id, email }) when available — needed for the admin check — or a
 * bare user id; null/undefined means guest (guests are always free tier once
 * billing is configured — Pro requires an account to attach the sub to).
 */
async function entitlementsFor(userOrId) {
  const user = userOrId && typeof userOrId === 'object' ? userOrId : null;
  const userId = user ? user.id : userOrId;
  if (isAdmin(user)) return ADMIN_TIER;
  if (!billing.isConfigured()) return PREVIEW_TIER;
  if (!userId) return FREE_TIER;
  try {
    return (await billing.isPro(userId)) ? PRO_TIER : FREE_TIER;
  } catch (err) {
    console.warn('[entitlements] isPro check failed (failing open):', err.message);
    return PREVIEW_TIER;
  }
}

module.exports = { entitlementsFor, isAdmin, FREE_TIER, PRO_TIER, PREVIEW_TIER, ADMIN_TIER, MAX_TRIP_DAYS, ADMIN_EMAILS };
