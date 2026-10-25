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

// ---------- Roles (2026-08-18, three tiers since 2026-08-20) ----------
// owner    — exactly one (admin_users row; ADMIN_KEY is break-glass
//            owner-equivalent): everything. Not deletable; ownership moves
//            only via /team/transfer-ownership to an existing deputy.
// deputy   — trusted co-admin: accounting + the whole staff surface, but no
//            team management, moderation, full metrics, or backfill.
// operator — the CRM tab and a reduced metrics payload ONLY.
// Deny-by-default: every route names the roles it accepts via requireRole.
// Role resolution lives in services/outreach.roleFor (DB row first,
// ADMIN_EMAILS env fallback), so a transfer takes effect without a deploy.
async function resolveRole(req) {
  // Header only — query strings land in access logs and browser history,
  // which is no place for a standing secret. (admin.html's ?key=
  // convenience already converts to this header client-side.)
  if (keyMatches(req.headers['x-admin-key'])) return { role: 'owner', actor: 'admin-key' };
  const email = req.user && req.user.email;
  if (!email) return null;
  const role = await require('../services/outreach').roleFor(email);
  return role ? { role, actor: String(email).toLowerCase() } : null;
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!process.env.ADMIN_KEY && !req.headers['x-admin-key'] && !(req.user && req.user.email)) {
      return res.status(503).json({
        error: 'ADMIN_NOT_CONFIGURED',
        message: 'Sign in with an admin account, or set ADMIN_KEY in .env to enable key access.'
      });
    }
    resolveRole(req)
      .then(r => {
        if (!r || !roles.includes(r.role)) {
          return res.status(401).json({ error: 'FORBIDDEN', message: 'Admin sign-in or a valid admin key required.' });
        }
        req.adminRole = r.role;
        req.adminActor = r.actor;
        next();
      })
      .catch(next);
  };
}
const requireOwner = requireRole('owner');
const requireFinance = requireRole('owner', 'deputy');           // accounting
const requireStaff = requireRole('owner', 'deputy', 'operator'); // CRM + lite metrics
const requireAdmin = requireOwner; // legacy alias — every pre-roles route is owner-only

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

