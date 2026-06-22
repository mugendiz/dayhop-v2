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

// A client scoped to a signed-in user: the user's access token rides along on
// every PostgREST request, so RLS policies that key off auth.uid() apply.
// Used for the gated shortlist/adventure routes once auth is in play (Phase 3).
const _userClients = new Map();            // accessToken -> { client, ts }
const USER_CLIENT_TTL_MS = 60 * 60 * 1000; // evict after 1h to bound growth

function getUserClient(accessToken) {
  if (!isConfigured()) {
    const err = new Error('Supabase is not configured');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  const now = Date.now();
  const cached = _userClients.get(accessToken);
  if (cached && now - cached.ts < USER_CLIENT_TTL_MS) return cached.client;
  // Drop stale entries (expired tokens) so the map can't grow unbounded.
  for (const [token, entry] of _userClients) {
    if (now - entry.ts >= USER_CLIENT_TTL_MS) _userClients.delete(token);
  }
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  _userClients.set(accessToken, { client, ts: now });
  return client;
}

function status() {
  return {
    configured: isConfigured(),
    url_set: Boolean(SUPABASE_URL),
    service_key: Boolean(SUPABASE_SERVICE_KEY),
    anon_key: Boolean(SUPABASE_ANON_KEY)
  };
}

module.exports = { isConfigured, getClient, getUserClient, status };
