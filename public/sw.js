// public/sw.js — DayHop V2 offline shell
// Strategy:
//   - App shell (HTML/JS/CSS/manifest/icon) is pre-cached on install, so the
//     app opens with no connection. Shortlist/plans/mode already live in
//     localStorage, so an offline open still shows the user's own stuff.
//   - Navigations are network-first (deploys land immediately), falling back
//     to the cached shell offline.
//   - Other same-origin static GETs + font/CDN assets are
//     stale-while-revalidate: instant from cache, refreshed in background.
//   - /api/* is never cached — live data must never go stale silently, and
//     the app already degrades gracefully when those fetches fail. One
//     exception: /api/guides/shared/* (public, immutable-ish guide JSON) is
//     stale-while-revalidate so a revisited share link opens instantly even
//     through a free-tier cold start.
// Bump the version to invalidate every cached asset on the next visit.
const CACHE = 'dayhop-shell-v14'; // v14: in-feed email capture card + earned moment

const SHELL = [
  '/',
  '/app.js',
  '/auth.js',
  '/motion.js',
  '/css/main.css',
  '/manifest.webmanifest',
  '/icons/icon.svg'
];

// Cross-origin hosts safe to cache (fonts + the supabase client script).
// Unsplash photos are deliberately excluded — they'd eat the cache quota.
const CDN_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'api.fontshare.com',
  'cdn.fontshare.com',
  'cdn.jsdelivr.net'
]);

self.addEventListener('install', (event) => {
  // cache:'reload' bypasses the HTTP cache: a version bump always pulls the
  // freshly-deployed assets from the network, never a max-age'd stale copy.
  // This is what makes it safe for the server to put max-age on JS/CSS.
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POSTs (generate/browse/track) hit the network
  const url = new URL(req.url);

  // Page loads: freshest available, cached copy when offline. Cache under
  // the actual URL — putting every navigation under '/' let a shared-guide
  // visit replace the app shell in the offline cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          // waitUntil: the SW must not be terminated mid-write.
          event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('/')))
    );
    return;
  }

  const cacheable = url.origin === location.origin
    ? (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/guides/shared/'))
    : CDN_HOSTS.has(url.hostname);
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req)
        .then(res => {
          // Opaque responses (no-cors CDN assets) are cacheable too.
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
          } else if (res && (res.status === 404 || res.status === 410)) {
            // The server says this resource is GONE (e.g. a deleted shared
            // guide). Evict the cached copy so the delete actually sticks —
            // "its share link stops working" must be true on every device
            // that ever opened it, not just until the next SW version bump.
            // Transient 5xx do NOT evict; surviving cold starts is the
            // whole point of caching shared guides.
            event.waitUntil(caches.open(CACHE).then(c => c.delete(req)));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
