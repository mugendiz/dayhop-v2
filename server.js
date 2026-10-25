// server.js — DayHop V2
require('dotenv').config();
// Must load before any service module: installs keep-alive agents on
// axios.defaults so every axios.create() below inherits them.
require('./services/httpAgent');
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Render terminates TLS at a reverse proxy. Without this, req.ip is the
// proxy's address for every visitor, so all users share ONE rate-limit
// bucket (and express-rate-limit v7 flags the mismatch as an error).
app.set('trust proxy', 1);

// Canonical host. The Render hostname (and www) served the whole site as a
// second copy — Search Console flagged it "Duplicate without user-selected
// canonical" (2026-09-07). Aliases 301 to dayhop.quest; /health stays put so
// Render's health check (which hits the onrender host) keeps passing.
// GET/HEAD only: a redirected POST would drop its body.
const CANONICAL_HOST = 'dayhop.quest';
const ALIAS_HOSTS = new Set(['www.dayhop.quest', 'dayhop-v2.onrender.com', 'dayhop.onrender.com']);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path === '/health') return next();
  const host = (req.hostname || '').toLowerCase();
  if (ALIAS_HOSTS.has(host)) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }
  next();
});

// Static-file aliases of routed pages (/guides.html vs /guides, /index.html
// vs /) are the same duplicate problem one level down. Redirect the file
// name to the route so only one URL per page exists.
const PAGE_ALIASES = {
  '/index.html': '/',
  '/guides.html': '/guides',
  '/guide-richmond-hill.html': '/guides/richmond-hill',
  '/guide-richmond-hill-thanks.html': '/guides/richmond-hill/thanks',
  '/guide-personal.html': '/guides/personal',
  '/guide-personal-thanks.html': '/guides/personal/thanks'
};
app.use((req, res, next) => {
  const to = PAGE_ALIASES[req.path];
  if (!to || req.method !== 'GET') return next();
  const q = req.originalUrl.slice(req.path.length);
  res.redirect(301, to + q);
});

app.use(helmet({
  // CSP ships REPORT-ONLY first (2026-08-30): the allowlist below is built
  // from a live audit of every host the app actually touches. Watch
  // /api/csp-report noise for a week, then flip reportOnly to false.
  // ENFORCED 2026-09-11 (founder-approved) after a live 10-visit audit found
  // 0 violations. Roll back by setting reportOnly: true.
  // 'unsafe-inline' stays for now — index.html runs inline <script> blocks;
  // removing it needs build-time hashes (planned with asset hashing).
  contentSecurityPolicy: {
    useDefaults: true,
    reportOnly: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://www.googletagmanager.com',
        'https://connect.facebook.net'],
      // Inline handlers exist (font media-swap onload in index.html, feed
      // image onerror fallback in app.js, playbook print button). helmet's
      // default script-src-attr 'none' would kill them on enforce; script-src
      // already allows inline, so this adds no new exposure.
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://api.fontshare.com'],
      'font-src': ["'self'", 'data:',
        'https://fonts.gstatic.com',
        'https://cdn.fontshare.com'],
      // Feed card images are hotlinked from arbitrary partner/place hosts —
      // https: stays until the image proxy narrows this to 'self'.
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      // The service worker re-fetches fonts + the supabase client with
      // fetch(), which connect-src governs (the 2026-09-11 audit saw these
      // hosts refused once the SW was installed). GA4 collects on
      // region-specific *.google-analytics.com / *.googletagmanager.com hosts.
      'connect-src': ["'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://*.google-analytics.com',
        'https://*.analytics.google.com',
        'https://*.googletagmanager.com',
        'https://stats.g.doubleclick.net',
        'https://www.facebook.com',
        'https://cdn.jsdelivr.net',
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://api.fontshare.com',
        'https://cdn.fontshare.com'],
      'frame-ancestors': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'", 'https://checkout.stripe.com'],
      'report-uri': ['/api/csp-report']
    }
  }
}));

