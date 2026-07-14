// services/analytics.js — DayHop V2 (Phase 4)
// Event tracking + metrics with the app's fail-soft layering:
//   - Writes: fire-and-forget INSERT into public.events (anon key is enough —
//     the table has an insert-only RLS policy), mirrored into in-memory
//     aggregates so usage limits and dev-mode metrics work with no DB at all.
//   - Reads (metrics, usage counts): Supabase only with SUPABASE_SERVICE_KEY
//     (reads are blocked for the anon role by design); otherwise served from
//     the in-memory mirror (per-process, wiped on restart — documented).

const dbClient = require('./db/client');
const { genId } = require('./db/ids');

const EVENT_TYPES = new Set([
  'prompt_generated', 'shortlist_add', 'booking_click', 'maps_click',
  'plan_built', 'signup', 'upgrade_started',
  // Freemium feature events: re-planning is rate-limited by countToday, and
  // edit/delete round out the saved-guides funnel.
  'plan_replanned', 'guide_created', 'guide_edited', 'guide_deleted',
  // Conversion funnel: upgrade_viewed (modal shown, source = which gate)
  // → upgrade_started (checkout created) → subscriptions table.
  'upgrade_viewed', 'guide_export',
  // Instant discovery feed served (server-truth, includes cache hits).
  'browse_feed',
  // Booking retention: click → prompt shown → (maybe) idea auto-saved.
  'booking_return_prompt_shown', 'idea_auto_saved_on_booking'
]);

// ---------- in-memory mirror ----------
// events: bounded ring so a long-lived process can't grow unbounded.
const MIRROR_MAX = 20000;
const mirror = [];

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

function torontoDay(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(ts ? new Date(ts) : new Date());
}

/**
 * Record an event. Never throws, never blocks the caller.
 */
function recordEvent({ type, ownerKey, ideaId, source, meta }) {
  if (!EVENT_TYPES.has(type)) return;
  const event = {
    id: genId('ev'),
    type,
    owner_key: String(ownerKey || 'anon').slice(0, 80),
    idea_id: ideaId != null ? String(ideaId).slice(0, 120) : null,
    source: source ? String(source).slice(0, 40) : null,
    meta: meta || null,
    created_at: new Date().toISOString()
  };

  mirror.push(event);
  if (mirror.length > MIRROR_MAX) mirror.splice(0, mirror.length - MIRROR_MAX);

  if (dbClient.isConfigured()) {
    dbClient.getClient().from('events').insert(event).then(({ error }) => {
      if (error) console.warn('[analytics] event insert failed:', error.message);
    }).catch(err => console.warn('[analytics] event insert failed:', err.message));
  }
}

/**
 * How many events of `type` this owner has recorded today (Toronto time).
 * Used for the free-tier generate limit.
 */
async function countToday(type, ownerKey) {
  const today = torontoDay();
  // The mirror always counts this process's own events, so it is the floor:
  // if SUPABASE_SERVICE_KEY is missing OR wrong (e.g. the publishable key,
  // where RLS silently filters reads to zero rows with NO error), the DB
  // count under-reports and limits would never fire. Take the max of both.
  const mirrorCount = mirror.filter(e =>
    e.type === type && e.owner_key === String(ownerKey) && torontoDay(e.created_at) === today
  ).length;
  if (hasServiceKey()) {
    try {
      // Start of the Toronto day expressed as an ISO instant.
      const sinceIso = new Date(`${today}T00:00:00-04:00`).toISOString();
      const { count, error } = await dbClient.getClient()
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('type', type)
        .eq('owner_key', String(ownerKey))
        .gte('created_at', sinceIso);
      if (!error && typeof count === 'number') return Math.max(count, mirrorCount);
      if (error) console.warn('[analytics] countToday failed, using mirror:', error.message);
    } catch (err) {
      console.warn('[analytics] countToday failed, using mirror:', err.message);
    }
  }
  return mirrorCount;
}

// ---------- metrics (admin dashboard) ----------

