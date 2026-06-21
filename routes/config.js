// routes/config.js — DayHop V2
// Public client config. Exposes only publishable values (the Supabase URL and
// the publishable/anon key are designed to be shipped to the browser); never
// put the service-role key here. The frontend fetches this to initialize the
// Supabase Auth client.
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || null;
  res.json({
    supabaseUrl,
    supabaseAnonKey,
    authEnabled: Boolean(supabaseUrl && supabaseAnonKey)
  });
});

module.exports = router;