// Minimal Permissions-Policy: the app uses geolocation (share-location
// button) and nothing else sensor-shaped.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
  next();
});
app.use(compression());
// Same-origin traffic needs no CORS at all; the allowlist exists for the
// occasional cross-origin caller we actually mean to serve (the live site
// hitting the Render URL during DNS moves, localhost dev). Wildcard CORS
// let any website drive visitors' browsers at the metered endpoints.
const CORS_ORIGINS = new Set([
  'https://dayhop.quest',
  'https://www.dayhop.quest',
  'https://dayhop-v2.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);
app.use(cors({
  origin(origin, cb) {
    // No Origin header (same-origin, curl, server-to-server) → allow.
    if (!origin || CORS_ORIGINS.has(origin)) return cb(null, true);
    cb(null, false); // no CORS headers → browser blocks the read
  }
}));
// Request context (client IP) for deep call sites — analytics stamps every
// event with the requester's IP so the admin dashboard can tell internal
// (developer) traffic apart from real users.
app.use(require('./services/requestContext').middleware);
// Stripe webhook needs the raw body for signature verification, so it mounts
// BEFORE the JSON parser. Everything else gets parsed JSON as usual.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billingWebhook'));
// Resend delivery webhooks (outreach CRM signals) — Svix signatures need the
// raw bytes too, so this also mounts ahead of the JSON parser.
app.post('/api/webhooks/resend', express.raw({ type: 'application/json' }), require('./routes/resendWebhook'));
app.use(express.json({ limit: '100kb' }));

// Minified shell (build.js output, produced on postinstall). URL space is
// unchanged — index.html and sw.js keep referencing /app.js etc.; production
// just serves the minified bytes for those paths. Falls through untouched
// when a dist file is missing (fresh clone, failed build).
const fs = require('fs');
const minifiedShell = {};
if (isProd) {
  for (const [urlPath, distRel] of Object.entries({
    '/pixel.js': 'dist/pixel.min.js',
    '/app.js': 'dist/app.min.js',
    '/auth.js': 'dist/auth.min.js',
    '/motion.js': 'dist/motion.min.js',
    '/css/main.css': 'dist/main.min.css'
  })) {
    const abs = path.join(__dirname, 'public', distRel);
    if (fs.existsSync(abs)) minifiedShell[urlPath] = abs;
  }
  if (Object.keys(minifiedShell).length) {
    console.log(`[static] serving minified shell for: ${Object.keys(minifiedShell).join(', ')}`);
  }
}
// Content-hashed shell (build.js): /assets/* URLs change every deploy, so
// they can cache forever — Cloudflare serves the whole shell from edge even
// while a free-tier instance sleeps. dist/index.html references them.
const hashedIndex = path.join(__dirname, 'public', 'dist', 'index.html');
const hashedSw = path.join(__dirname, 'public', 'dist', 'sw.js');
const hasHashedShell = isProd && fs.existsSync(hashedIndex)
  && fs.existsSync(path.join(__dirname, 'public', 'dist', 'asset-manifest.json'));
if (hasHashedShell) {
  console.log('[static] hashed shell active (dist/index.html + /assets/*)');
  app.use('/assets', express.static(path.join(__dirname, 'public', 'dist', 'assets'), {
    immutable: true,
    maxAge: '365d',
    fallthrough: false
  }));
  // The SW itself must never be long-cached or updates stall for a day.
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/javascript');
    res.sendFile(fs.existsSync(hashedSw) ? hashedSw : path.join(__dirname, 'public', 'sw.js'));
  });
}

// Legacy stable-name minified shell — kept for HTML/SW cached before the
// hashing deploy; 5-minute cache bounds the skew window.
app.use((req, res, next) => {
  const abs = minifiedShell[req.path];
  if (!abs) return next();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(abs);
});

app.use(express.static(path.join(__dirname, 'public'), {
  // No directory index: '/' must fall through to the SPA fallback below,
  // which serves the content-hashed shell in production. With the default
  // index this middleware answered '/' with the unhashed public/index.html
  // and the whole /assets/ pipeline sat unused on the homepage.
  index: false,
  setHeaders(res, filePath) {
    // Icons are effectively immutable — a day of caching is safe. JS/CSS get
    // 5 minutes: sw.js now pre-caches the shell with cache:'reload' requests
    // (bypassing the HTTP cache), so a version bump can no longer pin a
    // stale deploy — and 5 min of no-revalidation removes a conditional
    // round trip from every navigation. HTML stays on pure ETag.
    if (/[\\/](icons|img|fonts)[\\/]/.test(filePath)) {
      // Images and fonts are content-stable (replaced, not edited in place)
      // — without a max-age every view revalidates and Cloudflare's edge
      // can't shield a sleeping Render instance.
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (/\.(js|css)$/.test(filePath) && isProd) {
      // Prod only: a 5-min cache in dev serves stale JS right after an edit.
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  }
}));

// Attach the signed-in user (if any) to every request before routes run.
const { attachUser } = require('./middleware/auth');
app.use(attachUser);

// Moderation: banned callers get 403 on the API (admin/config routes and the
// Stripe webhook — mounted above — stay reachable; admins are never blocked).
const { banGuard } = require('./services/moderation');
app.use('/api', banGuard);

// Generous but real limit on the AI endpoint — it's the expensive one.
// GETs are exempt: the two-phase flow polls GET /api/generate/result/:job
// every ~1.5s while curation runs, and that read costs nothing.
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});

app.use('/api/generate', generateLimiter, require('./routes/generate'));

// Instant discovery feed: no LLM and cached, but it still fans out to
// partner APIs on a cache miss — keep a real (if looser) ceiling on it.
const browseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/browse', browseLimiter, require('./routes/browse'));

// "Surprise me" / "Next" feed: no LLM, but never cached (per-user exclude
// lists) — every call fans out to partner APIs, so keep the ceiling tight
// enough that Next spam-clicks can't run unbounded.
const surpriseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/surprise', surpriseLimiter, require('./routes/surprise'));

