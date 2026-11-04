// services/goNow.js — DayHop V2
// The data behind /go ("Go Now"): "can we leave the house with a kid right
// now?" The nearest washrooms, with what is known about changing tables and
// stroller access, anywhere in Ontario. GTA live first; the rest seeded.
//
// Every place is returned in one shape (spec, Nov 3 2026):
//   { id, name, lat, lng, city, region: 'GTA' | 'Ontario',
//     washroom_status: 'open' | 'closed' | 'unknown',
//     changing_table: true | false | 'unknown',
//     stroller_friendly: true | false | 'unknown',
//     last_checked: 'YYYY-MM-DD', source, notes }
//
// Sources and what each may claim:
//   toronto_open_data  City of Toronto washroom-facilities feed, read every
//                      3 hours (the City refreshes it daily). The ONLY source
//                      allowed to say open or closed. Changing table from
//                      "Child Change Table"; stroller from "Entrance at
//                      Grade" or an access ramp. Anything not listed is
//                      'unknown', never false.
//   ottawa_open_data   City of Ottawa PublicWashrooms: CHANGE_STATION_CHILD
//                      1/0 is a real yes/no. Status 'unknown'.
//   osm                OpenStreetMap (data/go/ontario.json): changing_table
//                      and wheelchair tags, yes or no as tagged. Status
//                      'unknown'. wheelchair=yes is read as step-free and the
//                      note says so.
// DayHop's own catalog has no washroom fields yet, so it seeds nothing here.

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'go', 'ontario.json');
const TORONTO_FEED = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=1c7d1063-2562-4de3-8cd3-4cef48419f6f&limit=1000';
const LIVE_TTL_MS = 3 * 60 * 60 * 1000;

// Rough GTA box: Burlington and Oakville to Clarington, the lake to
// Georgina. Inside it a place is labelled GTA, outside it Ontario.
const inGta = (lat, lng) => lat > 43.25 && lat < 44.4 && lng > -80.2 && lng < -78.6;

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
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());

/** One City record → the spec shape. checkedOn: the day the feed was read. Pure. */
function torontoPoint(r, checkedOn = today()) {
  let g = r.geometry;
  try { if (typeof g === 'string') g = JSON.parse(g); } catch { g = null; }
  const [lng, lat] = (g && g.coordinates) || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const feat = String(r.ACCESSIBLE_FEATURES || '');
  const code = String(r.Status);
  const reason = r.Reason && r.Reason !== 'None' ? String(r.Reason) : null;
  const open = code === '1' || code === '2';
  const notes = [
    code === '2' && reason ? `Partly open: ${reason}` : null,
    !open && reason ? reason : null,
    // "View outdoor rink hours" is the City's link text, not hours.
    r.HOURS && r.HOURS !== 'None' && !/^view\b/i.test(String(r.HOURS).trim()) ? `Hours: ${String(r.HOURS).slice(0, 60)}` : null,
    r.LOCATION_DETAILS && r.LOCATION_DETAILS !== 'None' ? String(r.LOCATION_DETAILS).slice(0, 140) : null
  ].filter(Boolean).join(' · ') || null;
  return {
    id: `to-${r.ASSET_ID || r._id}`,
    name: String(r.AssetName || r.ALTERNATIVE_NAME || r.LOCATION || 'Park washroom').trim(),
    park: r.LOCATION ? String(r.LOCATION).trim() : null,
    lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
    city: 'Toronto', region: 'GTA',
    washroom_status: open ? 'open' : 'closed',
    changing_table: /child change table/i.test(feat) ? true : 'unknown',
    stroller_friendly: /entrance at grade|access ramp|ramp access/i.test(feat) ? true : 'unknown',
    last_checked: checkedOn,
    status_posted: r.PostedDate ? String(r.PostedDate).slice(0, 10) : null,
    source: 'toronto_open_data',
    notes
  };
}

/** A snapshot point (scripts/build-go-data.js) → the spec shape. Pure. */
function seededPoint(p, builtOn) {
  const yn = v => (v === true ? true : v === false ? false : 'unknown');
  const notes = [
    p.src === 'osm' && p.acc === true ? 'Step-free from the OpenStreetMap wheelchair tag' : null,
    p.seasonal === true ? 'Listed as seasonal' : null,
    p.free === false ? 'May charge a fee' : null,
    p.hours ? `Hours: ${p.hours}` : null
  ].filter(Boolean).join(' · ') || null;
  return {
    id: p.id,
    name: p.n,
    park: null,
    lat: p.lat, lng: p.lng,
    city: p.src === 'ottawa' ? 'Ottawa' : null,
    region: inGta(p.lat, p.lng) ? 'GTA' : 'Ontario',
    washroom_status: 'unknown',
    changing_table: yn(p.ct),
    stroller_friendly: p.src === 'osm' ? yn(p.acc) : 'unknown',
    last_checked: builtOn,
    seasonal: p.seasonal === true,
    source: p.src === 'ottawa' ? 'ottawa_open_data' : 'osm',
    address: p.addr || null,
    notes
  };
}

const FEED_TIMEOUT_MS = 8000;

