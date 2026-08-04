// server.js — DayHop V2
require('dotenv').config();
// Must load before any service module: installs keep-alive agents on
// axios.defaults so every axios.create() below inherits them.
require('./services/httpAgent');
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Render terminates TLS at a reverse proxy. Without this, req.ip is the
// proxy's address for every visitor, so all users share ONE rate-limit
// bucket (and express-rate-limit v7 flags the mismatch as an error).
app.set('trust proxy', 1);

app.use(helmet({
  // The SPA runs inline <script> blocks and pulls GSAP/Supabase/fonts from
  // jsdelivr, Fontshare, and Google — a real CSP needs its own dedicated
  // pass. Helmet's other headers (nosniff, frame denial, HSTS, …) apply.
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
// Stripe webhook needs the raw body for signature verification, so it mounts
// BEFORE the JSON parser. Everything else gets parsed JSON as usual.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billingWebhook'));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // Icons are effectively immutable — a day of caching is safe. The app
    // shell (HTML/JS/CSS) stays on ETag revalidation: the service worker
    // re-downloads it through the HTTP cache on every version bump, so a
    // long max-age there could pin a stale deploy into the new SW cache.
    if (/[\\/]icons[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Attach the signed-in user (if any) to every request before routes run.
const { attachUser } = require('./middleware/auth');
app.use(attachUser);

// Moderation: banned callers get 403 on the API (admin/config routes and the
// Stripe webhook — mounted above — stay reachable; admins are never blocked).
const { banGuard } = require('./services/moderation');
app.use('/api', banGuard);

// Generous but real limit on the AI endpoint — it's the expensive one.
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});

app.use('/api/generate', generateLimiter, require('./routes/generate'));

// Instant discovery feed: no LLM and cached, but it still fans out to
// partner APIs on a cache miss — keep a real (if looser) ceiling on it.
const browseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/browse', browseLimiter, require('./routes/browse'));

// "Surprise me" / "Next" feed: no LLM, but never cached (per-user exclude
// lists) — every call fans out to partner APIs, so keep the ceiling tight
// enough that Next spam-clicks can't run unbounded.
const surpriseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/surprise', surpriseLimiter, require('./routes/surprise'));

// Detail enrichment: one Grok + one Places call per uncached place — cached
// 24h server-side, but still worth a ceiling against click-spamming Details.
const detailsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/details', detailsLimiter, require('./routes/details'));
app.use('/api/places', require('./routes/places'));
app.use('/api/photo', require('./routes/photo'));
// Geo lookups: reverse geocode fires once per location share, autocomplete
// once per (debounced) keystroke — cheap Essentials-tier calls, but typed
// input deserves a ceiling that absorbs fast typists without inviting abuse.
const geoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/geo', geoLimiter, require('./routes/geo'));
app.use('/api/events', require('./routes/events'));
app.use('/api/config', require('./routes/config'));
app.use('/api/adventures', require('./routes/adventures'));
app.use('/api/community', require('./routes/community'));
app.use('/api/shortlist', require('./routes/shortlist'));
app.use('/api/billing', require('./routes/billing'));

// A plan-less POST /api/guides triggers a Grok call server-side — the save
// path must not be a free unmetered AI endpoint just because /generate is.
const guidesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/guides', guidesLimiter, require('./routes/guides'));

// Anonymous event sink: cheap per call, but unmetered it invites unbounded
// table growth and funnel pollution. 60/min covers any honest session.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/track', trackLimiter, require('./routes/track'));
app.use('/api/admin', require('./routes/admin'));

const { dbStatus } = require('./services/db');

// Same header + constant-time compare as routes/admin.js — /health detail
// is operator information.
function adminKeyOk(req) {
  const expected = process.env.ADMIN_KEY || '';
  const provided = req.headers['x-admin-key'];
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

app.get('/health', (req, res) => {
  // Anonymous callers (uptime checks, the keep-alive ping) get a heartbeat.
  // Which API keys exist, the storage backend, and whether ADMIN_KEY is set
  // is recon material — that detail is for operators (dev, admin account,
  // or the admin key header).
  const { isAdmin } = require('./services/entitlements');
  if (isProd && !isAdmin(req.user) && !adminKeyOk(req)) {
    return res.json({ status: 'ok', version: '2.0' });
  }
  res.json({
    status: 'ok',
    version: '2.0',
    phase: 'Worldwide — real venues, weather, and bookable activities',
    storage: dbStatus(),
    integrations: {
      grok: Boolean(process.env.GROK_API_KEY),
      google_maps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      openweather: Boolean(process.env.OPENWEATHER_API_KEY),
      viator: Boolean(process.env.VIATOR_API_KEY),
      getyourguide: Boolean(process.env.GETYOURGUIDE_API_KEY),
      ticketmaster: Boolean(process.env.TICKETMASTER_API_KEY),
      eventbrite: Boolean(process.env.EVENTBRITE_PRIVATE_TOKEN && String(process.env.EVENTBRITE_ORG_IDS || '').trim()),
      seeker: Boolean(process.env.SEEKER_API_KEY && process.env.SEEKER_API_URL),
      attractions_ontario: true, // keyless WP REST feed, always on for GTA requests
      civic_calendars: true, // keyless municipal calendars, always on for GTA requests
      toronto_open_data: true, // keyless public feed, always on for GTA requests
      york_open_data: process.env.YORK_OPEN_DATA_ENABLED === 'true',
      stripe: require('./services/billing').status(),
      admin_metrics: Boolean(process.env.ADMIN_KEY)
    }
  });
});

// Unknown API paths get a JSON 404 — never the SPA shell with a 200,
// which silently confuses API clients. Must come after every /api mount.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'No such API endpoint.' });
});

// Public shared-guide page: /g/<share_id> — the page itself fetches the
// guide JSON from /api/guides/shared/<share_id>.
app.get('/g/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide.html'));
});

