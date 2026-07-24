// routes/admin.js — DayHop V2 (Phase 4)
// GET /api/admin/metrics — internal analytics. Two ways in:
//   - signed in as a super-admin account (verified Supabase JWT whose email
//     is in the entitlements admin list) — the normal path;
//   - x-admin-key header matching ADMIN_KEY (constant-time compare) — the
//     no-auth escape hatch for curl and pre-auth environments.
// With no ADMIN_KEY configured the key path answers 503, never open.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const analytics = require('../services/analytics');
const billing = require('../services/billing');
const moderation = require('../services/moderation');
const newOpenings = require('../services/newOpenings');
const { isAdmin } = require('../services/entitlements');

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  const providedKey = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY && !providedKey) {
    return res.status(503).json({
      error: 'ADMIN_NOT_CONFIGURED',
      message: 'Sign in with an admin account, or set ADMIN_KEY in .env to enable key access.'
    });
  }
  if (!keyMatches(providedKey)) {
    return res.status(401).json({ error: 'FORBIDDEN', message: 'Admin sign-in or a valid admin key required.' });
  }
  next();
}

// Discovery inbox (Phase 1): RSS scan + Grok entity extraction → candidate
// new openings with paste-ready catalog drafts. Cached 6h server-side; the
// first call in a window takes ~10–20s (feeds + one Grok call).
router.get('/discovery', requireAdmin, async (req, res) => {
  try {
    res.json(await newOpenings.collect());
  } catch (err) {
    console.error('[admin] discovery failed:', err.message);
    res.status(500).json({ error: 'DISCOVERY_FAILED', message: 'Could not scan feeds right now.' });
  }
});

router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.metrics();
    res.json(Object.assign({ billing: billing.status(), generated_at: new Date().toISOString() }, data));
  } catch (err) {
    console.error('[admin] metrics failed:', err.message);
    res.status(500).json({ error: 'METRICS_FAILED', message: 'Could not compute metrics.' });
  }
});

// Per-owner activity rollup + current ban status, most recent first.
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const [activity, bans] = await Promise.all([analytics.userActivity(200), moderation.list()]);
    const banByKey = new Map(bans.map(b => [b.owner_key, b]));
    const users = activity.users.map(u =>
      Object.assign(u, { banned: banByKey.has(u.owner_key), ban: banByKey.get(u.owner_key) || null }));
    // Banned owners with no recent events should still be visible/undoable.
    for (const b of bans) {
      if (!users.some(u => u.owner_key === b.owner_key)) {
        users.push({ owner_key: b.owner_key, kind: 'unknown', events: 0, banned: true, ban: b });
      }
    }
    res.json({ source: activity.source, users, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[admin] users failed:', err.message);
    res.status(500).json({ error: 'USERS_FAILED', message: 'Could not compute user activity.' });
  }
});

router.post('/ban', requireAdmin, async (req, res) => {
  const ownerKey = typeof (req.body && req.body.owner_key) === 'string' ? req.body.owner_key.trim() : '';
  if (!ownerKey) return res.status(400).json({ error: 'INVALID_INPUT', message: 'owner_key is required.' });
  if (req.user && ownerKey === req.user.id) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'You cannot ban your own account.' });
  }
  try {
    const row = await moderation.ban(ownerKey, {
      reason: req.body && req.body.reason,
      bannedBy: (req.user && req.user.email) || 'admin-key'
    });
    res.json({ banned: row });
  } catch (err) {
    console.error('[admin] ban failed:', err.message);
    res.status(500).json({ error: 'BAN_FAILED', message: 'Could not ban that account.' });
  }
});

router.post('/unban', requireAdmin, async (req, res) => {
  const ownerKey = typeof (req.body && req.body.owner_key) === 'string' ? req.body.owner_key.trim() : '';
  if (!ownerKey) return res.status(400).json({ error: 'INVALID_INPUT', message: 'owner_key is required.' });
  try {
    await moderation.unban(ownerKey);
    res.json({ unbanned: ownerKey });
  } catch (err) {
    console.error('[admin] unban failed:', err.message);
    res.status(500).json({ error: 'UNBAN_FAILED', message: 'Could not unban that account.' });
  }
});

module.exports = router;