async function refreshLive(fetcher = fetch) {
  // Bounded: a slow City server must never hang /go or a page that waits.
  const res = await fetcher(TORONTO_FEED, { headers: { 'User-Agent': 'DayHop/1.0 (admin@dayhop.quest)' }, signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`toronto washroom feed ${res.status}`);
  const j = await res.json();
  const day = today();
  const points = (j.result && j.result.records || []).map(r => torontoPoint(r, day)).filter(Boolean);
  if (!points.length) throw new Error('toronto washroom feed empty');
  live = { at: Date.now(), points, postedDate: day };
  return live;
}

/**
 * Live Toronto places; refreshes in the background when stale. Never throws.
 * wait=false never blocks on the City (callers that do not need Toronto's
 * live status, like the parade page); wait=true blocks only the very first
 * request after a restart, at most FEED_TIMEOUT_MS.
 */
async function livePoints({ wait = true } = {}) {
  if (Date.now() - live.at > LIVE_TTL_MS && !inflight) {
    inflight = refreshLive()
      .catch(err => { console.warn('[go-now] live refresh failed:', err.message); live.at = Date.now() - LIVE_TTL_MS + 10 * 60 * 1000; })
      .finally(() => { inflight = null; });
  }
  if (wait && !live.points.length && inflight) await inflight;
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

let seededCache = null;
function seeded() {
  const s = loadSnapshot();
  if (!seededCache) {
    const builtOn = s.built_at ? s.built_at.slice(0, 10) : null;
    seededCache = s.points.filter(p => p.k === 'wc').map(p => seededPoint(p, builtOn));
  }
  return seededCache;
}

/** Every washroom: live Toronto first; a seeded OSM toilet within ~40 m of a live one is dropped. */
async function allPlaces({ waitLive = true } = {}) {
  const lp = await livePoints({ wait: waitLive });
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0004 && Math.abs(a.lng - b.lng) < 0.0005;
  const rest = lp.length
    ? seeded().filter(p => !(p.source === 'osm' && p.lat > 43.55 && p.lat < 43.86 && p.lng > -79.65 && p.lng < -79.1 && lp.some(l => near(l, p))))
    : seeded();
  return [...lp, ...rest];
}

// Most OSM toilets carry no name, so a list of them reads "Public washroom"
// eight times. Name each after the nearest named place within 300 m
// (a park, library, EarlyON centre or named washroom); else leave it.
const GENERIC_NAME = /^public washroom$/i;
const NOT_A_LANDMARK = /^(public\s+)?(washrooms?|toilets?|restrooms?)?$/i;
const NEAR_M = 300;
// House copy style (the names show on the page and the share card):
// "Toronto Public Library - City Hall" reads "..., City Hall".
const undash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s-{1,2}\s/g, ', ').trim();

// id -> "Washroom near X" for every generic seeded toilet, built once per
// live refresh (live parks are landmarks too). A grid of ~330 m cells
// means each toilet checks only the 9 cells around it.
let nearNames = null;
function nearNameMap() {
  if (nearNames && nearNames.liveAt === live.at) return nearNames.byId;
  const ci = lat => Math.floor(lat / 0.003), cj = lng => Math.floor(lng / 0.004);
  const grid = new Map();
  const add = (lat, lng, raw) => {
    const name = undash(String(raw || '').replace(/\s+(public\s+)?washrooms?$/i, ''));
    if (NOT_A_LANDMARK.test(name)) return;
    const k = `${ci(lat)}:${cj(lng)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ lat, lng, name });
  };
  for (const p of loadSnapshot().points) if (p.n && !GENERIC_NAME.test(p.n)) add(p.lat, p.lng, p.n);
  for (const p of live.points) if (p.park) add(p.lat, p.lng, p.park);
  const byId = new Map();
  for (const p of seeded()) {
    if (!GENERIC_NAME.test(p.name)) continue;
    let best = null, bestD = NEAR_M;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const l of grid.get(`${ci(p.lat) + a}:${cj(p.lng) + b}`) || []) {
          const d = distM(p.lat, p.lng, l.lat, l.lng);
          if (d < bestD) { bestD = d; best = l; }
        }
      }
    }
    if (best) byId.set(p.id, `Washroom near ${best.name}`);
  }
  nearNames = { liveAt: live.at, byId };
  return byId;
}
function withNearName(p) {
  const name = GENERIC_NAME.test(p.name) && nearNameMap().get(p.id);
  return name ? Object.assign({}, p, { name }) : p;
}

/**
 * Nearest places to (lat, lng), matching EVERY active filter:
 *   open: washroom_status === 'open'; changing: changing_table === true;
 *   stroller: stroller_friendly === true.
 */
async function nearest({ lat, lng, filters = {}, limit = 8, waitLive = true }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('bad point');
  const all = await allPlaces({ waitLive });
  const scored = [];
  for (const p of all) {
    if (filters.open && p.washroom_status !== 'open') continue;
    // winter: drop anything closed now or listed as seasonal (summer only).
    if (filters.winter && (p.washroom_status === 'closed' || p.seasonal === true)) continue;
    if (filters.changing && p.changing_table !== true) continue;
    if (filters.stroller && p.stroller_friendly !== true) continue;
    if (Math.abs(p.lat - lat) > 0.55 || Math.abs(p.lng - lng) > 0.75) continue; // about 60 km
    scored.push([distM(lat, lng, p.lat, p.lng), p]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, Math.min(Math.max(1, limit), 60)).map(([d, p]) => Object.assign({ dist: Math.round(d) }, withNearName(p)));
}

async function byId(id) {
  const p = (await allPlaces()).find(x => x.id === id);
  return p ? withNearName(p) : null;
}

function meta() {
  const s = loadSnapshot();
  return {
    toronto_checked: live.postedDate,
    ontario_seeded: s.built_at ? s.built_at.slice(0, 10) : null,
    counts: { toronto_live: live.points.length, seeded: seeded().length }
  };
}

module.exports = { nearest, byId, meta, allPlaces, torontoPoint, seededPoint, distM, refreshLive, inGta,
  _setLive: v => { live = v; } };