// Detail enrichment: one Grok + one Places call per uncached place — cached
// 24h server-side, but still worth a ceiling against click-spamming Details.
const detailsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/details', detailsLimiter, require('./routes/details'));
app.use('/api/places', require('./routes/places'));
app.use('/api/photo', require('./routes/photo'));
// Geo lookups: reverse geocode fires once per location share, autocomplete
// once per (debounced) keystroke — cheap Essentials-tier calls, but typed
// input deserves a ceiling that absorbs fast typists without inviting abuse.
const geoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/geo', geoLimiter, require('./routes/geo'));
// Feed-image resize proxy: cache misses cost an outbound fetch + a resize,
// so it gets a real ceiling; Cloudflare's 7-day edge cache absorbs the rest.
const imgLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // a fresh feed paints ~20 cards; 120 covers fast browsing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/img', imgLimiter, require('./routes/img'));
app.use('/api/events', require('./routes/events'));
app.use('/api/config', require('./routes/config'));
app.use('/api/adventures', require('./routes/adventures'));
app.use('/api/community', require('./routes/community'));
app.use('/api/shortlist', require('./routes/shortlist'));
// Named shortlists ("My Favs" pages) — same auth gate as /api/shortlist.
app.use('/api/shortlists', require('./routes/shortlists'));
// Per-place weather chip for the tile modal. Served from the 10-minute
// ~11 km cache in services/weather, so a whole grid costs one upstream call;
// the limiter keeps a scripted client from draining the OpenWeather tier.
const weatherLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/weather', weatherLimiter, require('./routes/weather'));
// Checkout/portal POSTs each hit Stripe's API — cheap, but not free to spam.
const billingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/billing', billingLimiter, require('./routes/billing'));
// Paid city nature guides ($20 PDFs) — one-time Stripe checkout, guests
// welcome. Fulfillment rides the existing billing webhook.
// claim/checkout POSTs call Stripe (session retrieve / create) per hit.
const cityGuidesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // signed download links must not bounce
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/cityguides', cityGuidesLimiter, require('./routes/cityGuides'));
// Personalized trip guides (routes/personalGuides.js): the same POST cap;
// the status poll and signed downloads are GETs and carry their own limits.
app.use('/api/personal-guides', cityGuidesLimiter, require('./routes/personalGuides'));
// Dream Home rail (routes/dreamHomes.js): one cheap read of hand-entered
// open houses; the admin writes are under /api/admin/dream-homes.
app.use('/api/dream-homes', require('./routes/dreamHomes'));

// A plan-less POST /api/guides triggers a Grok call server-side — the save
// path must not be a free unmetered AI endpoint just because /generate is.
const guidesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little — try again in a moment.' }
});
app.use('/api/guides', guidesLimiter, require('./routes/guides'));

// Anonymous event sink: cheap per call, but unmetered it invites unbounded
// table growth and funnel pollution. 60/min covers any honest session.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
// Tally what /api/track actually answers, by status, since boot. A 503 seen
// by the browser that never shows up here came from the edge, not from
// Node — the distinction that settled the Sept 2026 "dropped events" hunt.
const trackStats = { received: 0, by_status: {} };
app.use('/api/track', (req, res, next) => {
  trackStats.received++;
  res.on('finish', () => {
    trackStats.by_status[res.statusCode] = (trackStats.by_status[res.statusCode] || 0) + 1;
  });
  next();
}, trackLimiter, require('./routes/track'));

// Newsletter consent endpoints: subscribe is a cheap write but each new email
// triggers a real outbound send (confirmation) — the limiter keeps a bot from
// burning the Resend quota or spraying confirmations at strangers' inboxes.
// 3/min, not 10. A person subscribes once; 10 POSTs a minute was only ever
// headroom for a mistake. With outbound mail live it is also the ceiling on
// how fast someone can cycle addresses through /subscribe, and every one of
// those is a real send: Resend's free tier is 100/day (services/email.js),
// so 10/min from a single IP exhausts a whole day's quota in ten minutes and
// the next city guide somebody PAID for silently fails to arrive. GETs stay
// exempt so confirm and unsubscribe links can never bounce.
const newsletterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // confirm/unsubscribe links must never bounce
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/newsletter', newsletterLimiter, require('./routes/newsletter'));

// Digest email tracking (open pixel + signed click redirects). GETs from
// email clients — never rate-limited, a bounced tracking link is a broken
// email. Signatures gate what gets counted, not what renders.
app.use('/api/digest', require('./routes/digestTrack'));

// Admin auth is a single shared key — without a ceiling the mount is an
// unthrottled online-guessing oracle. 30/min is generous for one operator.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/admin', adminLimiter, require('./routes/admin'));

// Inbound article publishing (BabyLoveGrowth → /blog). Secret-gated inside
// the route; the limiter is a backstop against secret-guessing.
const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/api/content', contentLimiter, require('./routes/content'));

const { dbStatus } = require('./services/db');

