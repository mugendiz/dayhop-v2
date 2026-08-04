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

// Client-originated events, accepted by POST /api/track. Lives here beside
// the server list so the two can never drift again — track.js imports this
// set, and recordEvent validates against the union. (They HAD drifted:
// place_visited was accepted then silently dropped, and
// booking_return_continue / sample_plan_viewed were rejected with 400.)
const CLIENT_EVENT_TYPES = new Set([
  'booking_click', 'maps_click', 'shortlist_add', 'signup', 'guide_export',
  // Conversion funnel: upgrade_viewed (modal shown, source = which gate)
  // → upgrade_started (checkout created) → subscriptions table.
  'upgrade_viewed',
  // Booking retention: click → prompt shown → (maybe) idea auto-saved →
  // "keep planning" tapped (the retention win).
  'booking_return_prompt_shown', 'idea_auto_saved_on_booking', 'booking_return_continue',
  // Product-identity + zero-state engagement.
  'mode_switch', 'sample_plan_viewed',
  // Hero featured card: opened for detail / rewound to a previous pick.
  // (featured_event_open had drifted — fired since the split hero shipped
  // but never registered, so every open was rejected with 400.)
  'featured_event_open', 'featured_back',
  // Quest layer: a plan stop checked off as "been here".
  'place_visited'
]);

// Server-truth events, recorded by their own routes.
const SERVER_EVENT_TYPES = new Set([
  'prompt_generated', 'plan_built', 'upgrade_started',
  // Freemium feature events: re-planning is rate-limited by countToday, and
  // edit/delete round out the saved-guides funnel.
  'plan_replanned', 'guide_created', 'guide_edited', 'guide_deleted',
  // Instant discovery feed served (server-truth, includes cache hits).
  'browse_feed',
  // Surprise-me / Next feed served (routes/surprise.js). Was missing from
  // this registry, so recordEvent silently dropped every surprise
  // impression — exactly the drift the comment above warns about.
  'surprise_feed',
  // Hassle-free cancel/resume (billing routes).
  'membership_cancelled', 'membership_resumed'
]);

const EVENT_TYPES = new Set([...CLIENT_EVENT_TYPES, ...SERVER_EVENT_TYPES]);

// ---------- in-memory mirror ----------
// events: bounded ring so a long-lived process can't grow unbounded.
const MIRROR_MAX = 20000;
const mirror = [];

function hasServiceKey() {
  return dbClient.status().service_key === true;
}

// Intl.DateTimeFormat construction is expensive (~50-200 µs) and torontoDay
// runs once per event when aggregating up to 20k events — reuse one formatter.
const TORONTO_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
const TORONTO_DAY_HOUR_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit'
});

function torontoDay(ts) {
  return TORONTO_DAY_FMT.format(ts ? new Date(ts) : new Date());
}

