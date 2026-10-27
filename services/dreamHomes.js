// services/dreamHomes.js — DayHop V2
// Dream Home: real GTA open houses, entered by hand by an admin, shown on
// the homepage as a "go walk through it" rail.
//
// Why by hand: there is no free public open-house feed for the GTA. CREA
// DDF is for its Participants only, TRREB IDX needs a Broker of Record,
// and vendors (Repliers) need a brokerage agreement; Toronto Open Data has
// no listings. So every home here is one an admin saw on a public listing
// page and typed in, with that page as its source link. Nothing is scraped,
// no listing photo is copied, and no MLS or REALTOR mark is shown.
//
// Storage: public.api_cache rows "dreamhome:<id>" with a 10-year expiry,
// like services/personalGuideStore.js: the table exists in production and
// survives deploys, so no migration has to be run by hand before launch.
// No service key (local dev, tests) → an in-memory map.
//
// Time: every open-house window is a wall-clock window in America/Toronto.
// Status is computed on each read, never stored, so a home whose last
// window has ended drops off the public rail by itself.

const crypto = require('crypto');
const db = require('./db/client');

const TZ = 'America/Toronto';
const PREFIX = 'dreamhome:';
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const mem = new Map();
const hasDb = () => db.status().service_key === true;

// ---------- storage ----------

async function put(home) {
  if (!hasDb()) { mem.set(home.id, home); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key: PREFIX + home.id,
    payload: { v: home },
    expires_at: new Date(Date.now() + TEN_YEARS_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`dream home write failed: ${error.message}`);
}

async function get(id) {
  if (!hasDb()) return mem.get(id) || null;
  const { data, error } = await db.getClient().from('api_cache').select('payload').eq('key', PREFIX + id).maybeSingle();
  if (error) throw new Error(`dream home read failed: ${error.message}`);
  return data && data.payload ? data.payload.v : null;
}

async function all() {
  if (!hasDb()) return [...mem.values()];
  const { data, error } = await db.getClient().from('api_cache').select('payload').like('key', `${PREFIX}%`).limit(500);
  if (error) throw new Error(`dream home list failed: ${error.message}`);
  return (data || []).map(r => r.payload && r.payload.v).filter(Boolean);
}

async function remove(id) {
  if (!hasDb()) return mem.delete(id);
  const { error } = await db.getClient().from('api_cache').delete().eq('key', PREFIX + id);
  if (error) throw new Error(`dream home delete failed: ${error.message}`);
  return true;
}

// ---------- Toronto wall clock ----------

// Offset of America/Toronto from UTC, in minutes, at an instant.
function tzOffsetMin(ms) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName').value; // "GMT-04:00"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// "2026-10-25" + "14:00" in Toronto → epoch ms. Two passes settle the DST
// edge (the offset at the guessed instant can differ by the hour).
function torontoMs(date, hm) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let ms = wall - tzOffsetMin(wall) * 60000;
  ms = wall - tzOffsetMin(ms) * 60000;
  return ms;
}

const fmt = (ms, opts) => new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: TZ }, opts)).format(new Date(ms));
// "2 PM", "2:30 PM"
function clock(ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(ms));
  const h = parts.find(p => p.type === 'hour').value;
  const m = parts.find(p => p.type === 'minute').value;
  const ap = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
  return { text: m === '00' ? h : `${h}:${m}`, ap };
}
// "Sat 2 to 4 PM", "Sun 11:30 AM to 1 PM" (house style: "to", never a dash)
function windowLabel(startMs, endMs) {
  const day = fmt(startMs, { weekday: 'short' });
  const a = clock(startMs), b = clock(endMs);
  return a.ap === b.ap ? `${day} ${a.text} to ${b.text} ${b.ap}` : `${day} ${a.text} ${a.ap} to ${b.text} ${b.ap}`;
}
// "Sat Oct 31"
const dayLabel = ms => fmt(ms, { weekday: 'short', month: 'short', day: 'numeric' }).replace(/\./g, '').replace(',', '');

// ---------- validation ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
// House copy rule for admin-written text that the public reads.
const dashFix = s => s.replace(/\s*[—–]\s*/g, ', ').replace(/\s-{1,2}\s/g, ', ');
const httpsUrl = s => {
  const v = clean(s, 1000);
  if (!v) return '';
  try { const u = new URL(v); return u.protocol === 'https:' ? u.toString() : null; } catch (e) { return null; }
};

/**
 * Normalize an admin's form. → { home, errors: [..] }. `forPublish` adds the
 * rules a live home must meet: every required field, at least one window,
 * and a source link.
 */