function aggregate(events) {
  const totals = {};
  const daily = new Map(); // day -> { day, counts per type, owners:Set }
  const firstSeen = new Map(); // owner -> day
  const cities = new Map();       // meta.city on prompts + browse feeds
  const modeSplit = new Map();    // meta.mode on prompts + browse feeds
  const clickSources = new Map(); // source on booking clicks (viator/gyg/…)
  for (const e of events) {
    totals[e.type] = (totals[e.type] || 0) + 1;
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
    if (e.type === 'prompt_generated' || e.type === 'browse_feed') {
      if (meta.city) cities.set(meta.city, (cities.get(meta.city) || 0) + 1);
      if (meta.mode) modeSplit.set(meta.mode, (modeSplit.get(meta.mode) || 0) + 1);
    }
    if (e.type === 'booking_click') {
      const src = e.source || 'unknown';
      clickSources.set(src, (clickSources.get(src) || 0) + 1);
    }
    const day = torontoDay(e.created_at);
    if (!daily.has(day)) daily.set(day, { day, prompts: 0, browses: 0, shortlist_adds: 0, booking_clicks: 0, plans_built: 0, owners: new Set() });
    const d = daily.get(day);
    if (e.type === 'prompt_generated') d.prompts++;
    if (e.type === 'browse_feed') d.browses++;
    if (e.type === 'shortlist_add') d.shortlist_adds++;
    if (e.type === 'booking_click' || e.type === 'maps_click') d.booking_clicks++;
    if (e.type === 'plan_built') d.plans_built++;
    if (e.owner_key && e.owner_key !== 'anon') {
      d.owners.add(e.owner_key);
      if (!firstSeen.has(e.owner_key)) firstSeen.set(e.owner_key, day);
    }
  }

  const days = [...daily.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(d => ({
      day: d.day,
      prompts: d.prompts,
      browses: d.browses,
      shortlist_adds: d.shortlist_adds,
      booking_clicks: d.booking_clicks,
      plans_built: d.plans_built,
      active_users: d.owners.size,
      new_users: [...firstSeen.entries()].filter(([, first]) => first === d.day).length
    }));

  const topOf = (map, n) => [...map.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([name, count]) => ({ name, count }));

  const prompts = totals.prompt_generated || 0;
  const adds = totals.shortlist_add || 0;
  const clicks = (totals.booking_click || 0) + (totals.maps_click || 0);
  const upgradeViews = totals.upgrade_viewed || 0;
  const upgradeStarts = totals.upgrade_started || 0;
  return {
    totals: {
      prompts,
      browses: totals.browse_feed || 0,
      shortlist_adds: adds,
      booking_clicks: totals.booking_click || 0,
      maps_clicks: totals.maps_click || 0,
      plans_built: totals.plan_built || 0,
      replans: totals.plan_replanned || 0,
      guides_saved: totals.guide_created || 0,
      signups: totals.signup || 0,
      distinct_users: firstSeen.size
    },
    funnel: {
      prompts,
      shortlist_adds: adds,
      outbound_clicks: clicks,
      prompt_to_shortlist: prompts ? Math.round((adds / prompts) * 100) / 100 : null,
      shortlist_to_click: adds ? Math.round((clicks / adds) * 100) / 100 : null
    },
    upgrade_funnel: {
      viewed: upgradeViews,
      started: upgradeStarts,
      view_to_start: upgradeViews ? Math.round((upgradeStarts / upgradeViews) * 100) / 100 : null
    },
    events_by_type: totals,
    top_cities: topOf(cities, 10),
    mode_split: topOf(modeSplit, 5),
    booking_sources: topOf(clickSources, 10),
    daily: days.slice(-30)
  };
}

// One fetch path shared by metrics() and userActivity(): Supabase with the
// service key, mirror otherwise — including the wrong-key case, where a
// "service" key that is really the publishable key reads as zero rows with
// NO error under RLS. Every mirror event was also inserted into the DB, so
// supabase(0) while the mirror has events can only mean reads are broken.
async function fetchEvents() {
  if (hasServiceKey()) {
    try {
      const { data, error } = await dbClient.getClient()
        .from('events')
        .select('type, owner_key, source, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(20000);
      if (error) throw error;
      if ((data || []).length === 0 && mirror.length > 0) {
        return {
          source: 'memory (Supabase read returned 0 rows — check SUPABASE_SERVICE_KEY is the service_role secret)',
          events: mirror
        };
      }
      return { source: 'supabase', events: data || [] };
    } catch (err) {
      console.warn('[analytics] event fetch via Supabase failed, using mirror:', err.message);
    }
  }
  return {
    source: 'memory (per-process; add SUPABASE_SERVICE_KEY for persistent analytics)',
    events: mirror
  };
}

/**
 * Metrics for the admin route. { source: 'supabase'|'memory', ...aggregates }.
 */
async function metrics() {
  const { source, events } = await fetchEvents();
  return { source, ...aggregate(events) };
}

/**
 * Per-owner activity rollup for the admin users view, most recently active
 * first. Owner keys are pseudonymous: a user id, guest id, or "ip-<addr>".
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function userActivity(limit = 200) {
  const { source, events } = await fetchEvents();
  const users = new Map();
  for (const e of events) {
    const key = e.owner_key || 'anon';
    if (!users.has(key)) {
      users.set(key, {
        owner_key: key, first_seen: e.created_at, last_seen: e.created_at, events: 0,
        prompts: 0, browses: 0, shortlist_adds: 0, booking_clicks: 0,
        plans_built: 0, guides_saved: 0, signups: 0, cities: new Map()
      });
    }
    const u = users.get(key);
    u.events++;
    if (e.created_at < u.first_seen) u.first_seen = e.created_at;
    if (e.created_at > u.last_seen) u.last_seen = e.created_at;
    if (e.type === 'prompt_generated') u.prompts++;
    if (e.type === 'browse_feed') u.browses++;
    if (e.type === 'shortlist_add') u.shortlist_adds++;
    if (e.type === 'booking_click' || e.type === 'maps_click') u.booking_clicks++;
    if (e.type === 'plan_built') u.plans_built++;
    if (e.type === 'guide_created') u.guides_saved++;
    if (e.type === 'signup') u.signups++;
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
    if (meta.city) u.cities.set(meta.city, (u.cities.get(meta.city) || 0) + 1);
  }

  const rows = [...users.values()]
    .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
    .slice(0, limit)
    .map(u => {
      const topCity = [...u.cities.entries()].sort((a, b) => b[1] - a[1])[0];
      return Object.assign({}, u, {
        cities: undefined,
        top_city: topCity ? topCity[0] : null,
        kind: u.owner_key.startsWith('ip-') ? 'ip' : (UUID_RE.test(u.owner_key) ? 'user' : 'guest')
      });
    });
  return { source, users: rows };
}

module.exports = { recordEvent, countToday, metrics, userActivity, EVENT_TYPES };
