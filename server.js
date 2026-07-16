// server.js — DayHop V2
require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(compression());
app.use(cors());
// Stripe webhook needs the raw body for signature verification, so it mounts
// BEFORE the JSON parser. Everything else gets parsed JSON as usual.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billingWebhook'));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
app.use('/api/geo', require('./routes/geo'));
app.use('/api/events', require('./routes/events'));
app.use('/api/config', require('./routes/config'));
app.use('/api/adventures', require('./routes/adventures'));
app.use('/api/community', require('./routes/community'));
app.use('/api/shortlist', require('./routes/shortlist'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/guides', require('./routes/guides'));
app.use('/api/track', require('./routes/track'));
app.use('/api/admin', require('./routes/admin'));

const { dbStatus } = require('./services/db');

app.get('/health', (req, res) => {
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
      toronto_open_data: true, // keyless public feed, always on for GTA requests
      york_open_data: process.env.YORK_OPEN_DATA_ENABLED === 'true',
      stripe: require('./services/billing').status(),
      admin_metrics: Boolean(process.env.ADMIN_KEY)
    }
  });
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

app.listen(PORT, () => {
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
