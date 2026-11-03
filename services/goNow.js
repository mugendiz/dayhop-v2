// services/goNow.js — DayHop V2
// The data behind /go ("Go Now"): the nearest washrooms, changing tables and
// family stops to a point, anywhere in Ontario.
//
// Two layers:
//   1. Toronto park washrooms, LIVE: the City's washroom-facilities feed
//      (refreshed daily by the City; read here every 3 hours). This is the
//      only source with a real open/closed status, and the page says so.
//   2. The Ontario snapshot (data/go/ontario.json, scripts/build-go-data.js):
//      OpenStreetMap toilets and libraries, City of Ottawa public washrooms,
//      Toronto EarlyON centres. Status is "Seasonal" where the source says
//      so and "Not live" otherwise; open/closed is never guessed.
//
// Badges come only from source fields: changing table (Toronto "Child
// Change Table", Ottawa CHANGE_STATION_CHILD, OSM changing_table/diaper),
// step-free entrance (Toronto "Entrance at Grade"/"Ramp"), accessible
// (Toronto "Accessible Stall", OSM wheelchair=yes), free (Ottawa/Toronto
// city facilities, OSM fee=no). A missing field stays null.

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'go', 'ontario.json');
const TORONTO_FEED = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=1c7d1063-2562-4de3-8cd3-4cef48419f6f&limit=1000';
const LIVE_TTL_MS = 3 * 60 * 60 * 1000;

let snapshot = null;
function loadSnapshot() {
  if (!snapshot) {
    try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')); }
    catch (err) { console.warn('[go-now] snapshot missing:', err.message); snapshot = { built_at: null, points: [] }; }
  }
  return snapshot;
}

// ---------- Toronto live ----------
let live = { at: 0, points: [], postedDate: null };
let inflight = null;

/** Map one City record to a point. Pure (exported for tests). */
function torontoPoint(r) {
  let g = r.geometry;
  try { if (typeof g === 'string') g = JSON.parse(g); } catch { g = null; }
  const [lng, lat] = (g && g.coordinates) || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const feat = String(r.ACCESSIBLE_FEATURES || '');
  const code = String(r.Status);
  const reason = r.Reason && r.Reason !== 'None' ? String(r.Reason) : null;
  const status = code === '1' ? 'open' : code === '2' ? 'partial' : /season/i.test(reason || '') ? 'season' : 'closed';
  return {
    id: `to-${r.ASSET_ID || r._id}`, k: 'wc', src: 'toronto',
    n: String(r.AssetName || r.ALTERNATIVE_NAME || r.LOCATION || 'Park washroom').trim(),
    park: r.LOCATION ? String(r.LOCATION).trim() : null,
    lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
    status, reason,
    ct: /child change table/i.test(feat) ? true : null,
    stepfree: /entrance at grade|access ramp|ramp access/i.test(feat) ? true : null,
    acc: /accessible stall/i.test(feat) || /accessible/i.test(String(r.TYPE || '')) ? true : null,
    free: true,
    hours: r.HOURS && r.HOURS !== 'None' ? String(r.HOURS).slice(0, 80) : null,
    where: r.LOCATION_DETAILS && r.LOCATION_DETAILS !== 'None' ? String(r.LOCATION_DETAILS).slice(0, 160) : null,
    addr: r.ADDRESS ? String(r.ADDRESS).trim() : null,
    checked: r.PostedDate ? String(r.PostedDate).slice(0, 10) : null
  };
}

async function refreshLive(fetcher = fetch) {
  const res = await fetcher(TORONTO_FEED, { headers: { 'User-Agent': 'DayHop/1.0 (admin@dayhop.quest)' } });
  if (!res.ok) throw new Error(`toronto washroom feed ${res.status}`);
  const j = await res.json();
  const points = (j.result && j.result.records || []).map(torontoPoint).filter(Boolean);
  if (!points.length) throw new Error('toronto washroom feed empty');
  live = { at: Date.now(), points, postedDate: points.map(p => p.checked).filter(Boolean).sort().pop() || null };
  return live;
}

