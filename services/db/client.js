// services/db/client.js — Supabase client wrapper
// Reads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY from env.
// These may not exist yet — every consumer must check isConfigured() first.
// The client is created lazily so the app boots fine with no credentials and
// (like the Grok/Maps/Viator services) simply degrades to in-memory storage.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// We need a URL and at least one key. If a service-role/secret key is set the
// server uses it (bypasses RLS). Otherwise it uses the publishable/anon key,
// in which case RLS governs access — see the prototype policies in
// db/schema.sql that allow the anon role to read/write pre-auth (Phase 2).
function isConfigured() {
  return Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY));
}

let _client = null;

function getClient() {
  if (!isConfigured()) {
    const err = new Error('Supabase is not configured');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  if (!_client) {
    // require lazily so a missing package never crashes boot in memory mode.
    const { createClient } = require('@supabase/supabase-js');
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _client;
}

function status() {
  return {
    configured: isConfigured(),
    url_set: Boolean(SUPABASE_URL),
    service_key: Boolean(SUPABASE_SERVICE_KEY),
    anon_key: Boolean(SUPABASE_ANON_KEY)
  };
}

module.exports = { isConfigured, getClient, status };
