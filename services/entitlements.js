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

const FREE_DAILY_GENERATES = Number(process.env.FREE_DAILY_GENERATES || 5);
const FREE_GUIDE_LIMIT = Number(process.env.FREE_GUIDE_LIMIT || 2);
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

/**
 * Resolve the capability set for a caller. `userId` is the authenticated
 * user id, or null/undefined for guests (guests are always free tier once
 * billing is configured — Pro requires an account to attach the sub to).
 */
async function entitlementsFor(userId) {
  if (!billing.isConfigured()) return PREVIEW_TIER;
  if (!userId) return FREE_TIER;
  try {
    return (await billing.isPro(userId)) ? PRO_TIER : FREE_TIER;
  } catch (err) {
    console.warn('[entitlements] isPro check failed (failing open):', err.message);
    return PREVIEW_TIER;
  }
}

module.exports = { entitlementsFor, FREE_TIER, PRO_TIER, PREVIEW_TIER, MAX_TRIP_DAYS };
