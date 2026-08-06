// routes/config.js — DayHop V2
// Public client config. Exposes only publishable values (the Supabase URL and
// the publishable/anon key are designed to be shipped to the browser); never
// put the service-role key here. The frontend fetches this to initialize the
// Supabase Auth client.
const express = require('express');
const router = express.Router();

const { getSpotlight } = require('../services/spotlight');

router.get('/', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || null;
  // Pure env + date math, refetched on every page load — let the browser
  // keep it briefly. The spotlight only changes at a Toronto day boundary.
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    supabaseUrl,
    supabaseAnonKey,
    authEnabled: Boolean(supabaseUrl && supabaseAnonKey),
    // Meta Pixel ID is public by design (it ships in every advertiser's page
    // source). pixel.js only injects Meta's script when this is non-null.
    metaPixelId: process.env.META_PIXEL_ID || null,
    // Seasonal spotlight: drives the hero eyebrow and holiday chrome
    // client-side (World Cup while live, then the next stat holiday).
    spotlight: getSpotlight()
  });
});

module.exports = router;
