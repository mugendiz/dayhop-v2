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
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Generous but real limit on the AI endpoint — it's the expensive one.
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});

app.use('/api/generate', generateLimiter, require('./routes/generate'));
app.use('/api/places', require('./routes/places'));
app.use('/api/events', require('./routes/events'));
app.use('/api/adventures', require('./routes/adventures'));
app.use('/api/community', require('./routes/community'));
app.use('/api/shortlist', require('./routes/shortlist'));

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
      getyourguide: Boolean(process.env.GETYOURGUIDE_API_KEY)
    }
  });
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
