// services/moderation.js — DayHop V2
// Ban list + request guard. Layered like everything else in the app:
//   - the in-memory map always works (no DB → bans last until restart);
//   - with SUPABASE_SERVICE_KEY, bans persist in public.banned_users and are
//     re-merged into memory on a throttled sync (merge-only: a wrong service
//     key reads as zero rows, and that must never erase live bans).
// Ban keys mirror analytics owner keys: user id, guest id, or "ip-<addr>".

const dbClient = require('./db/client');
const { isAdmin } = require('./entitlements');

const banned = new Map(); // owner_key -> { owner_key, reason, banned_by, created_at }
let lastSync = 0;
const SYNC_MS = 60 * 1000;

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

async function syncFromDb(force) {
  if (!hasServiceKey()) return;
  if (!force && Date.now() - lastSync < SYNC_MS) return;
  lastSync = Date.now();
  try {
    const { data, error } = await dbClient.getClient()
      .from('banned_users').select('*').limit(10000);
    if (error) throw error;
    for (const row of data || []) banned.set(row.owner_key, row);
  } catch (err) {
    console.warn('[moderation] ban-list sync failed (memory list still active):', err.message);
  }
}

async function isBanned(keys) {
  await syncFromDb(false);
  return keys.some(k => banned.has(k));
}

async function ban(ownerKey, { reason, bannedBy } = {}) {
  const row = {
    owner_key: ownerKey,
    reason: reason ? String(reason).slice(0, 300) : null,
    banned_by: bannedBy ? String(bannedBy).slice(0, 120) : null,
    created_at: new Date().toISOString()
  };
  banned.set(ownerKey, row);
  if (dbClient.isConfigured()) {
    const { error } = await dbClient.getClient()
      .from('banned_users').upsert(row, { onConflict: 'owner_key' });
    if (error) console.warn('[moderation] ban persist failed (memory-only until restart):', error.message);
  }
  return row;
}

async function unban(ownerKey) {
  banned.delete(ownerKey);
  if (dbClient.isConfigured()) {
    const { error } = await dbClient.getClient()
      .from('banned_users').delete().eq('owner_key', ownerKey);
    if (error) console.warn('[moderation] unban persist failed:', error.message);
  }
}

async function list() {
  await syncFromDb(true);
  return [...banned.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// Express guard for /api: a banned caller gets 403 on everything except the
// admin/config routes (so an admin can always undo a mistake) — and admins
// themselves are never blocked. Any lookup error fails OPEN: moderation must
// never take the product down.
function banGuard(req, res, next) {
  if (req.path.startsWith('/admin') || req.path.startsWith('/config')) return next();
  if (isAdmin(req.user)) return next();

  const keys = [`ip-${req.ip}`];
  if (req.user && req.user.id) keys.push(req.user.id);
  const guest = req.body && req.body.owner_id;
  if (typeof guest === 'string' && guest.trim()) keys.push(guest.trim().slice(0, 80));

  isBanned(keys).then(hit => {
    if (!hit) return next();
    res.status(403).json({
      error: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended. If you think this is a mistake, contact support.'
    });
  }).catch(() => next());
}

module.exports = { isBanned, ban, unban, list, banGuard };