// Start of a Toronto day (YYYY-MM-DD) as an ISO instant, DST-correct.
// Toronto midnight is 04:00 UTC (EDT) or 05:00 UTC (EST) depending on the
// date — probe both candidates and keep the one that formats back to
// midnight of that day. A hardcoded offset here put the free-tier daily
// boundary off by an hour all winter.
function torontoDayStartIso(day) {
  for (const utcHour of ['04', '05']) {
    const d = new Date(`${day}T${utcHour}:00:00Z`);
    const parts = Object.fromEntries(
      TORONTO_DAY_HOUR_FMT.formatToParts(d).map(p => [p.type, p.value])
    );
    const localDay = `${parts.year}-${parts.month}-${parts.day}`;
    if (localDay === day && (parts.hour === '00' || parts.hour === '24')) {
      return d.toISOString();
    }
  }
  return new Date(`${day}T00:00:00-05:00`).toISOString(); // defensive fallback
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
      // Start of the Toronto day expressed as an ISO instant (DST-correct).
      const sinceIso = torontoDayStartIso(today);
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

// Sources whose booking links are affiliate-tagged (commission-bearing).
// Rate: Viator's standard affiliate commission is ~8% of the booking value;
// override with AFFILIATE_COMMISSION_RATE (e.g. 0.06) if your program tier
// differs. "Potential" = if every tracked click had booked — an upper bound
// for gut-checking, not a revenue forecast.
const AFFILIATE_SOURCES = new Set(['viator', 'getyourguide']);
const COMMISSION_RATE = (() => {
  const r = Number(process.env.AFFILIATE_COMMISSION_RATE);
  return Number.isFinite(r) && r > 0 && r < 1 ? r : 0.08;
})();

function aggregate(events) {
  const totals = {};
  const daily = new Map(); // day -> { day, counts per type, owners:Set }
  const firstSeen = new Map(); // owner -> day
  const cities = new Map();       // meta.city on prompts + browse feeds
  const modeSplit = new Map();    // meta.mode on prompts + browse feeds
  const clickSources = new Map(); // source on booking clicks (viator/gyg/…)
  // Per affiliate source: clicks, clicks with a known price, basket sum by
  // currency (Viator prices are USD; never silently mix currencies).
  const affiliate = new Map();
  const since30d = Date.now() - 30 * 24 * 3600 * 1000;
  let affiliateClicks30d = 0;
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
      if (AFFILIATE_SOURCES.has(String(src).toLowerCase())) {
        if (!affiliate.has(src)) affiliate.set(src, { source: src, clicks: 0, priced_clicks: 0, basket: new Map() });
        const a = affiliate.get(src);
        a.clicks++;
        if (Date.parse(e.created_at) >= since30d) affiliateClicks30d++;
        const price = Number(meta.price);
        if (Number.isFinite(price) && price > 0) {
          a.priced_clicks++;
          const cur = meta.currency || 'USD';
          a.basket.set(cur, (a.basket.get(cur) || 0) + price);
        }
      }
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

  // Affiliate rollup: per-source rows plus a headline. Basket/commission
  // stay per-currency (round to cents; float sums drift).
  const affiliateSources = [...affiliate.values()].map(a => ({
    source: a.source,
    clicks: a.clicks,
    priced_clicks: a.priced_clicks,
    basket: [...a.basket.entries()].map(([currency, sum]) => ({
      currency,
      sum: Math.round(sum * 100) / 100,
      potential_commission: Math.round(sum * COMMISSION_RATE * 100) / 100
    }))
  })).sort((a, b) => b.clicks - a.clicks);

  return {
    affiliate: {
      commission_rate: COMMISSION_RATE,
      // Untagged links earn nothing — surface the misconfiguration where
      // the money is counted, not just in a startup log line.
      pid_configured: Boolean(process.env.VIATOR_AFFILIATE_PID),
      clicks: affiliateSources.reduce((n, a) => n + a.clicks, 0),
      clicks_30d: affiliateClicks30d,
      sources: affiliateSources
    },
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
// 60s cache: the 20k-row fetch is a multi-MB read, and metrics() +
// userActivity() each ran it on every admin page load — on the same single
// CPU that serves real traffic.
let eventsCache = null; // { at, result }
const EVENTS_CACHE_TTL_MS = 60 * 1000;

async function fetchEvents() {
  if (eventsCache && Date.now() - eventsCache.at < EVENTS_CACHE_TTL_MS) return eventsCache.result;
  const result = await fetchEventsUncached();
  eventsCache = { at: Date.now(), result };
  return result;
}

async function fetchEventsUncached() {
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

// ---------- per-idea engagement (discovery Phase 3 feedback loop) ----------
// How much real love an idea got in the last 30 days: shortlist adds +
// outbound clicks. Used to tune the newly_opened ranking lift — an opening
// users embrace keeps rising; one they ignore keeps only the base lift.
// Mirror is the floor, DB the truth (same max-merge rationale as countToday).
const ENGAGEMENT_TYPES = ['shortlist_add', 'booking_click', 'maps_click'];
const engagementCache = new Map(); // idsKey -> { at, value }
const ENGAGEMENT_TTL_MS = 10 * 60 * 1000;

async function engagementByIdea(ideaIds, { days = 30 } = {}) {
  const ids = [...new Set((ideaIds || []).filter(Boolean).map(String))].sort();
  if (!ids.length) return {};
  const key = ids.join('|');
  const hit = engagementCache.get(key);
  if (hit && Date.now() - hit.at < ENGAGEMENT_TTL_MS) return hit.value;

  const sinceMs = Date.now() - days * 24 * 3600 * 1000;
  const counts = {};
  for (const id of ids) counts[id] = 0;
  for (const e of mirror) {
    if (e.idea_id && counts[e.idea_id] != null &&
        ENGAGEMENT_TYPES.includes(e.type) && Date.parse(e.created_at) >= sinceMs) {
      counts[e.idea_id]++;
    }
  }
  if (hasServiceKey()) {
    try {
      const { data, error } = await dbClient.getClient()
        .from('events')
        .select('idea_id')
        .in('idea_id', ids)
        .in('type', ENGAGEMENT_TYPES)
        .gte('created_at', new Date(sinceMs).toISOString())
        .limit(5000);
      if (error) throw error;
      const dbCounts = {};
      for (const row of data || []) dbCounts[row.idea_id] = (dbCounts[row.idea_id] || 0) + 1;
      for (const id of ids) counts[id] = Math.max(counts[id], dbCounts[id] || 0);
    } catch (err) {
      console.warn('[analytics] engagementByIdea failed, using mirror:', err.message);
    }
  }
  if (engagementCache.size >= 50) engagementCache.delete(engagementCache.keys().next().value);
  engagementCache.set(key, { at: Date.now(), value: counts });
  return counts;
}

module.exports = { recordEvent, countToday, metrics, userActivity, engagementByIdea, EVENT_TYPES, CLIENT_EVENT_TYPES };