// Same header + constant-time compare as routes/admin.js — /health detail
// is operator information.
function adminKeyOk(req) {
  const expected = process.env.ADMIN_KEY || '';
  const provided = req.headers['x-admin-key'];
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

app.get('/health', (req, res) => {
  // Anonymous callers (uptime checks, the keep-alive ping) get a heartbeat.
  // Which API keys exist, the storage backend, and whether ADMIN_KEY is set
  // is recon material — that detail is for operators (dev, admin account,
  // or the admin key header).
  const { isAdmin } = require('./services/entitlements');
  if (isProd && !isAdmin(req.user) && !adminKeyOk(req)) {
    return res.json({ status: 'ok', version: '2.0' });
  }
  res.json({
    status: 'ok',
    version: '2.0',
    phase: 'Worldwide — real venues, weather, and bookable activities',
    storage: dbStatus(),
    integrations: {
      grok: Boolean(process.env.GROK_API_KEY),
      google_maps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      openweather: Boolean(process.env.OPENWEATHER_API_KEY),
      viator: Boolean(process.env.VIATOR_API_KEY),
      getyourguide: Boolean(process.env.GETYOURGUIDE_API_KEY),
      ticketmaster: Boolean(process.env.TICKETMASTER_API_KEY),
      eventbrite: Boolean(process.env.EVENTBRITE_PRIVATE_TOKEN && String(process.env.EVENTBRITE_ORG_IDS || '').trim()),
      seeker: Boolean(process.env.SEEKER_API_KEY && process.env.SEEKER_API_URL),
      attractions_ontario: true, // keyless WP REST feed, always on for GTA requests
      civic_calendars: true, // keyless municipal calendars, always on for GTA requests
      toronto_open_data: true, // keyless public feed, always on for GTA requests
      york_open_data: process.env.YORK_OPEN_DATA_ENABLED === 'true',
      stripe: require('./services/billing').status(),
      email: require('./services/email').status(),
      meta_ads: require('./services/metaPixel').status(),
      admin_metrics: Boolean(process.env.ADMIN_KEY)
    },
    // Did everything fire? Last-run stamps for every scheduled job (resets
    // on deploy — check process_uptime_hours before reading absence as death).
    schedulers: require('./services/heartbeat').status(),
    // Metered-API spend today vs. MAPS_DAILY_BUDGET_USD, per SKU, plus
    // whether the shared L2 cache is live (services/apiCache.js).
    maps_usage: require('./services/apiCache').usageStatus(),
    // Pre-bought venue rows vs. the full cells × vocabulary grid.
    venue_index: require('./services/venueIndex').status(),
    // /api/track requests Node has seen since boot, by response status.
    track_stats: trackStats
  });
});

// CSP violation reports (Report-Only phase). Logged compactly + counted;
// the /health schedulers block is the operator's window into whether the
// allowlist is clean enough to enforce. Body cap keeps this un-abusable.
let cspReportCount = 0;
app.post('/api/csp-report',
  express.json({ type: ['application/csp-report', 'application/json'], limit: '8kb' }),
  (req, res) => {
    cspReportCount++;
    if (cspReportCount <= 50 || cspReportCount % 100 === 0) {
      const r = (req.body && (req.body['csp-report'] || req.body)) || {};
      console.warn('[csp] violation #' + cspReportCount + ':',
        r['violated-directive'] || r.violatedDirective || '?',
        '→', String(r['blocked-uri'] || r.blockedURI || '?').slice(0, 120),
        'on', String(r['document-uri'] || r.documentURI || '?').slice(0, 80));
    }
    res.status(204).end();
  });

// Unknown API paths get a JSON 404 — never the SPA shell with a 200,
// which silently confuses API clients. Must come after every /api mount.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'No such API endpoint.' });
});

// Public shared-guide page: /g/<share_id> — the page itself fetches the
// guide JSON from /api/guides/shared/<share_id>.
app.get('/g/:shareId', (req, res) => {
  // guide.html is shared by every share id, so the canonical rides a header.
  res.setHeader('Link', `<https://${CANONICAL_HOST}/g/${encodeURIComponent(req.params.shareId)}>; rel="canonical"`);
  res.sendFile(path.join(__dirname, 'public', 'guide.html'));
});

// City Guides sales page ("City Guides — PDF"). Above the SPA fallback so
// /guides serves its own page, not the shell.
app.get('/guides', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guides.html'));
});

// Richmond Hill sales letter + its post-purchase page.
app.get('/guides/richmond-hill', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide-richmond-hill.html'));
});
app.get('/guides/richmond-hill/thanks', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide-richmond-hill-thanks.html'));
});

// Personalized trip guide: order page + its post-purchase page.
app.get('/guides/personal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide-personal.html'));
});
app.get('/guides/personal/thanks', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide-personal-thanks.html'));
});

// Server-rendered blog (SEO surface) + sitemap. Must sit above the SPA
// fallback or /blog would 200 with the shell and index as an empty page.
const blog = require('./routes/blog');
app.use('/blog', blog.router);
// Keyed profile links (/go/tiktok, /go/ig, …): log the tap, bounce to the
// keyed page. GETs from social apps — no limiter, a bounced bio link is a
// lost visitor.
app.use('/go', require('./routes/go'));
app.get('/sitemap.xml', blog.sitemap);

// Lead magnet: The GTA Family Weekend Playbook (token-gated full version,
// teaser + subscribe form without). Above the SPA fallback for the same
// reason as /blog.
app.use('/playbook', require('./routes/playbook'));

// Venue-facing media kit + sponsor inquiries (the B2B placement motion).
// Inquiry POSTs email the admin — same bot-vs-outbound-send logic as the
// newsletter limiter. GETs are exempt (it's a sales page; never bounce it).
const advertiseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  message: { error: 'RATE_LIMITED', message: 'Slow down a little.' }
});
app.use('/advertise', advertiseLimiter, require('./routes/advertise'));

// Digital Asset Links — proves to Android that the Play app (quest.dayhop.app)
// is allowed to open dayhop.quest full-screen as a Trusted Web Activity.
// express.static ignores dotfiles, so /.well-known needs its own route; it
// must sit above the SPA fallback or Android gets index.html and shows the
// browser bar. Fingerprints live in public/.well-known/assetlinks.json.
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/json');
  res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
});

// The SPA's actual home — no dedicated route existed for this before, so it
// was silently relying on the catch-all below. Must stay explicit and above
// it: the catch-all now answers 404, and '/' is the one path this shell
// legitimately serves with 200. In-page state (panels, filters) rides
// pushState/replaceState on this same path (see public/app.js) rather than
// routing to a different one, so this is the only entry point that needs it.
app.get('/', (req, res) => {
  res.sendFile(hasHashedShell ? hashedIndex : path.join(__dirname, 'public', 'index.html'));
});

