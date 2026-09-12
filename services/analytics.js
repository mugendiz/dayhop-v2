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
const requestContext = require('./requestContext');

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
  // Campaign landing reached the product loop: /?plan=… prefilled and ran.
  'prompt_prefill_landing',
  // Hero featured card: opened for detail / rewound to a previous pick.
  // (featured_event_open had drifted — fired since the split hero shipped
  // but never registered, so every open was rejected with 400.)
  'featured_event_open', 'featured_back',
  // Quest layer: a plan stop checked off as "been here".
  'place_visited',
  // Feed re-sorted to nearest-first (browse/results sort toggle).
  'feed_sort_distance',
  // Email-capture surfaces (feed card / milestone moment): shown →
  // dismissed | subscribed, with meta.source naming the surface — the
  // admin funnel compares surfaces without a separate table.
  'newsletter_prompt_shown', 'newsletter_prompt_dismissed', 'newsletter_prompt_subscribed',
  // Card engagement: the Details panel opened from a feed card. With
  // meta.section it's the click half of per-shelf CTR.
  'card_open',
  // Impression half of per-shelf CTR: batched viewport counts of cards
  // actually seen (≥ half visible). Replaced the server-side cards-served
  // counts, which included everything below the fold and drowned CTR to ~0%.
  'shelf_seen',
  // City-guide sales funnel: the feed promo card was tapped (checkout start
  // and purchase are server-recorded by their own routes).
  'guide_promo_click',
  // Mobile Favs grid (Sept 2026): a tile was opened (meta.surface favs|feed),
  // swiped into the plan (meta.via swipe|button), or a feed tile was swiped
  // into a list (meta.list_id). feed_swipe_shortlist runs beside
  // shortlist_add for a week so the two can be compared.
  'tile_open', 'tile_swipe_plan', 'feed_swipe_shortlist',
  // Voice prompt (Sept 2026): the mic was opened, and a session that put
  // text in the box. The gap between the two is how often speech fails.
  'voice_prompt_started', 'voice_prompt_committed'
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
  'membership_cancelled', 'membership_resumed',
  // Paid city guides (routes/cityGuides.js + webhook fulfillment): the
  // checkout-intent and sale events the launch dashboard watches. Were
  // missing from this registry, so recordEvent silently dropped both —
  // the same drift that once ate surprise_feed.
  'guide_checkout_started', 'guide_purchase',
  // Email marketing (services/newsletter.js + digest.js): consent funnel
  // subscribe → confirmed (double opt-in) → weekly digest_sent; unsubscribes
  // tracked so list-health (churn) shows up on the admin dashboard.
  'newsletter_subscribe', 'newsletter_confirmed', 'newsletter_unsubscribed', 'digest_sent',
  // Lead magnet: teaser vs full views of /playbook (source field says which).
  'playbook_view',
  // Digest tracking (routes/digestTrack.js): open pixel + signed click
  // redirects. owner_key is `sub-<sid>` (opaque HMAC of the email) — those
  // keys are excluded from user counts and cohorts below.
  'digest_opened', 'digest_clicked',
  // Sponsorship funnel (routes/advertise.js): a venue asked about placements.
  // The event IS the CRM until real sponsor management exists.
  'sponsor_inquiry',
  // Keyed profile links (routes/go.js): a bio/story/ad link was tapped.
  // meta.src is the channel key — taps per 1,000 views is the middle-of-
  // funnel number the Friday check-day reads.
  'link_click',
  // Social vote MVP (routes/guides.js, SOCIAL_VOTE=on): a 👍/👎/"I'm in" tap
  // on a shared guide. idea_id = share_id, meta.stop / meta.vote.
  'plan_vote',
  // Named shortlists (routes/shortlists.js): a list was created (meta.auto
  // says whether a generate made it or a person did) or renamed.
  'favs_list_created', 'favs_list_renamed'
]);

const EVENT_TYPES = new Set([...CLIENT_EVENT_TYPES, ...SERVER_EVENT_TYPES]);