// "Talk of the town" (services/talkOfTown.js): the weekly verified outdoor
// picks per hub. Peek, refresh one hub now (one Grok live-search call +
// a few Places lookups), pin/retire a pick, add one by hand (same
// verification chain). Owner-only like the catalog.
let _tott = null;
function tottSvc() {
  if (!_tott) _tott = require('../services/talkOfTown');
  return _tott;
}
// Monthly social calendar (services/socialMonth.js). GET previews a month
// as JSON, plain text or the CSV to schedule from; captions are drafted by
// Grok only with ?captions=1, so a preview reload never spends anything.
// POST /send emails the plan with the photos attached, same as the 24th.
router.get('/social/month', requireAdmin, async (req, res) => {
  const sm = require('../services/socialMonth');
  const month = String(req.query.month || sm.nextMonth());
  try {
    const plan = await sm.buildMonth(month, { useGrok: req.query.captions === '1' });
    const format = String(req.query.format || 'json');
    if (format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="dayhop-social-${month}.csv"`);
      return res.send(sm.toCsv(plan));
    }
    if (format === 'text') return res.type('text/plain').send(sm.formatMonth(plan));
    res.json(plan);
  } catch (err) {
    res.status(400).json({ error: 'BAD_MONTH', message: err.message });
  }
});

router.post('/social/month/send', requireAdmin, async (req, res) => {
  const sm = require('../services/socialMonth');
  const month = String((req.body && req.body.month) || sm.nextMonth());
  try {
    res.json(await sm.sendMonth(new Date(), month));
  } catch (err) {
    res.status(400).json({ error: 'SEND_FAILED', message: err.message });
  }
});

router.get('/tott', requireAdmin, async (req, res) => {
  try {
    res.json(await tottSvc().peek());
  } catch (err) {
    console.error('[admin] tott peek failed:', err.message);
    res.status(500).json({ error: 'TOTT_FAILED', message: 'Could not read Talk of the town.' });
  }
});
router.post('/tott/refresh', requireAdmin, async (req, res) => {
  try {
    const hubId = String((req.body && req.body.hub) || 'toronto').slice(0, 40);
    const run = await tottSvc().refresh({ hubId, reason: 'admin' });
    res.json({ run, peek: await tottSvc().peek() });
  } catch (err) {
    console.error('[admin] tott refresh failed:', err.message);
    res.status(500).json({ error: 'TOTT_REFRESH_FAILED', message: err.message });
  }
});
router.post('/tott/:id/pin', requireAdmin, async (req, res) => {
  try {
    await tottSvc().pin(String(req.params.id).slice(0, 160), req.body && req.body.pinned !== false);
    res.json(await tottSvc().peek());
  } catch (err) {
    res.status(400).json({ error: 'TOTT_PIN_FAILED', message: err.message });
  }
});
router.post('/tott/:id/retire', requireAdmin, async (req, res) => {
  try {
    await tottSvc().retire(String(req.params.id).slice(0, 160));
    res.json(await tottSvc().peek());
  } catch (err) {
    res.status(400).json({ error: 'TOTT_RETIRE_FAILED', message: err.message });
  }
});
router.post('/tott/manual', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const row = await tottSvc().addManual({
      hubId: String(b.hub || 'toronto').slice(0, 40),
      title: String(b.title || '').slice(0, 120),
      venue: String(b.venue || '').slice(0, 120),
      city: String(b.city || '').slice(0, 80),
      start_date: String(b.start_date || '').slice(0, 10),
      end_date: String(b.end_date || b.start_date || '').slice(0, 10),
      official_url: String(b.official_url || '').slice(0, 300),
      why: String(b.why || '').slice(0, 200),
      price: String(b.price || '').slice(0, 20)
    });
    res.json({ row, peek: await tottSvc().peek() });
  } catch (err) {
    res.status(400).json({ error: 'TOTT_ADD_FAILED', message: err.message });
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

// Premium members: live Stripe subscription lifecycle (trial stage, pending
// cancels, churn, launch cohorts) merged with owner ids. The dashboard's
// money panel — Stripe is the source of truth, not the events stream.
router.get('/subscriptions', requireAdmin, async (req, res) => {
  try {
    res.json(await billing.adminSubscriptions());
  } catch (err) {
    console.error('[admin] subscriptions failed:', err.message);
    res.status(500).json({ error: 'SUBSCRIPTIONS_FAILED', message: 'Could not load subscriptions from Stripe.' });
  }
});

router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    // ?me= is the dashboard browser's own guest owner id (admin.html reads
    // its localStorage) — combined with the requesting IP it lets metrics()
    // separate the developer's traffic from real users. ?exclude_internal=1
    // computes every aggregate over external events only.
    const data = await analytics.metrics({
      meOwner: typeof req.query.me === 'string' ? req.query.me.trim().slice(0, 80) : null,
      meIp: req.ip,
      excludeInternal: req.query.exclude_internal === '1'
    });
    res.json(Object.assign({
      billing: billing.status(),
      // AI planner health — the dashboard shows a red banner while not-ok
      // (the Aug 2026 credits outage hid behind fail-soft for three days).
      grok_health: require('../services/grok').getHealth(),
      // Metered Google Maps spend today vs. the daily budget (the dashboard
      // shows an amber banner once calls are being refused).
      maps_usage: require('../services/apiCache').usageStatus(),
      generated_at: new Date().toISOString()
    }, data));
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
let _tottDigest = null;
function tottDigestSvc() {
  if (!_tottDigest) _tottDigest = require('../services/tottDigest');
  return _tottDigest;
}

// Subscriber counts + consent trail + last digest run.
router.get('/newsletter', requireAdmin, async (req, res) => {
  try {
    const newsletter = require('../services/newsletter');
    const email = require('../services/email');
    const stats = await newsletter.stats();
    res.json(Object.assign({ email: email.status(), digest: digestSvc().digestStatus(), tott_digest: tottDigestSvc().tottDigestStatus() }, stats));
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

// ---------- talk of the town newsletter (Mondays) ----------
// Same subscriber list and send mechanics as the weekend brief above — a
// second weekly issue sourced from services/talkOfTown.js's live shelf.
router.get('/newsletter/tott-preview', requireAdmin, async (req, res) => {
  try {
    const preview = await tottDigestSvc().previewTottDigest();
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.json) return res.json({ subject: preview.subject, picks: preview.picks });
    res.setHeader('X-Digest-Subject', encodeURIComponent(preview.subject));
    res.send(preview.html);
  } catch (err) {
    console.error('[admin] tott digest preview failed:', err.message);
    res.status(500).json({ error: 'PREVIEW_FAILED', message: `Could not build talk of the town: ${err.message}` });
  }
});

router.post('/newsletter/tott-test-send', requireAdmin, async (req, res) => {
  const to = typeof (req.body && req.body.email) === 'string' ? req.body.email.trim() : '';
  if (!to) return res.status(400).json({ error: 'INVALID_INPUT', message: 'email is required.' });
  try {
    res.json(await tottDigestSvc().sendTottDigest({ testTo: to }));
  } catch (err) {
    console.error('[admin] tott digest test send failed:', err.message);
    res.status(500).json({ error: 'SEND_FAILED', message: err.message });
  }
});

// Manual full send (the scheduler does this automatically on Mondays).
router.post('/newsletter/tott-send', requireAdmin, async (req, res) => {
  try {
    res.json(await tottDigestSvc().sendTottDigest());
  } catch (err) {
    console.error('[admin] tott digest send failed:', err.message);
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

// ---------- Dream Homes (2026-10-25) ----------
// Hand-entered real open houses for the homepage rail. Every staff role
// sees the list; only owner and deputy change it.
const requireDreamEditor = requireRole('owner', 'deputy');
const dreamHomes = require('../services/dreamHomes');
const dreamFail = (res, err) => res.status(err.status || 500).json({ error: err.status === 400 ? 'INVALID' : err.status === 404 ? 'NOT_FOUND' : 'DREAM_HOMES_FAILED', message: err.message, errors: err.errors });

router.get('/dream-homes', requireStaff, async (req, res) => {
  try {
    res.json({ role: req.adminRole, can_edit: ['owner', 'deputy'].includes(req.adminRole), homes: await dreamHomes.listAdmin() });
  } catch (err) { dreamFail(res, err); }
});
// body: { home: {...}, publish?: true } → saved as a draft unless publish
router.post('/dream-homes', requireDreamEditor, async (req, res) => {
  try {
    const b = req.body || {};
    res.json({ home: await dreamHomes.save(null, b.home, { actor: req.adminActor, publish: b.publish === true }) });
  } catch (err) { dreamFail(res, err); }
});
// "Find open houses": one Grok web + X search, each find checked against
// its source page, kept finds saved as drafts (services/dreamHomeFinder.js).
// Runs in the background; the tab polls /find/status. One at a time, with
// a five-minute cooldown, so a double tap never buys two searches.
router.post('/dream-homes/find', requireDreamEditor, (req, res) => {
  const job = require('../services/dreamHomeFinder').startFind({ actor: req.adminActor });
  res.status(202).json(job);
});
router.get('/dream-homes/find/status', requireStaff, (req, res) => {
  res.json(require('../services/dreamHomeFinder').findStatus());
});
router.post('/dream-homes/:id', requireDreamEditor, async (req, res) => {
  try {
    const b = req.body || {};
    res.json({ home: await dreamHomes.save(req.params.id, b.home, { actor: req.adminActor, publish: typeof b.publish === 'boolean' ? b.publish : null }) });
  } catch (err) { dreamFail(res, err); }
});
router.post('/dream-homes/:id/publish', requireDreamEditor, async (req, res) => {
  try { res.json({ home: await dreamHomes.setPublished(req.params.id, true, { actor: req.adminActor }) }); } catch (err) { dreamFail(res, err); }
});
router.post('/dream-homes/:id/unpublish', requireDreamEditor, async (req, res) => {
  try { res.json({ home: await dreamHomes.setPublished(req.params.id, false, { actor: req.adminActor }) }); } catch (err) { dreamFail(res, err); }
});
router.post('/dream-homes/:id/delete', requireDreamEditor, async (req, res) => {
  try { await dreamHomes.remove(req.params.id); res.json({ ok: true }); } catch (err) { dreamFail(res, err); }
});

// ---------- CRM + roles (2026-08-18) ----------
const outreachSvc = require('../services/outreach');

// Panel boot: who am I and what may I see? 401 here means "not staff at all"
// — admin.html shows the sign-in prompt on that.
router.get('/whoami', requireStaff, (req, res) => {
  res.json({ role: req.adminRole, actor: req.adminActor });
});

// The pipeline. Staff (owners + operators) — this tab is the operator's job.
router.get('/crm', requireStaff, async (req, res) => {
  try {
    const [rows, sum] = await Promise.all([outreachSvc.list(), outreachSvc.summary()]);
    res.json({ role: req.adminRole, summary: sum, rows, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[admin] crm list failed:', err.message);
    res.status(500).json({ error: 'CRM_FAILED', message: 'Could not load the pipeline.' });
  }
});

router.get('/crm/:id/history', requireStaff, async (req, res) => {
  try {
    res.json({ events: await outreachSvc.history(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: 'CRM_FAILED', message: err.message });
  }
});

router.post('/crm', requireStaff, async (req, res) => {
  try {
    res.json({ row: await outreachSvc.upsert(req.body || {}, req.adminActor) });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ROW', message: err.message });
  }
});

router.post('/crm/:id/stage', requireStaff, async (req, res) => {
  try {
    res.json({ row: await outreachSvc.setStage(req.params.id, String((req.body || {}).stage || ''), req.adminActor) });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_STAGE', message: err.message });
  }
});

router.post('/crm/:id/note', requireStaff, async (req, res) => {
  try {
    const note = String((req.body || {}).note || '').trim().slice(0, 2000);
    if (!note) return res.status(400).json({ error: 'INVALID_INPUT', message: 'note is required.' });
    res.json({ row: await outreachSvc.addNote(req.params.id, note, req.adminActor) });
  } catch (err) {
    res.status(400).json({ error: 'CRM_FAILED', message: err.message });
  }
});

router.post('/crm/:id/suppress', requireStaff, async (req, res) => {
  try {
    res.json({ row: await outreachSvc.setSuppressed(req.params.id, Boolean((req.body || {}).suppressed), req.adminActor) });
  } catch (err) {
    res.status(400).json({ error: 'CRM_FAILED', message: err.message });
  }
});

// Opener approval gates real outbound email in the founder's name — owner only.
router.post('/crm/:id/approve', requireAdmin, async (req, res) => {
  try {
    res.json({ row: await outreachSvc.approve(req.params.id, 'owner') });
  } catch (err) {
    res.status(400).json({ error: 'APPROVE_FAILED', message: err.message });
  }
});

// FOUNDING one-clicker: reply came in, send the code on the same thread.
router.post('/crm/:id/send-code', requireStaff, async (req, res) => {
  try {
    res.json(await outreachSvc.sendCoupon(req.params.id, req.adminActor));
  } catch (err) {
    res.status(400).json({ error: 'SEND_FAILED', message: err.message });
  }
});

// Manual cadence tick (owner) — the daily scheduler runs this automatically;
// the button exists so "run the due sends now" never waits for the clock.
router.post('/crm/tick', requireAdmin, async (req, res) => {
  try {
    res.json(await outreachSvc.tick());
  } catch (err) {
    res.status(500).json({ error: 'TICK_FAILED', message: err.message });
  }
});

// Reduced metrics for operators: reach numbers a sponsor conversation needs,
// none of the money, PII, or per-user detail. Server-side allowlist — the
// full metrics route above stays owner-only.
router.get('/metrics-lite', requireStaff, async (req, res) => {
  try {
    const data = await analytics.metrics({ excludeInternal: true });
    res.json({
      totals: data.totals ? {
        distinct_users: data.totals.distinct_users,
        prompts: data.totals.prompts,
        browses: data.totals.browses,
        shortlist_adds: data.totals.shortlist_adds,
        booking_clicks: data.totals.booking_clicks,
        plans_built: data.totals.plans_built
      } : null,
      funnel: data.funnel || null,
      mode_split: data.mode_split || null,
      top_cities: data.top_cities || null,
      shelf_ctr: data.shelf_ctr || null,
      daily: data.daily || [], // aggregate engagement counts only — no PII

      week4_retention_pct: data.retention ? data.retention.week4_avg : null,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[admin] metrics-lite failed:', err.message);
    res.status(500).json({ error: 'METRICS_FAILED', message: 'Could not compute metrics.' });
  }
});

// Traction snapshot (owner only): the numbers every application and investor
// email asks for, always current, from data DayHop already owns. Copy-paste
// shaped so a DMZ form or a monthly update takes minutes, not an evening.
router.get('/traction', requireAdmin, async (req, res) => {
  try {
    const [m, subs, nl, pipe] = await Promise.all([
      analytics.metrics({ excludeInternal: true }),
      billing.adminSubscriptions().catch(() => null),
      require('../services/newsletter').stats().catch(() => null),
      outreachSvc.summary().catch(() => null)
    ]);
    const net30 = await require('../services/accounting')
      .summary({ from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() })
      .catch(() => null);
    const net30Cad = net30 && net30.by_currency && net30.by_currency.CAD;
    const sponsors = require('../services/sponsors').list().filter(s => s.status === 'active');
    const daily = m.daily || [];
    const last7 = daily.slice(-7);
    const sum = (rows, k) => rows.reduce((a, d) => a + (d[k] || 0), 0);
    const t = m.totals || {};
    const bs = (subs && subs.summary) || {};
    res.json({
      as_of: new Date().toISOString().slice(0, 10),
      users: {
        total_distinct: t.distinct_users || 0,
        weekly_active: sum(last7, 'active_users'),
        new_last_7d: sum(last7, 'new_users'),
        week4_retention_pct: m.retention ? m.retention.week4_avg : null
      },
      engagement: {
        prompts_total: t.prompts || 0,
        plans_built: t.plans_built || 0,
        booking_clicks: t.booking_clicks || 0,
        signups: t.signups || 0
      },
      revenue: {
        mrr: bs.mrr || 0,
        currency: bs.currency || 'CAD',
        paying_subscribers: bs.active_paying || 0,
        in_trial: bs.in_trial || 0,
        active_sponsors: sponsors.length,
        sponsor_tiers: sponsors.map(s => s.tier),
        // From the accounting ledger: real charged dollars, net of refunds
        // and expenses, last 30 days. Null until the ledger has rows.
        net_30d: net30Cad ? Math.round(net30Cad.net_cents) / 100 : null,
        income_30d: net30Cad ? Math.round(net30Cad.income_cents) / 100 : null
      },
      audience: {
        newsletter_subscribed: (nl && nl.counts && nl.counts.subscribed) || 0,
        instagram: '@dayhopofficial',
        tiktok: 'dayhop3'
      },
      sales_pipeline: pipe,
      acquisition: (m.acquisition && m.acquisition.sources) || [],
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[admin] traction failed:', err.message);
    res.status(500).json({ error: 'TRACTION_FAILED', message: 'Could not build the traction snapshot.' });
  }
});

// ---------- Accounting (owner + deputy) ----------
// The books: P&L summary, ledger entries, manual expenses, recurring
// templates. Backfill (a heavier Stripe sweep) stays owner-only.
const accountingSvc = require('../services/accounting');

function requireLedger(req, res) {
  if (accountingSvc.isConfigured()) return true;
  res.status(503).json({
    error: 'NO_SERVICE_KEY',
    message: 'Accounting requires SUPABASE_SERVICE_KEY on the server.'
  });
  return false;
}

// Customers and orders (services/orderReport.js): every Stripe Checkout
// session with date, product, bought or only attempted, and city. No email,
// name or Stripe id ever leaves this route, and founder and team checkouts
// are left out. ?since=YYYY-MM-DD narrows it, ?format=pdf shows it as a PDF,
// ?format=csv downloads it; POST /email sends both to the operator inbox.
const ORDER_SINCE_RE = /^\d{4}-\d{2}-\d{2}$/;
router.get('/reports/orders', requireFinance, async (req, res) => {
  const orderReport = require('../services/orderReport');
  const since = ORDER_SINCE_RE.test(String(req.query.since || '')) ? req.query.since : null;
  try {
    const report = await orderReport.buildOrderReport({ since });
    if (req.query.format === 'pdf') {
      const pdf = await require('../services/orderReportPdf').buildOrderReportPdf(report);
      res.set('Content-Type', 'application/pdf');
      // inline: the browser shows it; its own save button keeps a copy.
      res.set('Content-Disposition', `inline; filename="dayhop-orders-${report.generated_on}.pdf"`);
      res.set('Cache-Control', 'no-store');
      return res.send(pdf);
    }
    if (req.query.format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="dayhop-orders-${report.generated_on}.csv"`);
      return res.send(orderReport.toCsv(report.rows));
    }
    res.json(report);
  } catch (err) {
    res.status(err.code === 'NOT_CONFIGURED' ? 503 : 502).json({ error: err.code || 'REPORT_FAILED', message: err.message });
  }
});

