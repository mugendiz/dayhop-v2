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
  for (const e of events) {
    totals[e.type] = (totals[e.type] || 0) + 1;
    const day = torontoDay(e.created_at);
    if (!daily.has(day)) daily.set(day, { day, prompts: 0, shortlist_adds: 0, booking_clicks: 0, plans_built: 0, owners: new Set() });
    const d = daily.get(day);
    if (e.type === 'prompt_generated') d.prompts++;
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
      shortlist_adds: d.shortlist_adds,
      booking_clicks: d.booking_clicks,
      plans_built: d.plans_built,
      active_users: d.owners.size,
      new_users: [...firstSeen.entries()].filter(([, first]) => first === d.day).length
    }));

  const prompts = totals.prompt_generated || 0;
  const adds = totals.shortlist_add || 0;
  const clicks = (totals.booking_click || 0) + (totals.maps_click || 0);
  return {
    totals: {
      prompts,
      shortlist_adds: adds,
      booking_clicks: totals.booking_click || 0,
      maps_clicks: totals.maps_click || 0,
      plans_built: totals.plan_built || 0,
      distinct_users: firstSeen.size
    },
    funnel: {
      prompts,
      shortlist_adds: adds,
      outbound_clicks: clicks,
      prompt_to_shortlist: prompts ? Math.round((adds / prompts) * 100) / 100 : null,
      shortlist_to_click: adds ? Math.round((clicks / adds) * 100) / 100 : null
    },
    daily: days.slice(-30)
  };
}

/**
 * Metrics for the admin route. { source: 'supabase'|'memory', ...aggregates }.
 */
async function metrics() {
  if (hasServiceKey()) {
    try {
      const { data, error } = await dbClient.getClient()
        .from('events')
        .select('type, owner_key, created_at')
        .order('created_at', { ascending: false })
        .limit(20000);
      if (error) throw error;
      return { source: 'supabase', ...aggregate(data || []) };
    } catch (err) {
      console.warn('[analytics] metrics via Supabase failed, using mirror:', err.message);
    }
  }
  return {
    source: 'memory (per-process; add SUPABASE_SERVICE_KEY for persistent analytics)',
    ...aggregate(mirror)
  };
}

module.exports = { recordEvent, countToday, metrics, EVENT_TYPES };
