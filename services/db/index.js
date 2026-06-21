// services/db/index.js — picks the storage backend once at boot and exposes a
// single `store` the routes use without caring which backend is live.
//
// Selection order (matches the app's graceful-degradation pattern):
//   1. DB_BACKEND=memory   → force in-memory (handy for local dev/tests)
//   2. Supabase configured → use Supabase
//   3. otherwise           → in-memory fallback (no credentials yet)

const client = require('./client');
const memoryStore = require('./memoryStore');

let store;
let backend;

const forced = (process.env.DB_BACKEND || '').toLowerCase();

if (forced === 'memory') {
  store = memoryStore;
  backend = 'memory (forced by DB_BACKEND)';
} else if (client.isConfigured()) {
  try {
    store = require('./supabaseStore');
    backend = 'supabase';
  } catch (e) {
    console.warn('[db] Supabase init failed — falling back to in-memory:', e.message);
    store = memoryStore;
    backend = 'memory (supabase init failed)';
  }
} else {
  store = memoryStore;
  backend = 'memory (no Supabase credentials)';
}

console.log(`[db] storage backend: ${backend}`);

function dbStatus() {
  return {
    backend: backend.startsWith('supabase') ? 'supabase' : 'memory',
    detail: backend,
    persistent: backend.startsWith('supabase'),
    supabase: client.status()
  };
}

module.exports = { store, backend, dbStatus };