// SPA fallback — must stay last. Every real page (/playbook, /guides,
// /blog/:slug, /g/:shareId, the '/' route above, ...) has its own explicit
// route, so anything reaching here is a genuinely unknown path — a typo, a
// dead link, a bot probe — and must answer 404, not 200 (a "soft 404":
// Google Search Console flags a 200-status unknown page as an indexing
// problem, not a graceful catch-all). Still serves the shell so a client-
// side deep link that only exists in app state doesn't dead-end visually.
app.get('*', (req, res) => {
  res.status(404).sendFile(hasHashedShell ? hashedIndex : path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler — catches anything thrown synchronously in routes.
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong on our end.'
  });
});

// A missed rejection anywhere (Node >=15 default: kill the process) must
// not take down the whole app — that turns any transient Supabase/Resend
// hiccup inside an unguarded async path into a full-site outage. Log loud,
// keep serving. uncaughtException stays fatal (state is suspect); Render
// restarts the instance.
let lastRejectionAlertAt = 0;
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
  // Same playbook as the Grok-outage alert: silent failure is the enemy.
  // At most one email per 12h — a rejection storm must not burn Resend quota.
  if (isProd && Date.now() - lastRejectionAlertAt > 12 * 60 * 60 * 1000) {
    lastRejectionAlertAt = Date.now();
    require('./services/email').sendEmail({
      to: process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com',
      subject: 'DayHop: unhandled promise rejection (server kept running)',
      text: 'An async code path rejected with no handler. The process was kept alive, but this is a bug worth finding.\n\n'
        + String((reason && reason.stack) || reason).slice(0, 1500)
        + '\n\nThis alert repeats at most every 12 hours.'
    }).catch(() => {});
  }
});

// Keep-alive: Render's free tier spins the instance down after ~15 min
// without inbound traffic, and the next visitor eats a 30-60 s cold start —
// fatal for a shared or demo link. While the process is up, pinging our own
// public URL counts as inbound traffic and keeps it warm. Render injects
// RENDER_EXTERNAL_URL automatically; set KEEP_ALIVE_URL to override, or
// KEEP_ALIVE_URL=off to disable (e.g. after moving to a paid instance).
const keepAliveBase = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (isProd && keepAliveBase && keepAliveBase !== 'off') {
  const ping = () => fetch(new URL('/health', keepAliveBase)).catch(() => {});
  setInterval(ping, 10 * 60 * 1000).unref();
  console.log(`[keepalive] pinging ${keepAliveBase}/health every 10 min`);
}

// Warm the default GTA-wide browse pool so the most common first-visit
// request (anonymous, no location chosen) is a cache hit instead of a cold
// 14-source fan-out. Runs shortly after boot (cold start included), then on
// the same 10-min cadence as keep-alive; a no-op while the pool is fresh.
// Runs on localhost too so the instant-load path is testable in dev; set
// WARM_POOL=off to skip it (e.g. to save partner-API calls while hacking).
// Restore today's metered-API spend counters BEFORE anything can call
// Google — the daily budget must survive the restart it is guarding against.
require('./services/apiCache').loadUsage().catch(() => {});

// Venue index (services/venueIndex.js): load the pre-bought Places rows on
// boot, then top up ≤ VENUE_INDEX_DAILY_CALLS stale/missing rows once a day
// in the 03:xx Toronto hour. This is the ONLY scheduled Google spend, and it
// scales with data/venueCells.js × data/feedPrompts.js, never with users.
// VENUE_INDEX_REFRESH=off disables the schedule (manual: scripts/crawl-venue-index.js).
{
  const venueIndex = require('./services/venueIndex');
  venueIndex.load().catch(() => {});
  if (isProd && process.env.VENUE_INDEX_REFRESH !== 'off') {
    let lastIndexRun = 0;
    const torontoHourNow = () => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', hour: '2-digit', hour12: false
    }).format(new Date());
    setInterval(() => {
      // Any hour 03–05 Toronto (the 20-min tick can miss a single hour after
      // a restart); the 20h guard keeps it to once a night.
      if (['03', '04', '05'].includes(torontoHourNow()) && Date.now() - lastIndexRun > 20 * 60 * 60 * 1000) {
        lastIndexRun = Date.now();
        require('./services/heartbeat').record('venue_index_refresh');
        const maxCalls = Number(process.env.VENUE_INDEX_DAILY_CALLS) || 30;
        venueIndex.refreshStale({ maxCalls })
          .then(r => console.log(`[venue-index] nightly refresh: ${r.fetched} rows fetched, ${r.remaining} still stale of ${r.total}`))
          .catch(err => console.warn('[venue-index] nightly refresh failed:', err.message))
          // Then warm tomorrow's top card photos (services/photoWarm.js), so
          // the first visitor of the day sees real pictures, not stock.
          .then(() => process.env.PHOTO_WARM === 'off' ? null : require('./services/photoWarm').warmPhotos())
          .then(r => r && console.log(`[photo-warm] ${r.resolved} resolved, ${r.cached} already cached, ${r.failed} failed of ${r.candidates} top cards`))
          .catch(err => console.warn('[photo-warm] failed:', err.message));
      }
    }, 20 * 60 * 1000).unref();
  }
}