function normalize(input, { forPublish = false } = {}) {
  const b = input || {};
  const errors = [];
  const home = {
    address: clean(b.address, 200),
    area: clean(b.area, 120),
    price: b.price === '' || b.price == null ? null : Math.round(Number(String(b.price).replace(/[$,\s]/g, ''))),
    windows: [],
    source_url: httpsUrl(b.source_url),
    note: dashFix(clean(b.note, 320)),
    photo_override: httpsUrl(b.photo_override)
  };
  if (!home.address) errors.push('Address is required.');
  if (home.price != null && (!Number.isFinite(home.price) || home.price < 1000 || home.price > 100000000)) {
    errors.push('Asking price must be a number of dollars.'); home.price = null;
  }
  if (home.source_url === null) { errors.push('Source link must be a full https:// address.'); home.source_url = ''; }
  if (home.photo_override === null) { errors.push('Photo override must be a full https:// address.'); home.photo_override = ''; }
  for (const w of Array.isArray(b.windows) ? b.windows.slice(0, 12) : []) {
    if (!w || (!w.date && !w.start && !w.end)) continue;
    if (!DATE_RE.test(w.date || '') || !TIME_RE.test(w.start || '') || !TIME_RE.test(w.end || '')) {
      errors.push('Each open house needs a date, a start time and an end time.'); continue;
    }
    if (w.end <= w.start) { errors.push(`The open house on ${w.date} ends before it starts.`); continue; }
    home.windows.push({ date: w.date, start: w.start, end: w.end });
  }
  home.windows.sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
  if (forPublish) {
    if (!home.area) errors.push('Neighbourhood and city are required to publish.');
    if (home.price == null) errors.push('Asking price is required to publish.');
    if (!home.windows.length) errors.push('Add at least one open house time to publish.');
    if (!home.source_url) errors.push('A source link to the listing page is required to publish.');
  }
  return { home, errors: [...new Set(errors)] };
}

// ---------- status ----------

/**
 * → 'draft' | 'open' | 'upcoming' | 'expired'. Published homes are live while
 * a window is open or still ahead; never "open" outside a window.
 */
function statusOf(home, now = Date.now()) {
  if (!home.published) return 'draft';
  const spans = (home.windows || []).map(w => [torontoMs(w.date, w.start), torontoMs(w.date, w.end)]);
  if (spans.some(([a, b]) => a <= now && now < b)) return 'open';
  if (spans.some(([a]) => a > now)) return 'upcoming';
  return 'expired';
}

const mapsUrl = address => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

// The public shape: listing facts an open-house visitor needs, nothing
// else (no admin names, no draft fields).
function publicView(home, now = Date.now()) {
  const windows = (home.windows || [])
    .map(w => ({ start: torontoMs(w.date, w.start), end: torontoMs(w.date, w.end) }))
    .filter(w => w.end > now)
    .map(w => ({ start_at: new Date(w.start).toISOString(), end_at: new Date(w.end).toISOString(), label: windowLabel(w.start, w.end), day: dayLabel(w.start) }));
  const photo = home.photo_override
    ? { url: home.photo_override, source: 'override', attribution: null }
    : home.photo && home.photo.url ? { url: home.photo.url, source: 'google', attribution: home.photo.attribution || null } : null;
  return {
    id: home.id,
    address: home.address,
    area: home.area,
    price: home.price,
    status: statusOf(home, now),
    windows,
    note: home.note || '',
    source_url: home.source_url,
    maps_url: mapsUrl(home.address),
    photo
  };
}

/** Live homes for the public rail: open now first, then by next window. */
async function listPublic(now = Date.now()) {
  const rows = (await all())
    .filter(h => ['open', 'upcoming'].includes(statusOf(h, now)))
    .map(h => publicView(h, now));
  const rank = h => (h.status === 'open' ? 0 : 1);
  const key = h => {
    const w = h.status === 'open' ? h.windows.find(x => Date.parse(x.start_at) <= now) : h.windows[0];
    return w ? Date.parse(h.status === 'open' ? w.end_at : w.start_at) : Infinity;
  };
  return rows.sort((a, b) => rank(a) - rank(b) || key(a) - key(b));
}

