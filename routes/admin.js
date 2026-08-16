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
const { isAdmin } = require('../services/entitlements');

// Lazy: newOpenings drags in the whole discovery stack (buzz, autoCatalog,
// grok, curatedCatalog). Admin routes are hit rarely — keep that graph out
// of every cold start (same pattern as the scheduler in server.js).
let _newOpenings = null;
function newOpeningsSvc() {
  if (!_newOpenings) _newOpenings = require('../services/newOpenings');
  return _newOpenings;
}

function keyMatches(provided) {
  const expected = process.env.ADMIN_KEY || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  // Header only — query strings land in access logs and browser history,
  // which is no place for a standing secret. (admin.html's ?key=
  // convenience already converts to this header client-side.)
  const providedKey = req.headers['x-admin-key'];
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
    // ?cached=1 → peek only (page-load "N awaiting review"), never scans.
    if (req.query.cached) {
      return res.json(newOpeningsSvc().peek() || { cached: false, items: [] });
    }
    res.json(await newOpeningsSvc().collect());
  } catch (err) {
    console.error('[admin] discovery failed:', err.message);
    res.status(500).json({ error: 'DISCOVERY_FAILED', message: 'Could not scan feeds right now.' });
  }
});

// Catalog audit: what the autopilot has actually published, straight from
// public.auto_catalog — the one content store not visible in the repo.
// Read-only; ?status=retired (default active) to see pulled entries.
router.get('/catalog', requireAdmin, async (req, res) => {
  try {
    const dbClient = require('../services/db/client');
    const curatedCatalog = require('../data/curatedCatalog');
    if (dbClient.status().service_key !== true) {
      return res.status(503).json({ error: 'NO_SERVICE_KEY', message: 'auto_catalog needs the Supabase service key.' });
    }
    const status = req.query.status === 'retired' ? 'retired' : 'active';
    const { data, error } = await dbClient.getClient()
      .from('auto_catalog')
      .select('id, entry, status, created_at')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = (data || []).map(r => ({
      id: r.id,
      title: r.entry && r.entry.title,
      category: r.entry && r.entry.category,
      location: r.entry && r.entry.location,
      buzz_score: r.entry && r.entry.buzz_score,
      status: r.status,
      created_at: r.created_at
    }));
    res.json({ status, count: rows.length, rows, curated_count: curatedCatalog.length, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[admin] catalog failed:', err.message);
    res.status(500).json({ error: 'CATALOG_FAILED', message: 'Could not list the auto catalog.' });
  }
});

// Sponsored placements: list (+30d performance), add/update, pause/resume.
// The monthly-report numbers sponsors are paying for come from stats().
router.get('/sponsors', requireAdmin, async (req, res) => {
  try {
    const sponsors = require('../services/sponsors');
    const rows = sponsors.list();
    const perf = await sponsors.stats(rows.map(r => r.id));
    res.json({
      sponsors: rows.map(r => Object.assign({
        id: r.id, tier: r.tier, status: r.status,
        title: r.entry && r.entry.title, location: r.entry && r.entry.location,
        starts_at: r.starts_at, ends_at: r.ends_at
      }, perf.get(r.id) || { impressions: 0, engagements: 0 })),
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[admin] sponsors list failed:', err.message);
    res.status(500).json({ error: 'SPONSORS_FAILED', message: 'Could not list sponsors.' });
  }
});

router.post('/sponsors', requireAdmin, async (req, res) => {
  try {
    const sponsors = require('../services/sponsors');
    const row = await sponsors.upsert(req.body || {});
    res.json({ sponsor: row });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_SPONSOR', message: err.message });
  }
});

router.post('/sponsors/status', requireAdmin, async (req, res) => {
  try {
    const sponsors = require('../services/sponsors');
    const { id, status } = req.body || {};
    const row = await sponsors.setStatus(String(id || ''), String(status || ''));
    res.json({ sponsor: { id: row.id, status: row.status } });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_SPONSOR', message: err.message });
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

// ---------- newsletter / weekly digest ----------
// Lazy for the same reason as newOpenings: digest drags in the whole
// candidate-gathering stack, and admin routes are hit rarely.
let _digest = null;
function digestSvc() {
  if (!_digest) _digest = require('../services/digest');
  return _digest;
}

// Subscriber counts + consent trail + last digest run.
router.get('/newsletter', requireAdmin, async (req, res) => {
  try {
    const newsletter = require('../services/newsletter');
    const email = require('../services/email');
    const stats = await newsletter.stats();
    res.json(Object.assign({ email: email.status(), digest: digestSvc().digestStatus() }, stats));
  } catch (err) {
    console.error('[admin] newsletter stats failed:', err.message);
    res.status(500).json({ error: 'NEWSLETTER_FAILED', message: 'Could not compute newsletter stats.' });
  }
});

// Rendered digest HTML without sending — open it in a browser tab to proof
// this week's issue before Thursday.
router.get('/newsletter/preview', requireAdmin, async (req, res) => {
  try {
    const preview = await digestSvc().previewDigest();
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.json) return res.json({ subject: preview.subject, picks: preview.picks });
    res.setHeader('X-Digest-Subject', encodeURIComponent(preview.subject));
    res.send(preview.html);
  } catch (err) {
    console.error('[admin] digest preview failed:', err.message);
    res.status(500).json({ error: 'PREVIEW_FAILED', message: `Could not build the digest: ${err.message}` });
  }
});

// Send this week's digest to ONE address (yours) — the pre-flight check.
router.post('/newsletter/test-send', requireAdmin, async (req, res) => {
  const to = typeof (req.body && req.body.email) === 'string' ? req.body.email.trim() : '';
  if (!to) return res.status(400).json({ error: 'INVALID_INPUT', message: 'email is required.' });
  try {
    res.json(await digestSvc().sendDigest({ testTo: to }));
  } catch (err) {
    console.error('[admin] digest test send failed:', err.message);
    res.status(500).json({ error: 'SEND_FAILED', message: err.message });
  }
});

// Manual full send to every confirmed subscriber (the scheduler does this
// automatically on Thursdays — this is the on-demand lever).
router.post('/newsletter/send', requireAdmin, async (req, res) => {
  try {
    res.json(await digestSvc().sendDigest());
  } catch (err) {
    console.error('[admin] digest send failed:', err.message);
    res.status(500).json({ error: 'SEND_FAILED', message: err.message });
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