if (process.env.WARM_POOL !== 'off') {
  const { warmDefaultPool } = require('./routes/browse');
  const warm = () => warmDefaultPool().catch(() => {});
  setTimeout(warm, isProd ? 30 * 1000 : 5 * 1000).unref();
  setInterval(warm, 10 * 60 * 1000).unref();
}

// Revenue-leak sweeps (2026-10-19): abandoned-checkout recovery + newsletter
// confirm nudge. Every 15 minutes. Both are idempotent and fail-soft.
// RECOVERY_SWEEP=off disables the pair (manual: admin endpoints below).
// The recovery email itself additionally requires RECOVERY_EMAILS=on — the
// copy is DRAFT until Andrew approves it, so a deploy alone never sends.
if (process.env.RECOVERY_SWEEP !== 'off') {
  const sweep = () => {
    require('./services/heartbeat').record('recovery_sweep');
    require('./services/checkoutRecovery').runRecoverySweep()
      .catch(err => console.warn('[recovery] sweep failed:', err.message));
    require('./services/newsletter').runConfirmNudge()
      .catch(err => console.warn('[newsletter] nudge failed:', err.message));
  };
  setTimeout(sweep, 60 * 1000).unref();
  setInterval(sweep, 15 * 60 * 1000).unref();
}

// Discovery autopilot: every SUNDAY AT MIDNIGHT (Toronto time) scan
// Canada-wide local media, verify finds (Google Places + Grok), and
// publish passers into the live catalog. The admin "Scan
// feeds" button still works on demand any day. A 20-min clock check with a
// ran-recently guard is DST-proof and survives restarts mid-window; the
// keep-alive ping keeps the free-tier instance awake for it.
// Set DISCOVERY_AUTO=off to disable the schedule (manual scans unaffected).
if (process.env.GROK_API_KEY && process.env.DISCOVERY_AUTO !== 'off') {
  const runDiscovery = () => require('./services/newOpenings').collect()
    .then(d => {
      const published = (d.items || []).filter(i => i.auto && i.auto.added).length;
      if (published) console.log(`[discovery] autopilot published ${published} new entr${published === 1 ? 'y' : 'ies'}`);
    })
    .catch(err => console.warn('[discovery] auto scan failed:', err.message));

  let lastDiscoveryRun = 0;
  const isSundayMidnightToronto = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', hour12: false
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return parts.weekday === 'Sun' && (parts.hour === '00' || parts.hour === '24');
  };
  setInterval(() => {
    if (isSundayMidnightToronto() && Date.now() - lastDiscoveryRun > 12 * 60 * 60 * 1000) {
      lastDiscoveryRun = Date.now();
      require('./services/heartbeat').record('discovery_scan');
      console.log('[discovery] Sunday-midnight Canada-wide scan starting');
      runDiscovery();
    }
  }, 20 * 60 * 1000).unref();
}

// "Talk of the town" (services/talkOfTown.js): every SUNDAY AT MIDNIGHT
// (Toronto), right after the discovery autopilot, refresh the week's verified
// outdoor picks for Toronto plus every hub that saw browse traffic in the
// last two weeks (one Grok live-search call + a few Places lookups per hub).
// On boot, a Toronto shelf with no rows for this week refreshes once (the DB
// is checked first, so a redeploy never re-buys a run). TOTT_AUTO=off
// disables both; the admin panel's Refresh button still works.
if (process.env.GROK_API_KEY && process.env.TOTT_AUTO !== 'off') {
  const tott = require('./services/talkOfTown');
  // Boot, then hourly: a Toronto shelf with no rows this week (or a run the
  // Maps budget cut short yesterday) refreshes, at most once per 3 h.
  setTimeout(() => {
    tott.checkStaleOnBoot().catch(err => console.warn('[talk-of-town] boot check failed:', err.message));
  }, isProd ? 90 * 1000 : 15 * 1000).unref();
  setInterval(() => {
    tott.checkStale({ reason: 'stale-hourly' }).catch(err => console.warn('[talk-of-town] stale check failed:', err.message));
  }, 60 * 60 * 1000).unref();
  let lastTottRun = 0;
  const isSundayMidnightToronto = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', hour12: false
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return parts.weekday === 'Sun' && (parts.hour === '00' || parts.hour === '24');
  };
  setInterval(() => {
    if (isSundayMidnightToronto() && Date.now() - lastTottRun > 12 * 60 * 60 * 1000) {
      lastTottRun = Date.now();
      require('./services/heartbeat').record('tott_refresh');
      console.log('[talk-of-town] Sunday refresh starting');
      tott.refreshDue({ reason: 'weekly' })
        .then(runs => console.log(`[talk-of-town] weekly: ${runs.map(r => `${r.hub}=${r.published}`).join(', ')}`))
        .catch(err => console.warn('[talk-of-town] weekly refresh failed:', err.message));
    }
  }, 20 * 60 * 1000).unref();
  console.log('[talk-of-town] weekly schedule armed: Sundays 00:xx Toronto' + (feedLayoutNote()));
}
function feedLayoutNote() {
  return String(process.env.TOP5_FEED || '').toLowerCase() === 'on' ? ' · home feed layout: top5' : ' · home feed layout: full';
}

