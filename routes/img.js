// routes/img.js — feed-image resize proxy.
// Card images arrive as raw hotlinks from partner sites and Google place
// photos (worst seen live: a 2.6 MB PNG rendered ~400px wide). This route
// fetches the original once, resizes to WebP, and lets HTTP caching (7d,
// so Cloudflare's edge holds it) do the rest.
//
// SSRF posture: https only, hostname must not be an IP literal or resolve
// to a private/loopback/link-local range, response must be an image, size
// capped, timeout enforced. The URL is client-supplied but the route can
// only ever return image bytes — it never relays headers or non-image
// bodies.
const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const router = express.Router();

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
// Fixed menu → cacheable URLs. 240/360/720 are the mobile tile + modal
// sizes (Sept 2026); before, they silently normalized to 640.
const WIDTHS = new Set([240, 320, 360, 480, 640, 720, 960]);

// In-process LRU on top of HTTP caching — repeat cards within one instance
// lifetime skip the refetch entirely.
const cache = new Map(); // key -> { bytes, type, at }
const CACHE_MAX = 150;
function cacheGet(k) {
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); } // LRU bump
  return hit || null;
}
function cachePut(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')
      || low.startsWith('::ffff:'); // v4-mapped — re-checked below anyway, refuse outright
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

async function hostAllowed(hostname) {
  if (net.isIP(hostname)) return false; // no IP-literal fetches, ever
  try {
    const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every(a => !privateIp(a.address));
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.u || ''));
  } catch {
    return res.status(400).json({ error: 'BAD_URL' });
  }
  if (url.protocol !== 'https:') return res.status(400).json({ error: 'HTTPS_ONLY' });
  const w = WIDTHS.has(Number(req.query.w)) ? Number(req.query.w) : 640;

  const key = w + '|' + url.href;
  const hit = cacheGet(key);
  if (hit) {
    res.setHeader('Content-Type', hit.type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Img-Cache', 'hit');
    return res.end(hit.bytes);
  }

  if (!(await hostAllowed(url.hostname))) {
    return res.status(400).json({ error: 'HOST_NOT_ALLOWED' });
  }

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'User-Agent': 'DayHopImageProxy/1.0 (+https://dayhop.quest)' }
    });
    if (!upstream.ok) return res.status(502).json({ error: 'UPSTREAM_' + upstream.status });
    const type = upstream.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return res.status(415).json({ error: 'NOT_AN_IMAGE' });
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_SOURCE_BYTES) return res.status(413).json({ error: 'SOURCE_TOO_LARGE' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) return res.status(413).json({ error: 'SOURCE_TOO_LARGE' });

    let out, outType;
    try {
      const sharp = require('sharp');
      out = await sharp(buf, { animated: false })
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();
      outType = 'image/webp';
    } catch (err) {
      // sharp missing or unsupported format — pass the original through
      // (still capped + verified image/*), so cards never lose their photo.
      out = buf;
      outType = type;
    }

    cachePut(key, { bytes: out, type: outType, at: Date.now() });
    res.setHeader('Content-Type', outType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.end(out);
  } catch (err) {
    res.status(504).json({ error: 'FETCH_FAILED' });
  }
});

module.exports = router;
