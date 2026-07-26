// services/autoCatalog.js — DayHop V2 (discovery autopilot)
// The auto-add half of the discovery engine: verified new openings flow
// straight into the live catalog, Canada-wide, without waiting for a human
// paste. The trust contract survives because "verified" is earned, not
// assumed — a find auto-publishes ONLY when every configured verifier
// agrees it is a real, open, visitable place:
//
//   1. Google Places — existence + OPERATIONAL status. Hard gate: no
//      confident Places match (common for places that haven't opened yet)
//      → the find stays in the admin inbox for the human pass.
//   2. Grok — editorial gate: a visitable attraction someone would put on
//      a day plan, not a store/salon/one-off/rumour. Hard gate.
//
// Published entries live beside data/curatedCatalog.js in every search
// (candidates.js merges entries() into catalogCandidates). Persistence:
// public.auto_catalog via the Supabase service key; without one, entries
// live in process memory until restart (fail-soft, same layering as the
// moderation ban list).

const maps = require('./googleMaps');
const { callGrok } = require('./grok');
const dbClient = require('./db/client');
const curatedCatalog = require('../data/curatedCatalog');

// ---------- store ----------
const entriesById = new Map(); // id -> catalog-shaped entry

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

// Boot-time hydration (fire-and-forget): entries() is consumed synchronously
// by the candidates pipeline, so we warm the map in the background and serve
// whatever has loaded — the same eventual-consistency the ban list accepts.
let loadStarted = false;
function loadFromDb() {
  if (loadStarted || !hasServiceKey()) { loadStarted = true; return; }
  loadStarted = true;
  dbClient.getClient().from('auto_catalog').select('*').eq('status', 'active').limit(2000)
    .then(({ data, error }) => {
      if (error) throw error;
      for (const row of data || []) {
        if (row.entry && row.entry.id) entriesById.set(row.entry.id, row.entry);
      }
      if (data && data.length) console.log(`[auto-catalog] loaded ${data.length} published entr${data.length === 1 ? 'y' : 'ies'}`);
    })
    .catch(err => console.warn('[auto-catalog] load failed (memory-only until restart):', err.message));
}

function entries() {
  loadFromDb();
  return [...entriesById.values()];
}

async function persist(entry, verification) {
  entriesById.set(entry.id, entry);
  if (!hasServiceKey()) {
    console.warn(`[auto-catalog] "${entry.title}" added in memory only (no service key — lost on restart)`);
    return;
  }
  try {
    const { error } = await dbClient.getClient()
      .from('auto_catalog')
      .upsert({ id: entry.id, entry, verification, status: 'active' }, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.warn('[auto-catalog] persist failed (kept in memory):', err.message);
  }
}

// ---------- dedupe ----------
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function alreadyKnown(name) {
  const key = normName(name);
  if (!key) return true;
  for (const e of curatedCatalog) {
    if (normName(e.title) === key || normName(e.venue) === key) return true;
  }
  for (const e of entriesById.values()) {
    if (normName(e.title) === key || normName(e.venue) === key) return true;
  }
  return false;
}

// ---------- verifier 1: Google Places ----------
async function googleVerdict(item) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return { pass: false, reason: 'Maps not configured — cannot confirm the place exists' };
  }
  try {
    const places = await maps.searchPlaces({
      query: `${item.name}, ${item.area || 'Canada'}`, maxResults: 3
    });
    const want = normName(item.name).split(' ').filter(w => w.length > 2);
    const match = places.find(p => {
      const got = new Set(normName(p.title).split(' '));
      const hits = want.filter(w => got.has(w)).length;
      return want.length > 0 && (hits >= Math.min(2, want.length) || hits / want.length >= 0.5);
    });
    if (!match) return { pass: false, reason: 'no confident Google Places match (may not be open yet)' };
    if (match.business_status && match.business_status !== 'OPERATIONAL') {
      return { pass: false, reason: `Google lists it as ${match.business_status}` };
    }
    return {
      pass: true,
      place: {
        title: match.title, address: match.address, maps_url: match.maps_url,
        rating: match.rating, rating_count: match.rating_count,
        image_url: match.image_url, business_status: match.business_status
      }
    };
  } catch (err) {
    return { pass: false, reason: `Places lookup failed: ${err.message}` };
  }
}