// Weekly digest: every THURSDAY MORNING (Toronto time) — the moment GTA
// families start asking "what are we doing this weekend?", and the send slot
// the local-newsletter evidence (Mommy Poppins' Wednesday weekend-picks,
// Tue-Thu newsletter benchmarks) converges on. Same DST-proof clock-check
// pattern as the discovery autopilot above. DIGEST_HOUR overrides the hour
// (0-23 Toronto); DIGEST_AUTO=off disables the schedule (admin manual send
// still works). Requires RESEND_API_KEY, else the tick is a silent no-op.
if (process.env.RESEND_API_KEY && process.env.DIGEST_AUTO !== 'off') {
  const digestHour = String(Math.min(23, Math.max(0, Number(process.env.DIGEST_HOUR) || 9))).padStart(2, '0');
  let lastDigestRun = 0;
  const isThursdayDigestHourToronto = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', hour12: false
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return parts.weekday === 'Thu' && parts.hour === digestHour;
  };
  setInterval(() => {
    if (isThursdayDigestHourToronto() && Date.now() - lastDigestRun > 12 * 60 * 60 * 1000) {
      lastDigestRun = Date.now();
      require('./services/heartbeat').record('weekly_digest');
      console.log('[digest] Thursday send window — building the weekend brief');
      require('./services/digest').sendDigest()
        .catch(err => console.warn('[digest] weekly send failed:', err.message));
    }
  }, 20 * 60 * 1000).unref();
  console.log(`[digest] weekly schedule armed: Thursdays ${digestHour}:00-${digestHour}:59 Toronto`);
}

// Talk of the town newsletter: every MONDAY MORNING (Toronto time) — the
// Sunday-midnight refresh above (services/talkOfTown.js) has already
// verified this week's shelf by then, so Monday's send is always this
// week's picks. Same subscriber list, same DST-proof clock-check pattern as
// the Thursday digest. TOTT_DIGEST_HOUR overrides the hour (0-23 Toronto);
// TOTT_DIGEST_AUTO=off disables the schedule (admin manual send still
// works). Requires RESEND_API_KEY, else the tick is a silent no-op.
if (process.env.RESEND_API_KEY && process.env.TOTT_DIGEST_AUTO !== 'off') {
  const tottDigestHour = String(Math.min(23, Math.max(0, Number(process.env.TOTT_DIGEST_HOUR) || 9))).padStart(2, '0');
  let lastTottDigestRun = 0;
  const isMondayDigestHourToronto = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', hour12: false
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return parts.weekday === 'Mon' && parts.hour === tottDigestHour;
  };
  setInterval(() => {
    if (isMondayDigestHourToronto() && Date.now() - lastTottDigestRun > 12 * 60 * 60 * 1000) {
      lastTottDigestRun = Date.now();
      require('./services/heartbeat').record('tott_digest');
      console.log('[tott-digest] Monday send window — building talk of the town');
      require('./services/tottDigest').sendTottDigest()
        .catch(err => console.warn('[tott-digest] weekly send failed:', err.message));
    }
  }, 20 * 60 * 1000).unref();
  console.log(`[tott-digest] weekly schedule armed: Mondays ${tottDigestHour}:00-${tottDigestHour}:59 Toronto`);
}

// Panel roles bootstrap: guarantee exactly one owner row exists in
// admin_users (seeds from ADMIN_EMAILS / the founder). Fail-soft.
require('./services/outreach').ensureOwnerSeed()
  .catch(err => console.warn('[outreach] owner seed failed:', err.message));

// Accounting: materialize this month's due recurring expenses at 2 AM
// Toronto. Deliberately NOT inside the RESEND-gated block below — the books
// must not depend on email config. Idempotent monthly keys mean a sleeping
// free-tier instance simply catches up on its next wake.
{
  let lastAccountingRun = 0;
  const torontoHour = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: '2-digit', hour12: false
  }).format(new Date());
  setInterval(() => {
    if (torontoHour() === '02' && Date.now() - lastAccountingRun > 12 * 60 * 60 * 1000) {
      lastAccountingRun = Date.now();
      require('./services/heartbeat').record('accounting_recurring');
      require('./services/accounting').materializeRecurring()
        .catch(err => console.warn('[accounting] recurring materialize failed:', err.message));
    }
  }, 20 * 60 * 1000).unref();
  console.log('[accounting] recurring-expense schedule armed: daily 02h (Toronto)');
}