router.post('/reports/orders/email', requireFinance, async (req, res) => {
  const orderReport = require('../services/orderReport');
  const since = ORDER_SINCE_RE.test(String((req.body && req.body.since) || '')) ? req.body.since : null;
  try {
    const result = await orderReport.emailReport({ since });
    res.json({ sent: Boolean(result.sent), reason: result.reason, orders: result.orders });
  } catch (err) {
    res.status(err.code === 'NOT_CONFIGURED' ? 503 : 502).json({ error: err.code || 'REPORT_FAILED', message: err.message });
  }
});

// A signed, ten-minute link to the PDF or CSV, so the panel can simply
// navigate to it and the phone receives a real file (see orderReport.js).
router.post('/reports/orders/link', requireFinance, (req, res) => {
  const orderReport = require('../services/orderReport');
  const format = (req.body && req.body.format) === 'csv' ? 'csv' : 'pdf';
  const since = ORDER_SINCE_RE.test(String((req.body && req.body.since) || '')) ? req.body.since : null;
  try {
    res.json({ url: orderReport.signFileLink({ format, since }) });
  } catch (err) {
    res.status(500).json({ error: 'LINK_FAILED', message: err.message });
  }
});

// The link itself. No session needed: the signature is the permission, it
// expires in ten minutes, and it can only ever produce this report.
router.get('/reports/orders/file', async (req, res) => {
  const orderReport = require('../services/orderReport');
  const ok = orderReport.verifyFileLink(req.query);
  if (!ok) return res.status(403).type('text/plain').send('This report link has expired. Open the report again from the admin panel.');
  try {
    const report = await orderReport.buildOrderReport({ since: ok.since });
    res.set('Cache-Control', 'no-store');
    if (ok.format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="dayhop-orders-${report.generated_on}.csv"`);
      return res.send(orderReport.toCsv(report.rows));
    }
    const pdf = await require('../services/orderReportPdf').buildOrderReportPdf(report);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="dayhop-orders-${report.generated_on}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(err.code === 'NOT_CONFIGURED' ? 503 : 502).type('text/plain').send('Could not build the report: ' + err.message);
  }
});

router.get('/accounting/summary', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    const from = req.query.from || `${new Date().getUTCFullYear()}-01-01`;
    const to = req.query.to || undefined;
    res.json(Object.assign(await accountingSvc.summary({ from, to }), {
      income_categories: accountingSvc.INCOME_CATEGORIES,
      expense_categories: accountingSvc.EXPENSE_CATEGORIES
    }));
  } catch (err) {
    console.error('[admin] accounting summary failed:', err.message);
    res.status(500).json({ error: 'ACCOUNTING_FAILED', message: 'Could not build the summary.' });
  }
});

router.get('/accounting/entries', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    res.json({ entries: await accountingSvc.listEntries({ from: req.query.from, to: req.query.to }) });
  } catch (err) {
    console.error('[admin] accounting entries failed:', err.message);
    res.status(500).json({ error: 'ACCOUNTING_FAILED', message: 'Could not list entries.' });
  }
});

router.post('/accounting/expense', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    const b = req.body || {};
    const entry = await accountingSvc.addManualExpense({
      vendor: b.vendor,
      category: b.category,
      amount_cents: accountingSvc.parseAmountToCents(b.amount),
      currency: b.currency,
      occurred_on: b.occurred_on,
      note: b.note
    }, req.adminActor);
    res.json({ entry });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ENTRY', message: err.message });
  }
});

router.post('/accounting/entry/:id/category', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    res.json({ entry: await accountingSvc.setCategory(req.params.id, (req.body || {}).category) });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ENTRY', message: err.message });
  }
});

router.post('/accounting/entry/:id/delete', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    await accountingSvc.deleteEntry(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ENTRY', message: err.message });
  }
});

router.get('/accounting/recurring', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    res.json({ templates: await accountingSvc.listRecurring() });
  } catch (err) {
    console.error('[admin] recurring list failed:', err.message);
    res.status(500).json({ error: 'ACCOUNTING_FAILED', message: 'Could not list recurring expenses.' });
  }
});

router.post('/accounting/recurring', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    const b = req.body || {};
    const template = await accountingSvc.upsertRecurring({
      id: b.id,
      vendor: b.vendor,
      category: b.category,
      amount_cents: accountingSvc.parseAmountToCents(b.amount),
      currency: b.currency,
      day_of_month: b.day_of_month,
      note: b.note
    }, req.adminActor);
    // A template added mid-month posts this month's entry right away.
    await accountingSvc.materializeRecurring().catch(() => {});
    res.json({ template });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ENTRY', message: err.message });
  }
});

router.post('/accounting/recurring/:id/toggle', requireFinance, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    res.json({ template: await accountingSvc.setRecurringActive(req.params.id, (req.body || {}).active) });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_ENTRY', message: err.message });
  }
});

// Owner-only: sweep Stripe history into the ledger (webhook rows only exist
// from deploy time). Idempotent — run it as often as you like.
router.post('/accounting/backfill', requireOwner, async (req, res) => {
  try {
    if (!requireLedger(req, res)) return;
    const since = (req.body || {}).since || '2026-01-01';
    res.json(await accountingSvc.backfill({ since }));
  } catch (err) {
    console.error('[admin] backfill failed:', err.message);
    res.status(500).json({ error: 'BACKFILL_FAILED', message: err.message });
  }
});

// Team management (owner only): add/remove operator logins from the panel.
router.get('/team', requireAdmin, async (req, res) => {
  try {
    res.json({ team: await outreachSvc.listTeam() });
  } catch (err) {
    res.status(500).json({ error: 'TEAM_FAILED', message: err.message });
  }
});

router.post('/team', requireAdmin, async (req, res) => {
  try {
    const { email, role } = req.body || {};
    res.json({ member: await outreachSvc.addTeamMember(String(email || ''), String(role || 'operator'), req.adminActor) });
  } catch (err) {
    res.status(400).json({ error: 'INVALID_MEMBER', message: err.message });
  }
});

router.post('/team/remove', requireAdmin, async (req, res) => {
  try {
    await outreachSvc.removeTeamMember(String((req.body || {}).email || ''));
    res.json({ removed: true });
  } catch (err) {
    res.status(400).json({ error: 'TEAM_FAILED', message: err.message });
  }
});

// Ownership swap: owner-only, target must already be a deputy, and the
// email must be retyped (confirm) — this changes who controls everything.
router.post('/team/transfer-ownership', requireOwner, async (req, res) => {
  try {
    const { email, confirm } = req.body || {};
    const target = String(email || '').trim().toLowerCase();
    if (!target) return res.status(400).json({ error: 'INVALID_MEMBER', message: 'an email is required' });
    if (String(confirm || '').trim().toLowerCase() !== target) {
      return res.status(400).json({ error: 'CONFIRM_MISMATCH', message: "Retype the new owner's email to confirm the transfer." });
    }
    await outreachSvc.transferOwnership(target);
    console.log(`[admin] ownership transferred to ${target} by ${req.adminActor}`);
    res.json({ transferred: true, new_owner: target });
  } catch (err) {
    res.status(400).json({ error: 'TRANSFER_FAILED', message: err.message });
  }
});

module.exports = router;