/** Live Toronto points; refreshes in the background when stale. Never throws. */
async function livePoints() {
  if (Date.now() - live.at > LIVE_TTL_MS && !inflight) {
    inflight = refreshLive().catch(err => { console.warn('[go-now] live refresh failed:', err.message); live.at = Date.now() - LIVE_TTL_MS + 10 * 60 * 1000; })
      .finally(() => { inflight = null; });
    if (!live.points.length) await inflight; // first request waits; later ones never do
  }
  return live.points;
}

// ---------- queries ----------
const R = 6371000;
function distM(aLat, aLng, bLat, bLng) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Every point, live Toronto first; snapshot toilets within ~40 m of a live one are dropped. */
async function allPoints() {
  const lp = await livePoints();
  const snap = loadSnapshot().points;
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0004 && Math.abs(a.lng - b.lng) < 0.0005;
  const rest = lp.length ? snap.filter(p => !(p.k === 'wc' && p.src === 'osm' && p.lat > 43.55 && p.lat < 43.86 && lp.some(l => near(l, p)))) : snap;
  return [...lp, ...rest];
}

/** The label a card shows. Only Toronto's feed is live. */
function statusOf(p) {
  if (p.src === 'toronto') {
    return { open: { key: 'open', label: 'Open' }, partial: { key: 'open', label: 'Partly open' },
      season: { key: 'closed', label: 'Closed for the season' }, closed: { key: 'closed', label: p.reason ? `Closed: ${p.reason}` : 'Closed' } }[p.status];
  }
  if (p.seasonal) return { key: 'unknown', label: 'Seasonal' };
  return { key: 'unknown', label: 'Status not live' };
}

const LAYERS = new Set(['wc', 'ct', 'stop']);

/**
 * Nearest points to (lat, lng).
 * layer: 'wc' washrooms | 'ct' changing tables | 'stop' family stops
 * filters: { open, winter, free } (booleans)
 */
async function nearest({ lat, lng, layer = 'wc', filters = {}, limit = 8 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('bad point');
  if (!LAYERS.has(layer)) layer = 'wc';
  const pts = await allPoints();
  const keep = p => {
    if (layer === 'wc' && p.k !== 'wc') return false;
    if (layer === 'stop' && p.k !== 'stop') return false;
    if (layer === 'ct' && p.ct !== true) return false;
    if (filters.open && !(p.src === 'toronto' && (p.status === 'open' || p.status === 'partial'))) return false;
    if (filters.winter && ((p.src === 'toronto' && p.status === 'season') || p.seasonal === true)) return false;
    if (filters.free && p.free === false) return false;
    return true;
  };
  const scored = [];
  for (const p of pts) {
    if (!keep(p)) continue;
    // Cheap box first (about 60 km), then the real distance.
    if (Math.abs(p.lat - lat) > 0.55 || Math.abs(p.lng - lng) > 0.75) continue;
    scored.push([distM(lat, lng, p.lat, p.lng), p]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  const top = scored.slice(0, Math.min(Math.max(1, limit), 40));
  // Family stops: how far is the nearest washroom that is not closed?
  const openWc = layer === 'stop' ? pts.filter(p => p.k === 'wc' && !(p.src === 'toronto' && (p.status === 'season' || p.status === 'closed'))) : [];
  return top.map(([d, p]) => {
    const out = Object.assign({}, p, { dist: Math.round(d), statusLabel: statusOf(p) });
    if (layer === 'stop') {
      let best = Infinity;
      for (const w of openWc) {
        if (Math.abs(w.lat - p.lat) > 0.01 || Math.abs(w.lng - p.lng) > 0.014) continue;
        best = Math.min(best, distM(p.lat, p.lng, w.lat, w.lng));
      }
      out.wcDist = Number.isFinite(best) ? Math.round(best) : null;
    }
    return out;
  });
}

async function byId(id) {
  const pts = await allPoints();
  const p = pts.find(x => x.id === id);
  return p ? Object.assign({}, p, { statusLabel: statusOf(p) }) : null;
}

function meta() {
  const s = loadSnapshot();
  return { snapshot_built: s.built_at ? s.built_at.slice(0, 10) : null, toronto_checked: live.postedDate, counts: s.counts || {} };
}

module.exports = { nearest, byId, meta, torontoPoint, statusOf, distM, refreshLive, _setLive: v => { live = v; } };