// Outreach cadence: EVERY MORNING AT 8 (Toronto) send whatever follow-ups
// are due (opener day 0 after approval, bump day 4, closing note day 10),
// then on MONDAYS AT 9 send the operator report. Same DST-proof clock-check
// pattern as the digest. OUTREACH_AUTO=off disables the cadence,
// OPERATOR_REPORT=off the report; the CRM tab's manual buttons still work.
if (process.env.RESEND_API_KEY) {
  let lastCadenceRun = 0;
  let lastReportRun = 0;
  let lastSocialRun = 0;
  let lastSocialMonthRun = 0;
  const remindersSent = new Set();
  // One-off sends of the user report (services/orderReport.js) to the
  // operator inbox, for when the founder asks for a range on a phone. From
  // 9 AM on the date, once per range: the DB-backed event count keyed by the
  // range is the guard, so a redeploy or restart never sends one twice.
  // Oct 19: the all-time report, then "a user report from jan to date,
  // including unsubscribes".
  const USER_REPORT_SENDS = [{ on: '2026-10-19', since: '2026-01-01' }];
  let userReportInFlight = false;
  const sendDueUserReports = (parts, today) => {
    const due = USER_REPORT_SENDS.filter(r => r.on === today && Number(parts.hour) >= 9);
    if (!due.length || userReportInFlight) return;
    userReportInFlight = true;
    const orderReport = require('./services/orderReport');
    (async () => {
      for (const r of due) {
        const n = await require('./services/analytics').countToday('orders_report_emailed', orderReport.reportGuardKey(r.since));
        if (n > 0) continue;
        const res = await orderReport.emailReport({ since: r.since });
        console.log(`[orders] user report ${r.since || 'all time'} emailed: ${res.sent ? 'sent' : res.reason}`);
      }
    })()
      .catch(err => console.warn('[orders] one-off user report failed:', err.message))
      .finally(() => { userReportInFlight = false; });
  };
  // Also two minutes after boot, so a report asked for today lands within
  // minutes of the deploy rather than at the next 20-minute tick.
  setTimeout(() => {
    const parts = torontoParts();
    sendDueUserReports(parts, `${parts.year}-${parts.month}-${parts.day}`);
  }, 2 * 60 * 1000).unref();
  // One-off operator reminders, Toronto-date-keyed. Fire at 9 AM alongside
  // the other operator email slots; each key sends at most once per process
  // (and the dates pass, so a restart can't spam much).
  const REMINDERS = [
    { date: '2026-08-25', subject: 'DMZ application: one week to the Sept 1 deadline',
      text: 'The DMZ incubator application is due Monday September 1. The ready-to-paste draft answers are saved (ask Claude for "DMZ application draft"), and /api/admin/traction has current numbers for the metrics questions. Budget an hour this week; do not leave it for the weekend.' },
    { date: '2026-08-30', subject: 'DMZ application: due in 2 days',
      text: 'Final call — the DMZ application closes Monday September 1. Draft answers are saved in Claude memory; traction numbers are at /api/admin/traction. Submit today or tomorrow.' }
  ];
  const torontoParts = () => Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', weekday: 'short', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', hour12: false
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  setInterval(() => {
    const parts = torontoParts();
    const heartbeat = require('./services/heartbeat');
    if (process.env.OUTREACH_AUTO !== 'off'
        && parts.hour === '08' && Date.now() - lastCadenceRun > 12 * 60 * 60 * 1000) {
      lastCadenceRun = Date.now();
      heartbeat.record('outreach_cadence');
      require('./services/outreach').tick()
        .catch(err => console.warn('[outreach] cadence tick failed:', err.message));
    }
    if (process.env.OPERATOR_REPORT !== 'off'
        && parts.weekday === 'Mon' && parts.hour === '09'
        && Date.now() - lastReportRun > 12 * 60 * 60 * 1000) {
      lastReportRun = Date.now();
      heartbeat.record('operator_report');
      require('./services/operatorReport').sendReport()
        .catch(err => console.warn('[report] Monday report failed:', err.message));
    }
    // Tuesday social batch: Grok drafts the week's posts (needs the AI key).
    if (process.env.SOCIAL_BATCH !== 'off' && process.env.GROK_API_KEY
        && parts.weekday === 'Tue' && parts.hour === '09'
        && Date.now() - lastSocialRun > 12 * 60 * 60 * 1000) {
      lastSocialRun = Date.now();
      heartbeat.record('social_batch');
      require('./services/socialBatch').sendBatch()
        .catch(err => console.warn('[social] Tuesday batch failed:', err.message));
    }
    // Monthly social plan: on the 24th at 10, next month's calendar from the
    // formula (data/socialFormula.js), with the CSV and the month's photos
    // attached, so the photo posts can be scheduled in one sitting before
    // the month starts. Grok drafts the captions when the key is set;
    // without it the plan still sends, with plain captions flagged to fix.
    // SOCIAL_MONTH=off disables it; /api/admin/social/month still works.
    if (process.env.SOCIAL_MONTH !== 'off'
        && parts.day === '24' && parts.hour === '10'
        && Date.now() - lastSocialMonthRun > 12 * 60 * 60 * 1000) {
      lastSocialMonthRun = Date.now();
      heartbeat.record('social_month');
      require('./services/socialMonth').sendMonth()
        .catch(err => console.warn('[social-month] monthly plan failed:', err.message));
    }
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    sendDueUserReports(parts, today);
    for (const r of REMINDERS) {
      if (r.date === today && parts.hour === '09' && !remindersSent.has(r.date)) {
        remindersSent.add(r.date);
        require('./services/email').sendEmail({
          to: process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com',
          subject: r.subject, text: r.text
        }).catch(() => {});
        console.log(`[reminders] sent: ${r.subject}`);
      }
    }
  }, 20 * 60 * 1000).unref();
  console.log('[outreach] operator automation armed: cadence daily 08h, report Mon 09h, social batch Tue 09h (Toronto)');
}

const server = app.listen(PORT, () => {
  console.log(`🚀 DayHop V2 running on http://localhost:${PORT}`);
  if (!process.env.GROK_API_KEY) {
    console.warn('⚠️  GROK_API_KEY not set — AI planning will return 503 until configured.');
  }
  if (!dbStatus().persistent) {
    console.warn('⚠️  Supabase not configured — using in-memory storage (data is wiped on restart). Set SUPABASE_URL + keys to persist.');
  }
  if (!isProd) {
    console.log('   Running in development mode.');
  }
});

// Render sends SIGTERM on every deploy — finish in-flight requests instead
// of dropping them mid-response.
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — draining connections');
  server.close(() => process.exit(0));
});
