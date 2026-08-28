// services/requestContext.js — DayHop V2
// Per-request context via AsyncLocalStorage, so deep call sites (analytics
// recordEvent, mostly) can read request facts like the client IP without
// every route threading `req` down through the service layer. Cron/startup
// work runs outside any request → getIp() returns null there, by design.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Real visitor IP. Render fronts every service with Cloudflare, so the
// X-Forwarded-For chain that `trust proxy` resolves ends at a Cloudflare
// edge (104.23.x / 172.6x-7x.x) — every visitor looked like a CDN node and
// per-IP internal-traffic exclusion, the Traffic-by-IP table and the
// ip-* owner keys were all keyed on edges instead of people (Aug 2026).
// Cloudflare stamps the true client in CF-Connecting-IP (Render also
// forwards True-Client-IP); neither can be spoofed by the visitor because
// the edge overwrites them. Fallback stays req.ip for local/dev traffic.
const CLIENT_IP_HEADERS = ['cf-connecting-ip', 'true-client-ip'];
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

function clientIp(req) {
  for (const h of CLIENT_IP_HEADERS) {
    const v = req.headers[h];
    if (typeof v === 'string' && IP_RE.test(v.trim())) return v.trim();
  }
  return req.ip || null;
}

// Express middleware: everything downstream of this (including awaited
// service calls) sees the request's context. Also rewrites req.ip so the
// rate limiters, ip-* owner keys, CASL consent records and moderation all
// see the same real address.
function middleware(req, res, next) {
  const ip = clientIp(req);
  if (ip && ip !== req.ip) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true, writable: false });
  }
  als.run({ ip }, next);
}

function getIp() {
  const store = als.getStore();
  return (store && store.ip) || null;
}

module.exports = { middleware, getIp, clientIp };