/** Every home with its status, for the admin tab (newest first). */
async function listAdmin(now = Date.now()) {
  return (await all())
    .map(h => Object.assign({}, h, { status: statusOf(h, now), public: publicView(h, now) }))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

// ---------- photos ----------

// The exterior photo Google Places has for the address, with the author
// attribution Google requires beside it. One Text Search (photos field
// only) per address, cached 14 days through apiCache with misses included,
// and charged to the Maps daily budget: when the budget is spent the home
// simply shows its labeled drawing. Resolved when an admin saves, never on
// a public page view.
async function lookupPhoto(address) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  const apiCache = require('./apiCache');
  const axios = require('axios');
  try {
    return await apiCache.cached({
      key: `maps:dreamhome-photo:${address.trim().toLowerCase()}`,
      ttlMs: 14 * 24 * 60 * 60 * 1000,
      fetch: async () => {
        apiCache.spend('text_search_pro');
        const res = await axios.post('https://places.googleapis.com/v1/places:searchText',
          { textQuery: address, maxResultCount: 1, locationBias: { circle: { center: { latitude: 43.75, longitude: -79.4 }, radius: 50000 } } },
          { timeout: 7000, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'places.photos' } });
        const p = res.data && res.data.places && res.data.places[0] && res.data.places[0].photos && res.data.places[0].photos[0];
        if (!p || !p.name) return null;
        const a = (p.authorAttributions || [])[0] || null;
        return {
          url: `/api/photo?name=${encodeURIComponent(p.name)}`,
          attribution: a ? { name: String(a.displayName || '').slice(0, 120), uri: /^https:\/\//.test(a.uri || '') ? a.uri : null } : null
        };
      }
    });
  } catch (err) {
    console.warn('[dream-homes] photo lookup skipped:', err.message);
    return null;
  }
}

// ---------- admin writes ----------

async function save(id, input, { actor = 'admin', publish = null } = {}) {
  const existing = id ? await get(id) : null;
  if (id && !existing) { const e = new Error('Not found.'); e.status = 404; throw e; }
  const wantPublished = publish == null ? Boolean(existing && existing.published) : Boolean(publish);
  const { home, errors } = normalize(input, { forPublish: wantPublished });
  if (errors.length) { const e = new Error(errors.join(' ')); e.status = 400; e.errors = errors; throw e; }
  const now = new Date().toISOString();
  const rec = Object.assign({}, existing || {}, home, {
    id: existing ? existing.id : crypto.randomBytes(6).toString('hex'),
    published: wantPublished,
    created_at: existing ? existing.created_at : now,
    created_by: existing ? existing.created_by : actor,
    updated_at: now,
    updated_by: actor
  });
  if (!rec.photo_override && (!existing || existing.address !== rec.address || !existing.photo_checked_at)) {
    rec.photo = await lookupPhoto(rec.address);
    rec.photo_checked_at = now;
  }
  await put(rec);
  return rec;
}

async function setPublished(id, published, { actor = 'admin' } = {}) {
  const existing = await get(id);
  if (!existing) { const e = new Error('Not found.'); e.status = 404; throw e; }
  return save(id, existing, { actor, publish: published });
}

// Bookkeeping fields that are not part of the admin form ("found_by").
async function mark(id, fields) {
  const existing = await get(id);
  if (!existing) return null;
  const rec = Object.assign({}, existing, fields);
  await put(rec);
  return rec;
}

// ---------- homes entered from chat ----------
// Claude has no admin login, so a home a founder asks it to add is written
// into data/dreamHomeSeeds.js and saved here once, on boot, as a draft marked
// found_by "claude" for an admin to check and publish. A marker row per seed
// key ("dreamhome-seed:", outside the "dreamhome:" rows all() lists) keeps a
// draft an admin deleted from coming back on the next deploy.
const SEED_PREFIX = 'dreamhome-seed:';
const seedMem = new Set();

async function seedDone(key) {
  if (!hasDb()) return seedMem.has(key);
  const { data, error } = await db.getClient().from('api_cache').select('key').eq('key', SEED_PREFIX + key).maybeSingle();
  if (error) throw new Error(`dream home seed read failed: ${error.message}`);
  return Boolean(data);
}

async function markSeedDone(key, id) {
  if (!hasDb()) { seedMem.add(key); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key: SEED_PREFIX + key,
    payload: { v: { id, at: new Date().toISOString() } },
    expires_at: new Date(Date.now() + TEN_YEARS_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`dream home seed write failed: ${error.message}`);
}

/** Save each seed not yet saved as a draft. → ids of the drafts added. */
async function applySeeds(seeds) {
  const added = [];
  for (const s of seeds || []) {
    if (!s || !s.key || await seedDone(s.key)) continue;
    const saved = await save(null, s.home, { actor: 'claude', publish: false });
    await mark(saved.id, { found_by: 'claude', found_at: new Date().toISOString(), found_check: s.check || '' });
    await markSeedDone(s.key, saved.id);
    added.push(saved.id);
  }
  return added;
}

module.exports = {
  listPublic, listAdmin, save, setPublished, remove, get, mark, applySeeds,
  normalize, statusOf, publicView, torontoMs, windowLabel,
  _mem: mem, _seedMem: seedMem
};
