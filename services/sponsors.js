// services/sponsors.js — DayHop V2 (sponsored venue placements)
// The B2B revenue layer: venues pay a flat monthly fee ($99/299/499 tiers,
// Stripe payment links) for premium visibility. The trust contract survives
// the money: sponsored cards are ALWAYS labeled, appear only when genuinely
// relevant (distance/season/advisory gated — a paused or out-of-season
// sponsor simply doesn't show), advisories apply to sponsors identically,
// and the feed carries AT MOST ONE sponsored slot. Scarcity is the product.
//
// Storage mirrors autoCatalog.js: in-memory map hydrated from the Supabase
// `sponsors` table via the service key; without one, admin-added sponsors
// live in process memory until restart (fail-soft — founding partners can
// be hand-inserted the moment a deal closes, migration or not).

const dbClient = require('./db/client');
const { isCatalogSeasonEligible } = require('../data/seasons');

const TIERS = new Set(['featured', 'spotlight', 'anchor']);
const STATUSES = new Set(['active', 'paused', 'ended']);
// Relevance gate: a sponsor only shows to users planning near it.
const MAX_RELEVANT_KM = 60;

const byId = new Map(); // id -> row {id, entry, tier, status, ...}

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

let loadPromise = null;
function loadFromDb() {
  if (loadPromise) return loadPromise;
  if (!hasServiceKey()) { loadPromise = Promise.resolve(); return loadPromise; }
  loadPromise = dbClient.getClient().from('sponsors').select('*').neq('status', 'ended').limit(200)
    .then(({ data, error }) => {
      if (error) throw error;
      for (const row of data || []) byId.set(row.id, row);
      if (data && data.length) console.log(`[sponsors] loaded ${data.length} placement${data.length === 1 ? '' : 's'}`);
    })
    .catch(err => console.warn('[sponsors] load failed (memory-only until restart):', err.message));
  return loadPromise;
}

function list() {
  loadFromDb();
  return [...byId.values()];
}

const TIER_RANK = { anchor: 3, spotlight: 2, featured: 1 };

function haversineKm(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Pick AT MOST ONE sponsor candidate for a feed. Gates, in order:
 * active status → date window (starts/ends) → seasonal eligibility →
 * distance (when both sides have coords) → shelter advisory for outdoor
 * categories. Ties go to the higher tier (that's what Anchor buys).
 * Returns a candidate-shaped object or null. Pure over `list()` — tested.
 */
function pickFor({ coords, month, shelter } = {}, rows = list()) {
  const now = Date.now();
  const eligible = rows.filter(r => {
    if (r.status !== 'active' || !r.entry) return false;
    if (r.starts_at && Date.parse(r.starts_at) > now) return false;
    if (r.ends_at && Date.parse(r.ends_at) < now) return false;
    if (month && !isCatalogSeasonEligible(r.entry.seasonal || null, month)) return false;
    if (shelter && ['water', 'adventures'].includes(r.entry.category)) return false;
    if (coords && r.entry.lat != null && r.entry.lng != null) {
      if (haversineKm(coords, { lat: r.entry.lat, lng: r.entry.lng }) > MAX_RELEVANT_KM) return false;
    }
    return true;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0));
  const s = eligible[0];
  const candidate = Object.assign({}, s.entry, {
    id: s.id,
    source: 'sponsor',
    sponsored: true,
    tier: s.tier
  });
  if (coords && s.entry.lat != null && s.entry.lng != null) {
    candidate.distance_km = Math.round(haversineKm(coords, { lat: s.entry.lat, lng: s.entry.lng }) * 10) / 10;
  }
  return candidate;
}

/** Admin add/update. `entry` is catalog-shaped (title/category/tags/…). */
async function upsert({ id, entry, tier, status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id }) {
  if (!entry || !entry.title) throw new Error('entry.title is required');
  if (!TIERS.has(tier)) throw new Error(`tier must be one of: ${[...TIERS].join(', ')}`);
  const rowId = id || 'spon-' + String(entry.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const row = {
    id: rowId,
    entry,
    tier,
    status: STATUSES.has(status) ? status : 'active',
    starts_at: starts_at || new Date().toISOString(),
    ends_at: ends_at || null,
    stripe_customer_id: stripe_customer_id || null,
    stripe_subscription_id: stripe_subscription_id || null
  };
  byId.set(rowId, row);
  if (hasServiceKey()) {
    try {
      const { error } = await dbClient.getClient().from('sponsors').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      console.warn('[sponsors] persist failed (kept in memory):', err.message);
    }
  } else {
    console.warn(`[sponsors] "${entry.title}" added in memory only (no service key — lost on restart)`);
  }
  return row;
}

async function setStatus(id, status) {
  if (!STATUSES.has(status)) throw new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
  const row = byId.get(id);
  if (!row) throw new Error(`unknown sponsor: ${id}`);
  row.status = status;
  if (hasServiceKey()) {
    try {
      const { error } = await dbClient.getClient().from('sponsors').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.warn('[sponsors] status persist failed:', err.message);
    }
  }
  return row;
}

/**
 * 30-day performance per sponsor — the monthly-report numbers that retain
 * sponsors. Impressions = browse feeds that carried the sponsor (browse
 * meta.sponsor); engagements = clicks/adds/opens on the sponsor's card
 * (events by idea_id). Empty (not fabricated) without the service key.
 */
async function stats(ids, days = 30) {
  const out = new Map(ids.map(id => [id, { impressions: 0, engagements: 0 }]));
  if (!hasServiceKey() || !ids.length) return out;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  try {
    const db = dbClient.getClient();
    const [feeds, engage] = await Promise.all([
      db.from('events').select('meta').eq('type', 'browse_feed').gte('created_at', since).limit(20000),
      db.from('events').select('idea_id, type').in('idea_id', ids).gte('created_at', since).limit(5000)
    ]);
    for (const e of feeds.data || []) {
      const sid = e.meta && e.meta.sponsor;
      if (sid && out.has(sid)) out.get(sid).impressions++;
    }
    const ENGAGE = new Set(['booking_click', 'maps_click', 'shortlist_add', 'card_open']);
    for (const e of engage.data || []) {
      if (ENGAGE.has(e.type) && out.has(e.idea_id)) out.get(e.idea_id).engagements++;
    }
  } catch (err) {
    console.warn('[sponsors] stats failed:', err.message);
  }
  return out;
}

module.exports = { list, pickFor, upsert, setStatus, stats, MAX_RELEVANT_KM };
