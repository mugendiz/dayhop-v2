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
//     the app already degrades gracefully when those fetches fail.
// Bump the version to invalidate every cached asset on the next visit.
const CACHE = 'dayhop-shell-v1';

const SHELL = [
  '/',
  '/app.js',
  '/auth.js',
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
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
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

  // Page loads: freshest available, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  const cacheable = url.origin === location.origin
    ? !url.pathname.startsWith('/api/')
    : CDN_HOSTS.has(url.hostname);
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req)
        .then(res => {
          // Opaque responses (no-cors CDN assets) are cacheable too.
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