// ---------- editorial prompt ----------
function verdictPrompt(item, place) {
  return `You are verifying a candidate entry for DayHop, a Canadian day-planning app. Only real, open (or imminently opening), physical, visitable attractions, venues, parks, or experiences belong — something a person would genuinely put on a day out. REJECT: ordinary retail or services (hair salons, phone shops, clinics), one-off or single-night events, closures, rumours or vague plans, real-estate/transit news, and anything outside Canada. Be conservative: when unsure, reject.

CANDIDATE (extracted from a local news article):
${JSON.stringify({
    name: item.name, area: item.area, kind: item.kind,
    summary: item.summary, opened_hint: item.opened_hint,
    article: item.article && { title: item.article.title, source: item.article.source }
  })}

GOOGLE PLACES MATCH: ${place ? JSON.stringify(place) : 'none'}

Respond with JSON only, no markdown fences: {"legit": true or false, "reason": "one short sentence, max 120 chars"}`;
}

// ---------- verifier 2: Grok ----------
async function grokVerdict(item, place) {
  try {
    const parsed = await callGrok([
      { role: 'system', content: 'You are a strict verification judge. Respond with JSON only.' },
      { role: 'user', content: verdictPrompt(item, place) }
    ], { temperature: 0 });
    if (parsed && typeof parsed.legit === 'boolean') {
      return { pass: parsed.legit, reason: String(parsed.reason || '').slice(0, 160) };
    }
    return { pass: false, reason: 'Grok returned an unusable verdict' };
  } catch (err) {
    return { pass: false, reason: `Grok verification failed: ${err.message}` };
  }
}

// ---------- entry assembly ----------
function buildEntry(item, place) {
  const entry = Object.assign({}, item.draft);
  entry.id = String(entry.id || 'cur-new-opening').replace(/^cur-/, 'auto-');
  if (place) {
    if (place.maps_url) entry.maps_url = place.maps_url;
    if (place.rating != null) { entry.rating = place.rating; entry.rating_count = place.rating_count; }
    if (place.image_url) entry.image_url = place.image_url;
  }
  // Auto-adds come from opening-flavored headlines ≤45 days old — today is a
  // fair opened_at, and it powers the "Just opened" shelf + freshness decay.
  entry.opened_at = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  entry.auto = true;
  entry.source_url = (item.article && item.article.url) || null;
  return entry;
}

/**
 * Verify one drafted find; publish it if the chain agrees. Returns the
 * annotation stored on the inbox item so the admin sees what happened.
 */
async function verifyAndAdd(item) {
  if (!item || !item.draft) return { added: false, status: 'no_draft' };
  if (alreadyKnown(item.name)) return { added: false, status: 'already_in_catalog' };

  const google = await googleVerdict(item);
  if (!google.pass) {
    return { added: false, status: 'needs_review', checks: { google: google.reason } };
  }
  const grok = await grokVerdict(item, google.place);
  if (!grok.pass) {
    return { added: false, status: 'rejected', checks: { google: 'ok', grok: grok.reason } };
  }

  const entry = buildEntry(item, google.place);
  const verification = {
    google: google.place,
    grok: grok.reason || 'ok',
    verified_at: new Date().toISOString()
  };
  await persist(entry, verification);
  console.log(`[auto-catalog] published: ${entry.title} (${entry.location})`);
  return { added: true, status: 'published', entry_id: entry.id, checks: verification };
}

/**
 * Run the autopilot over a scan's drafted finds (mutates each item with an
 * `auto` annotation for the admin inbox). Concurrency-limited; one find
 * failing never stops the rest.
 */
async function processFinds(items) {
  const CONCURRENCY = 2;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        item.auto = await verifyAndAdd(item);
      } catch (err) {
        item.auto = { added: false, status: 'error', checks: { error: err.message } };
      }
    }
  }));
  return items;
}

module.exports = { entries, processFinds, verifyAndAdd, alreadyKnown };