// ---------- ad attribution ----------
// Client-supplied utm_*/fbclid payloads ride into event meta (meta.utm) on
// funnel events so paid campaigns can be tied to signups, subscribers, and
// checkouts. Sanitized hard: known keys only, strings, length-capped —
// everything else dropped, never rejected.
const ATTRIB_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'landing_path',
  // External referrer host on first touch (pixel.js) — the only source
  // signal for untagged traffic (a Reddit thread, a friend's link, TikTok
  // bio). Sept 2026: 0 of 973 events carried any source, so every traffic
  // bump was unexplainable after the fact.
  'referrer'
];

function sanitizeAttrib(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ATTRIB_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 120);
  }
  return Object.keys(out).length ? out : null;
}

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
  // Stamp the requester's IP (from the request-context middleware) into
  // meta so the admin dashboard can separate internal/developer traffic
  // from real users. Cron/startup events have no request → no ip.
  const ip = requestContext.getIp();
  const fullMeta = ip ? Object.assign({}, meta || {}, { ip }) : (meta || null);
  const event = {
    id: genId('ev'),
    type,
    owner_key: String(ownerKey || 'anon').slice(0, 80),
    idea_id: ideaId != null ? String(ideaId).slice(0, 120) : null,
    source: source ? String(source).slice(0, 40) : null,
    meta: fullMeta,
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

// Shelf labels are not a stable enumeration: emoji suffixes, date-aware
// variants ('On today 📅' vs 'On that day 📅'), holiday names. Normalize to
// a stable key before aggregating so CTR doesn't fragment across variants.
function normalizeShelf(label) {
  const s = String(label || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^(on today|on now|on that day|those days)$/i.test(s)) return 'On today';
  return s.slice(0, 40);
}

// The click half of shelf CTR: any of these carrying meta.section counts as
// engagement with a card on that shelf.
const SHELF_CLICK_TYPES = new Set(['booking_click', 'maps_click', 'shortlist_add', 'card_open']);

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
  // Paid/campaign acquisition: funnel events carrying meta.utm, rolled up
  // per source+campaign so the admin dashboard answers "which campaign
  // produced subscribers/signups/checkouts", not just "how many".
  const acquisition = new Map(); // 'source|campaign' -> counts
  // Retention cohorts: per-owner event timestamps. Guests and signed-in users
  // only — 'anon' is nobody and ip-* keys churn with DHCP/NAT, so both would
  // poison week-over-week return rates.
  const ownerTs = new Map(); // owner -> number[] (event timestamps, ms)
  // Per-shelf CTR: impressions from shelf_seen viewport batches (cards the
  // user actually saw — routes/track.js sanitizes them in), clicks from
  // engagement events' meta.section. browse_feed/surprise_feed meta.shelves
  // still records the serve mix but no longer counts as impressions.
  const shelves = new Map(); // shelf key -> { shelf, impressions, clicks }
  const shelfRow = key => {
    if (!shelves.has(key)) shelves.set(key, { shelf: key, impressions: 0, clicks: 0 });
    return shelves.get(key);
  };
  // Digest per-issue rollup: sent (denominator) from digest_sent, unique
  // subscriber opens/clicks from the tracking endpoints.
  const digestIssues = new Map(); // issue -> { issue, sent, opens:Set, clicks:Set }
  const digestRow = issue => {
    if (!digestIssues.has(issue)) digestIssues.set(issue, { issue, sent: 0, opens: new Set(), clicks: new Set() });
    return digestIssues.get(issue);
  };
  const since30d = Date.now() - 30 * 24 * 3600 * 1000;
  let affiliateClicks30d = 0;
  // ---- bot classification (pre-pass) ----
  // Crawler-shaped owners must not count as users (they sat inside the W4
  // retention gate). Shape: every event is a passive server-recorded type
  // AND 5+ events land inside one 15-minute window — the Aug 2026 pattern
  // (Cloudflare-edge bursts at 3 AM, zero engagement). Real passive readers
  // don't hammer 5 requests in 15 minutes; spam-clicky humans fire client
  // events, which disqualifies them here. ip-* keys (requests that never
  // ran our JS) are handled separately below. Event totals keep everything;
  // only USER counts exclude.
  const PASSIVE_TYPES = new Set(['browse_feed', 'surprise_feed', 'playbook_view']);
  const ownerProfile = new Map(); // owner -> { passiveOnly, ts: [] }
  for (const e of events) {
    const k = e.owner_key;
    if (!k || k === 'anon' || k === 'system' || k.startsWith('sub-') || k.startsWith('ip-')) continue;
    if (!ownerProfile.has(k)) ownerProfile.set(k, { passiveOnly: true, ts: [] });
    const p = ownerProfile.get(k);
    if (!PASSIVE_TYPES.has(e.type)) p.passiveOnly = false;
    const ts = Date.parse(e.created_at);
    if (Number.isFinite(ts)) p.ts.push(ts);
  }
  const botOwners = new Set();
  for (const [k, p] of ownerProfile) {
    if (!p.passiveOnly || p.ts.length < 5) continue;
    p.ts.sort((a, b) => a - b);
    for (let i = 0; i + 4 < p.ts.length; i++) {
      if (p.ts[i + 4] - p.ts[i] <= 15 * 60 * 1000) { botOwners.add(k); break; }
    }
  }
  let botEvents = 0;
  for (const e of events) {
    totals[e.type] = (totals[e.type] || 0) + 1;
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
    if (e.type === 'prompt_generated' || e.type === 'browse_feed') {
      if (meta.city) cities.set(meta.city, (cities.get(meta.city) || 0) + 1);
      if (meta.mode) modeSplit.set(meta.mode, (modeSplit.get(meta.mode) || 0) + 1);
    }
    if (e.type === 'shelf_seen' &&
        meta.shelves && typeof meta.shelves === 'object') {
      for (const [label, n] of Object.entries(meta.shelves)) {
        const key = normalizeShelf(label);
        const count = Number(n);
        if (key && Number.isFinite(count) && count > 0 && count <= 500) {
          shelfRow(key).impressions += count;
        }
      }
    }
    if (SHELF_CLICK_TYPES.has(e.type) && meta.section) {
      const key = normalizeShelf(meta.section);
      if (key) shelfRow(key).clicks++;
    }
    if (e.type === 'digest_sent') {
      const issue = typeof meta.issue === 'string' ? meta.issue : torontoDay(e.created_at);
      digestRow(issue).sent += Number(meta.sent) || 0;
    }
    if ((e.type === 'digest_opened' || e.type === 'digest_clicked') && typeof meta.issue === 'string') {
      const row = digestRow(meta.issue);
      (e.type === 'digest_opened' ? row.opens : row.clicks).add(e.owner_key);
    }
    if (meta.utm && meta.utm.utm_source &&
        (e.type === 'signup' || e.type === 'newsletter_subscribe' || e.type === 'upgrade_started' ||
         e.type === 'prompt_generated')) {
      const key = `${meta.utm.utm_source}|${meta.utm.utm_campaign || ''}`;
      if (!acquisition.has(key)) {
        acquisition.set(key, {
          source: meta.utm.utm_source, campaign: meta.utm.utm_campaign || null,
          prompts: 0, signups: 0, subscribers: 0, checkouts: 0
        });
      }
      const a = acquisition.get(key);
      // prompts = the campaign click actually reached the product loop —
      // the number that decides whether ad spend is buying users or bounces.
      if (e.type === 'prompt_generated') a.prompts = (a.prompts || 0) + 1;
      if (e.type === 'signup') a.signups++;
      if (e.type === 'newsletter_subscribe') a.subscribers++;
      if (e.type === 'upgrade_started') a.checkouts++;
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
    // sub-* keys are email subscribers hitting digest tracking; ip-* keys
    // are JS-less requests (crawlers, curl — a product user always carries
    // a guest/user id); burst-classified bots are crawlers with an id.
    // None of them are product users — all stay out of active/new/retention.
    if (e.owner_key && botOwners.has(e.owner_key)) botEvents++;
    if (e.owner_key && e.owner_key !== 'anon' && e.owner_key !== 'system' &&
        !e.owner_key.startsWith('sub-') && !e.owner_key.startsWith('ip-') &&
        !botOwners.has(e.owner_key)) {
      d.owners.add(e.owner_key);
      if (!firstSeen.has(e.owner_key)) firstSeen.set(e.owner_key, day);
      const ts = Date.parse(e.created_at);
      if (Number.isFinite(ts)) {
        if (!ownerTs.has(e.owner_key)) ownerTs.set(e.owner_key, []);
        ownerTs.get(e.owner_key).push(ts);
      }
    }
  }

  // ---- retention cohorts (the premium-tier go/no-go metric) ----
  // Cohort = the Monday-anchored Toronto week of a user's FIRST event. Week N
  // retained = any event in days [7N, 7N+7) after that first event. A week's
  // cell only gets a number once the whole window has elapsed for everyone in
  // the cohort (cohort week end + N weeks), else null — a half-open window
  // would report fake churn for recent cohorts.
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const nowMs = Date.now();
  const cohortMap = new Map(); // mondayDay -> { users, w: [w1,w2,w3,w4] }
  for (const tss of ownerTs.values()) {
    const first = Math.min(...tss);
    const firstDay = torontoDay(first); // YYYY-MM-DD
    const dayUtc = new Date(`${firstDay}T00:00:00Z`);
    const dow = dayUtc.getUTCDay(); // 0=Sun
    dayUtc.setUTCDate(dayUtc.getUTCDate() - ((dow + 6) % 7)); // back to Monday
    const monday = dayUtc.toISOString().slice(0, 10);
    if (!cohortMap.has(monday)) cohortMap.set(monday, { users: 0, w: [0, 0, 0, 0] });
    const c = cohortMap.get(monday);
    c.users++;
    const weeksActive = new Set(tss.map(ts => Math.floor((ts - first) / WEEK_MS)));
    for (let w = 1; w <= 4; w++) if (weeksActive.has(w)) c.w[w - 1]++;
  }
  const retentionCohorts = [...cohortMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([monday, c]) => {
      const cohortEndMs = Date.parse(`${monday}T00:00:00Z`) + WEEK_MS;
      const row = { week: monday, users: c.users };
      for (let w = 1; w <= 4; w++) {
        row[`w${w}`] = nowMs >= cohortEndMs + w * WEEK_MS
          ? Math.round((c.w[w - 1] / c.users) * 100)
          : null;
      }
      return row;
    });
  // Headline: user-weighted W4 across mature cohorts.
  let w4Users = 0, w4Retained = 0;
  for (const r of retentionCohorts) {
    if (r.w4 != null) { w4Users += r.users; w4Retained += r.users * r.w4 / 100; }
  }
  const retention = {
    cohorts: retentionCohorts,
    week4_avg: w4Users ? Math.round((w4Retained / w4Users) * 100) : null,
    measured_users: w4Users,
    // The event fetch caps at 20k rows. Once that cap is hit, first-seen
    // dates re-derive from a truncated window and rates inflate — flag it
    // loudly. metrics() replaces this whole block with the SQL cohort RPC
    // (full history) whenever the DB function is available.
    source: 'event-window',
    window_truncated: events.length >= 20000
  };

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

  // Shelf CTR: impressions-ranked; ctr_pct null until a shelf has been seen.
  const shelfCtr = [...shelves.values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map(s => ({
      shelf: s.shelf,
      impressions: s.impressions,
      clicks: s.clicks,
      ctr_pct: s.impressions ? Math.round((s.clicks / s.impressions) * 1000) / 10 : null
    }));

  // Digest: newest issues first; rates only when a denominator exists.
  const digestRows = [...digestIssues.values()]
    .sort((a, b) => b.issue.localeCompare(a.issue))
    .slice(0, 8)
    .map(r => ({
      issue: r.issue,
      sent: r.sent,
      unique_opens: r.opens.size,
      unique_clicks: r.clicks.size,
      open_rate_pct: r.sent ? Math.round((r.opens.size / r.sent) * 1000) / 10 : null,
      ctr_pct: r.sent ? Math.round((r.clicks.size / r.sent) * 1000) / 10 : null,
      click_to_open_pct: r.opens.size ? Math.round((r.clicks.size / r.opens.size) * 1000) / 10 : null
    }));

  return {
    retention,
    shelf_ctr: shelfCtr,
    digest: {
      // Opens reported but MPP-inflated (docs/email-marketing.md) — clicks
      // are the number that gates decisions.
      issues: digestRows,
      note: 'open rates inflated by Apple MPP; steer by ctr_pct'
    },
    acquisition: {
      sources: [...acquisition.values()]
        .sort((a, b) => (b.checkouts - a.checkouts) || (b.signups - a.signups) || (b.subscribers - a.subscribers))
        .slice(0, 20)
    },
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
    // What the bot classifier removed from user counts (events stay counted).
    bots: {
      owners_excluded: botOwners.size,
      events: botEvents,
      heuristic: 'passive-only owners with 5+ events in a 15-min window; plus all ip-* keys'
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
      // Supabase (PostgREST) caps any single select at its max-rows setting
      // (default 1000) no matter what .limit() asks for — a plain
      // .limit(20000) silently returned only the newest 1000 events and
      // every metric was computed on that truncated window. Page through in
      // 1000-row chunks up to the 20k cap instead.
      const data = [];
      const PAGE = 1000;
      // Row cap AND an age floor: metrics windows are <=30 days, so paging
      // deep into ancient history just burns Supabase quota as the table
      // grows. Stop at 60 days regardless of row count.
      const OLDEST_MS = Date.now() - 60 * 24 * 3600 * 1000;
      while (data.length < 20000) {
        const { data: page, error } = await dbClient.getClient()
          .from('events')
          .select('type, owner_key, source, meta, created_at')
          .order('created_at', { ascending: false })
          .range(data.length, data.length + PAGE - 1);
        if (error) throw error;
        data.push(...(page || []));
        if (!page || page.length < PAGE) break;
        const oldest = page[page.length - 1] && page[page.length - 1].created_at;
        if (oldest && new Date(oldest).getTime() < OLDEST_MS) break;
      }
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

// ---------- retention from SQL (full history) ----------
// The in-aggregate cohort math only sees the 20k-row event window; the
// public.retention_cohorts() function (db/schema.sql) computes first-seen
// and week-N activity over ALL history in Postgres. Preferred whenever the
// RPC exists; fail-soft to the event-window numbers (flagged) otherwise.
let retentionCache = null; // { at, result }
const RETENTION_CACHE_TTL_MS = 60 * 1000;

async function retentionFromDb() {
  if (!hasServiceKey()) return null;
  if (retentionCache && Date.now() - retentionCache.at < RETENTION_CACHE_TTL_MS) {
    return retentionCache.result;
  }
  let result = null;
  try {
    const { data, error } = await dbClient.getClient().rpc('retention_cohorts');
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      const WEEK_MS = 7 * 24 * 3600 * 1000;
      const nowMs = Date.now();
      const cohorts = data.slice(-12).map(r => {
        const monday = String(r.week).slice(0, 10);
        const cohortEndMs = Date.parse(`${monday}T00:00:00Z`) + WEEK_MS;
        const row = { week: monday, users: Number(r.users) || 0 };
        for (let w = 1; w <= 4; w++) {
          // Same maturity rule as the in-memory calc: a cell only fills once
          // the whole window has elapsed for everyone in the cohort.
          row[`w${w}`] = row.users && nowMs >= cohortEndMs + w * WEEK_MS
            ? Math.round(((Number(r[`w${w}`]) || 0) / row.users) * 100)
            : null;
        }
        return row;
      });
      let w4Users = 0, w4Retained = 0;
      for (const r of cohorts) {
        if (r.w4 != null) { w4Users += r.users; w4Retained += r.users * r.w4 / 100; }
      }
      result = {
        cohorts,
        week4_avg: w4Users ? Math.round((w4Retained / w4Users) * 100) : null,
        measured_users: w4Users,
        source: 'sql',
        window_truncated: false
      };
    }
  } catch (err) {
    console.warn('[analytics] retention RPC unavailable, using event-window numbers:', err.message);
  }
  retentionCache = { at: Date.now(), result };
  return result;
}

// ---------- internal-traffic separation ----------
// The developer's own browsing looks exactly like real usage and can add up
// to "hundreds of users and searches" that are actually one person testing.
// Internal events are identified by:
//   - the admin's own guest owner id (admin.html sends its localStorage
//     dayhop_owner_id as ?me=) — this catches HISTORICAL traffic too, since
//     the owner id predates IP stamping;
//   - the admin's current IP (whoever is loading the dashboard);
//   - INTERNAL_IPS env (comma-separated) for other known dev devices;
//   - any owner_key that has ever sent an event from an internal IP, so a
//     dev device's older events reclassify once one stamped event ties the
//     owner to the IP.
const SEARCH_TYPES = new Set(['prompt_generated', 'browse_feed', 'surprise_feed']);

// Internal (founder/developer) traffic. Three signals, any one marks an
// owner internal and every one of that owner's events with it:
//   - INTERNAL_OWNERS: the founder's signed-in user ids and guest ids
//     (stable across networks — the IP-only approach missed the founder's
//     own account for six weeks while it produced 57% of all prompts);
//   - localhost: events stamped ::1 / 127.0.0.1 come from a dev server
//     pointed at the production database, never from a visitor;
//   - IPs: the dashboard requester (meIp) plus INTERNAL_IPS.
const LOCALHOST_IPS = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];
function envList(name) {
  return String(process.env[name] || '').split(',').map(s => s.trim()).filter(Boolean);
}

function internalSets(events, { meOwner, meIp } = {}) {
  const ips = new Set(LOCALHOST_IPS);
  if (meIp) ips.add(String(meIp));
  envList('INTERNAL_IPS').forEach(ip => ips.add(ip));
  const owners = new Set();
  if (meOwner) owners.add(String(meOwner).slice(0, 80));
  envList('INTERNAL_OWNERS').forEach(k => owners.add(k.slice(0, 80)));
  for (const ip of ips) owners.add(`ip-${ip}`);
  for (const e of events) {
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
    if (meta.ip && ips.has(meta.ip) && e.owner_key && e.owner_key !== 'anon') {
      owners.add(e.owner_key);
    }
  }
  return { ips, owners };
}

function isInternalEvent(e, sets) {
  if (sets.owners.has(e.owner_key)) return true;
  const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
  return Boolean(meta.ip && sets.ips.has(meta.ip));
}

// Per-IP rollup for the admin "Traffic by IP" table. Only events recorded
// since IP stamping shipped carry meta.ip; older ones are counted under
// no_ip_events so the table never silently under-reports.
function trafficByIp(events, sets) {
  const rows = new Map();
  let noIp = 0;
  for (const e of events) {
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : {};
    if (!meta.ip) { noIp++; continue; }
    if (!rows.has(meta.ip)) {
      rows.set(meta.ip, {
        ip: meta.ip, events: 0, searches: 0, owners: new Set(),
        first_seen: e.created_at, last_seen: e.created_at
      });
    }
    const r = rows.get(meta.ip);
    r.events++;
    if (SEARCH_TYPES.has(e.type)) r.searches++;
    if (e.owner_key && e.owner_key !== 'anon' && !e.owner_key.startsWith('sub-')) {
      r.owners.add(e.owner_key);
    }
    if (e.created_at < r.first_seen) r.first_seen = e.created_at;
    if (e.created_at > r.last_seen) r.last_seen = e.created_at;
  }
  return {
    no_ip_events: noIp,
    ips: [...rows.values()]
      .sort((a, b) => b.events - a.events)
      .slice(0, 25)
      .map(r => ({
        ip: r.ip,
        internal: sets.ips.has(r.ip),
        events: r.events,
        searches: r.searches,
        owners: r.owners.size,
        first_seen: r.first_seen,
        last_seen: r.last_seen
      }))
  };
}

/**
 * Metrics for the admin route. { source: 'supabase'|'memory', ...aggregates }.
 * opts: { meOwner, meIp, excludeInternal } — when excludeInternal is set,
 * every aggregate (totals, funnel, daily, cities, retention…) is computed
 * over external events only; the traffic block always reports both halves.
 */
async function metrics(opts = {}) {
  const { source, events } = await fetchEvents();
  const sets = internalSets(events, opts);
  const internal = [];
  const external = [];
  for (const e of events) (isInternalEvent(e, sets) ? internal : external).push(e);
  const excluded = Boolean(opts.excludeInternal);

  const result = { source, ...aggregate(excluded ? external : events) };
  const countSearches = list => list.reduce((n, e) => n + (SEARCH_TYPES.has(e.type) ? 1 : 0), 0);
  const countOwners = list => new Set(list
    .map(e => e.owner_key)
    .filter(k => k && k !== 'anon' && k !== 'system' && !k.startsWith('sub-'))).size;
  result.traffic = {
    excluded_internal: excluded,
    internal: { events: internal.length, searches: countSearches(internal), users: countOwners(internal) },
    external: { events: external.length, searches: countSearches(external), users: countOwners(external) },
    internal_owner_keys: [...sets.owners].slice(0, 20),
    ...trafficByIp(events, sets)
  };
  // The SQL retention RPC runs over ALL history and cannot exclude internal
  // owners — only override the (already filtered) event-window cohorts with
  // it when internal traffic is included anyway.
  if (!excluded) {
    const sqlRetention = await retentionFromDb();
    if (sqlRetention) result.retention = sqlRetention;
  }
  return result;
}

/**
 * Per-owner activity rollup for the admin users view, most recently active
 * first. Owner keys are pseudonymous: a user id, guest id, or "ip-<addr>".
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function userActivity(limit = 200) {
  const { source, events } = await fetchEvents();
  const sets = internalSets(events);
  const users = new Map();
  for (const e of events) {
    const key = e.owner_key || 'anon';
    if (!users.has(key)) {
      users.set(key, {
        owner_key: key, first_seen: e.created_at, last_seen: e.created_at, events: 0,
        prompts: 0, browses: 0, shortlist_adds: 0, booking_clicks: 0,
        plans_built: 0, guides_saved: 0, signups: 0, cities: new Map(), ips: new Set()
      });
    }
    const u = users.get(key);
    u.events++;
    {
      const m = e.meta && typeof e.meta === 'object' ? e.meta : {};
      if (m.ip && u.ips.size < 5) u.ips.add(m.ip);
    }
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
        ips: [...u.ips],
        top_city: topCity ? topCity[0] : null,
        kind: u.owner_key.startsWith('ip-') ? 'ip' : (UUID_RE.test(u.owner_key) ? 'user' : 'guest'),
        // 'anon' is nobody — a single localhost event must not paint every
        // anonymous visitor internal (per-event exclusion still applies).
        internal: sets.owners.has(u.owner_key) ||
          (u.owner_key !== 'anon' && [...u.ips].some(ip => sets.ips.has(ip)))
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

module.exports = { recordEvent, countToday, metrics, userActivity, engagementByIdea, sanitizeAttrib, normalizeShelf, EVENT_TYPES, CLIENT_EVENT_TYPES };
