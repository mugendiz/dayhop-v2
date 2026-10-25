// services/osmTravel.js — DayHop V2
// The travel layer of a personalized guide, from OpenStreetMap via Overpass:
// where to sleep with any vehicle (campgrounds, RV and caravan sites, dump
// stations, highway service centres and rest areas), and how to move under
// your own power (named cycling and hiking routes, bike-share docks).
//
// Same rules as services/osmNature.js: keyless, a descriptive User-Agent
// (Overpass refuses default ones), one polite query, cached. Only NAMED
// features become entries, except dump stations, which rarely carry a name
// and are useful anyway. We never claim a place allows overnight parking:
// the guide links each entry to its OSM record and to live directions, and
// says to confirm rules on arrival.
//
// Data © OpenStreetMap contributors, ODbL. The guide's credits page says so.

const axios = require('axios');
const apiCache = require('./apiCache');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const client = axios.create({
  timeout: 60000,
  headers: {
    'User-Agent': 'DayHop/2.0 (Ontario trip guides; contact zokaamazon@gmail.com)',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

// Four small queries, not one big one. The public Overpass server is often
// at capacity (Oct 2026: one combined 45 km query took 60 s or timed out,
// and parallel requests came back "502, all workers busy"), so each part is
// sent alone, one after another, retried with backoff, and cached on its
// own: a busy server costs us one section of one guide, never the build.
// Radii in metres: a campground is worth a drive, a bike dock is not.
// Route relations print tags only: the centre of a 400 km trail relation is
// expensive to compute, and a route is listed by name anyway.
const PARTS = [
  { id: 'sleep', q: at => `nwr${at(30000)}[tourism~"^(camp_site|caravan_site)$"][name];out center tags 80;` },
  { id: 'road', q: at => `nwr${at(60000)}[highway~"^(services|rest_area)$"][name];out center tags 40;` },
  { id: 'dumpbike', q: at => `node${at(40000)}[amenity=sanitary_dump_station];out 20;nwr${at(15000)}[amenity=bicycle_rental][name];out center tags 20;` },
  { id: 'routes', q: at => `relation${at(15000)}[route~"^(bicycle|hiking)$"][name];out tags 60;` }
];

function partQuery(part, lat, lng) {
  const at = r => `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:45];${part.q(at)}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BACKOFF_MS = [4000, 12000, 30000];

async function runPart(part, center) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await client.post(OVERPASS_URL, `data=${encodeURIComponent(partQuery(part, center.lat, center.lng))}`);
      if (!res.data || !Array.isArray(res.data.elements)) throw new Error('Overpass returned no elements (server busy)');
      return res.data.elements.map(el => ({ type: el.type, id: el.id, lat: el.lat, lon: el.lon, center: el.center, tags: el.tags }));
    } catch (err) {
      if (attempt >= BACKOFF_MS.length) throw err;
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

function haversineKm(a, b) {
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function kindOf(t) {
  if (t.tourism === 'camp_site') return 'camping';
  if (t.tourism === 'caravan_site') return 'rv';
  if (t.amenity === 'sanitary_dump_station') return 'dump';
  if (t.highway === 'services' || t.highway === 'rest_area') return 'rest';
  if (t.route === 'bicycle') return 'bike_route';
  if (t.route === 'hiking') return 'hike_route';
  if (t.amenity === 'bicycle_rental') return 'bike_share';
  return null;
}

// tourism=camp_site is also used for things a traveller must not be sent
// to (a mapped homeless encampment came back for Kingston, Oct 2026), so a
// campground only counts when it is named like one or carries the tags an
// operated site has. Better to list fewer than to list that.
const NOT_A_CAMPGROUND = /\b(homeless|encampment|tent city|shelter)\b/i;
function isRealCampground(t) {
  if (NOT_A_CAMPGROUND.test(t.name || '')) return false;
  if (/\b(camp|campground|campsite|camping|rv|trailer|park|resort|kampground|koa)\b/i.test(t.name || '')) return true;
  return Boolean(t.operator || t.website || t['contact:website'] || t.fee || t.capacity || t.reservation || t.caravans || t.tents || t.power_supply || t.sanitary_dump_station);
}

// One OSM element → one entry, or null. Pure, so tests can feed fixtures.
function normalize(el, center) {
  const t = el.tags || {};
  const kind = kindOf(t);
  if (!kind) return null;
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lng = el.lon != null ? el.lon : el.center && el.center.lon;
  const isRoute = kind === 'bike_route' || kind === 'hike_route';
  if (!isRoute && (lat == null || lng == null)) return null;
  const name = t.name || (kind === 'dump' ? (t.operator ? `${t.operator} dump station` : 'RV dump station') : null);
  if (!name) return null;
  if (t.access === 'private' || t.access === 'no') return null;
  // Mappers tag unnamed relations with what they are, not what they are
  // called: "SIGNED ROUTE", "Unsigned route". A guide lists routes by name.
  if (isRoute && /^(un)?signed route$|^(bike |cycling |hiking )?route$|^unnamed/i.test(name.trim())) return null;
  // Numbered pitches inside a park ("1", "6", "Site 14") are mapped as campsites
  // too; a campground worth listing has a name made of words.
  if ((kind === 'camping' || kind === 'rv') && !/[a-z]{3}/i.test(name.replace(/\b(site|pitch|lot|camp ?site)\b/ig, ''))) return null;
  if (kind === 'camping' && !isRealCampground(t)) return null;
  if (kind === 'rv' && NOT_A_CAMPGROUND.test(name)) return null; // caravan_site is rarely misused; names still checked
  const notes = [];
  if (kind === 'camping' || kind === 'rv') {
    if (t.caravans === 'yes' || kind === 'rv') notes.push('RVs and vans');
    if (t.tents === 'yes') notes.push('tents');
    if (t.backcountry === 'yes') notes.push('backcountry');
    if (t.fee === 'no') notes.push('free'); else if (t.fee === 'yes') notes.push('fee');
    if (t.power_supply === 'yes') notes.push('power hookups');
    if (t.sanitary_dump_station === 'yes') notes.push('dump station');
    if (t.shower === 'yes') notes.push('showers');
    if (t.capacity) notes.push(`${t.capacity} sites`);
  }
  if (kind === 'dump' && t.fee) notes.push(t.fee === 'no' ? 'free' : 'fee');
  if (kind === 'rest' && t.highway === 'services') notes.push('fuel, food and washrooms');
  if (kind === 'bike_route' || kind === 'hike_route') {
    if (t.distance) notes.push(`${t.distance} km`);
    if (t.network) notes.push({ lcn: 'local network', rcn: 'regional network', ncn: 'national network', icn: 'international network', lwn: 'local network', rwn: 'regional network', nwn: 'national network', iwn: 'international network' }[t.network] || '');
  }
  if (kind === 'bike_share' && t.network) notes.push(t.network);
  return {
    kind,
    name: String(name).trim(),
    lat, lng,
    km: center && lat != null ? Math.round(haversineKm(center, { lat, lng }) * 10) / 10 : null,
    notes: notes.filter(Boolean),
    operator: t.operator || null,
    website: t.website || t['contact:website'] || t.url || null,
    osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`
  };
}

const CAPS = { camping: 14, rv: 10, dump: 6, rest: 8, bike_route: 12, hike_route: 12, bike_share: 6 };

function group(elements, center) {
  const out = { camping: [], rv: [], dump: [], rest: [], bike_route: [], hike_route: [], bike_share: [] };
  const seen = new Set();
  for (const el of elements || []) {
    const e = normalize(el, center);
    if (!e) continue;
    const k = `${e.kind}|${e.name.toLowerCase()}`;
    if (seen.has(k)) continue; // long routes come back as several relations
    seen.add(k);
    out[e.kind].push(e);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
    out[k] = out[k].slice(0, CAPS[k]);
  }
  return out;
}

// → { camping, rv, dump, rest, bike_route, hike_route, bike_share, missing }
// `missing` names the parts Overpass could not answer, so the guide can say
// "not available for this edition" rather than print an empty list as fact.
async function getTravelSpots({ lat, lng }) {
  const center = { lat: Number(lat), lng: Number(lng) };
  const cell = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
  const elements = [];
  const missing = [];
  for (const part of PARTS) {
    try {
      const els = await apiCache.cached({
        key: `osm:travel:${part.id}:${cell}`,
        ttlMs: TTL_MS,
        fetch: () => runPart(part, center)
      });
      elements.push(...els);
    } catch (err) {
      missing.push(part.id);
      console.warn(`[osm-travel] ${part.id} unavailable for ${cell}:`, err.message);
    }
  }
  return Object.assign(group(elements, center), { missing });
}

module.exports = { getTravelSpots, normalize, group, isRealCampground, haversineKm };
