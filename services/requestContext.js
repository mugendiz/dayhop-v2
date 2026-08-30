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

// Caveat to the note above: "neither can be spoofed" only holds when the
// request actually came through Cloudflare. The Render origin is reachable
// directly (dayhop-v2.onrender.com), and there a caller sets these headers
// freely — defeating every per-IP limiter, ip-* ban and the internal-traffic
// exclusion. So the headers are honoured only when the connecting peer
// (req.ip, resolved by trust-proxy) is inside Cloudflare's published ranges
// (https://www.cloudflare.com/ips/ — stable for years).
const CF_V4 = [
  ['173.245.48.0', 20], ['103.21.244.0', 22], ['103.22.200.0', 22],
  ['103.31.4.0', 22], ['141.101.64.0', 18], ['108.162.192.0', 18],
  ['190.93.240.0', 20], ['188.114.96.0', 20], ['197.234.240.0', 22],
  ['198.41.128.0', 17], ['162.158.0.0', 15], ['104.16.0.0', 13],
  ['104.24.0.0', 14], ['172.64.0.0', 13], ['131.0.72.0', 22]
];
// All published v6 ranges are /32 or wider — prefix match on the first two
// hextets is exact.
const CF_V6_PREFIXES = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c0:', '2c0f:f248:'];

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const oct of parts) {
    if (!/^\d{1,3}$/.test(oct)) return null;
    const o = Number(oct);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n;
}

function isCloudflarePeer(ip) {
  if (!ip) return false;
  let v = String(ip).trim();
  if (v.startsWith('::ffff:')) v = v.slice(7); // v4-mapped v6
  if (v.includes(':')) {
    const low = v.toLowerCase();
    return CF_V6_PREFIXES.some(p => low.startsWith(p));
  }
  const n = ipv4ToInt(v);
  if (n === null) return false;
  return CF_V4.some(([base, bits]) => {
    const b = ipv4ToInt(base);
    const mask = ((~0 >>> 0) << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

function clientIp(req) {
  if (isCloudflarePeer(req.ip)) {
    for (const h of CLIENT_IP_HEADERS) {
      const v = req.headers[h];
      if (typeof v === 'string' && IP_RE.test(v.trim())) return v.trim();
    }
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

module.exports = { middleware, getIp, clientIp, isCloudflarePeer };