// SPA fallback — must stay last.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler — catches anything thrown synchronously in routes.
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong on our end.'
  });
});

// Keep-alive: Render's free tier spins the instance down after ~15 min
// without inbound traffic, and the next visitor eats a 30-60 s cold start —
// fatal for a shared or demo link. While the process is up, pinging our own
// public URL counts as inbound traffic and keeps it warm. Render injects
// RENDER_EXTERNAL_URL automatically; set KEEP_ALIVE_URL to override, or
// KEEP_ALIVE_URL=off to disable (e.g. after moving to a paid instance).
const keepAliveBase = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (isProd && keepAliveBase && keepAliveBase !== 'off') {
  const ping = () => fetch(new URL('/health', keepAliveBase)).catch(() => {});
  setInterval(ping, 10 * 60 * 1000).unref();
  console.log(`[keepalive] pinging ${keepAliveBase}/health every 10 min`);
}

// Discovery autopilot: every SUNDAY AT MIDNIGHT (Toronto time) scan
// Canada-wide local media, verify finds (Google Places + Grok), and
// publish passers into the live catalog. The admin "Scan
// feeds" button still works on demand any day. A 20-min clock check with a
// ran-recently guard is DST-proof and survives restarts mid-window; the
// keep-alive ping keeps the free-tier instance awake for it.
// Set DISCOVERY_AUTO=off to disable the schedule (manual scans unaffected).
if (process.env.GROK_API_KEY && process.env.DISCOVERY_AUTO !== 'off') {
  const runDiscovery = () => require('./services/newOpenings').collect()
    .then(d => {
      const published = (d.items || []).filter(i => i.auto && i.auto.added).length;
      if (published) console.log(`[discovery] autopilot published ${published} new entr${published === 1 ? 'y' : 'ies'}`);
    })
    .catch(err => console.warn('[discovery] auto scan failed:', err.message));

  let lastDiscoveryRun = 0;
  const isSundayMidnightToronto = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', hour12: false
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return parts.weekday === 'Sun' && (parts.hour === '00' || parts.hour === '24');
  };
  setInterval(() => {
    if (isSundayMidnightToronto() && Date.now() - lastDiscoveryRun > 12 * 60 * 60 * 1000) {
      lastDiscoveryRun = Date.now();
      console.log('[discovery] Sunday-midnight Canada-wide scan starting');
      runDiscovery();
    }
  }, 20 * 60 * 1000).unref();
}

const server = app.listen(PORT, () => {
  console.log(`🚀 DayHop V2 running on http://localhost:${PORT}`);
  if (!process.env.GROK_API_KEY) {
    console.warn('⚠️  GROK_API_KEY not set — AI planning will return 503 until configured.');
  }
  if (!dbStatus().persistent) {
    console.warn('⚠️  Supabase not configured — using in-memory storage (data is wiped on restart). Set SUPABASE_URL + keys to persist.');
  }
  if (!isProd) {
    console.log('   Running in development mode.');
  }
});

// Render sends SIGTERM on every deploy — finish in-flight requests instead
// of dropping them mid-response.
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — draining connections');
  server.close(() => process.exit(0));
});
