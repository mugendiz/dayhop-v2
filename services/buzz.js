// services/buzz.js — DayHop V2 (discovery Phase 2)
// "How loud is the internet about this place right now?" A 0–100 buzz score
// per candidate, blended from up to three signals:
//
//   - Google News RSS (ALWAYS ON, keyless — verified 2026-07-24): article
//     count + recency for `"name" area when:30d`, CA-localized. Local-media
//     coverage is the upstream feeder of social virality, so this alone is
//     a solid proxy.
//   - Reddit (OPTIONAL — set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET, a free
//     "script" app at reddit.com/prefs/apps): post count + engagement across
//     GTA subreddits, via application-only OAuth. NOTE: unauthenticated
//     www.reddit.com/*.json is hard-403'd (verified 2026-07-24) — do not
//     "simplify" this back to the keyless endpoint.
//   - YouTube Data API (OPTIONAL — set YOUTUBE_API_KEY): video count + view
//     velocity over the last 30 days. ~100 units per check on the free
//     10k/day quota.
//
// Missing sources contribute 0 and are reported as absent, never faked.
// Never throws; per-name results cached 24h (the decay is inherent — every
// signal is a rolling 30-day window).

const axios = require('axios');

const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 300;
const SUBREDDITS = 'toronto+askTO+ontario+ottawa+Hamilton+londonontario+KingstonOntario+Guelph+barrie+waterloo+NiagaraFalls+CanadasWonderland';

const client = axios.create({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
});

const cache = new Map();
let warned = { reddit: false, youtube: false, news: false };

const log2p = (x) => Math.log2(1 + Math.max(0, x));

// ---------- Google News RSS ----------
async function newsSignal(name, area) {
  try {
    const q = `"${name}" ${String(area || '').split(',')[0]} when:30d`.trim();
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-CA&gl=CA&ceid=CA:en`;
    const res = await client.get(url);
    const xml = String(res.data);
    const items = xml.split(/<item>/i).slice(1);
    let recent = 0;
    for (const block of items) {
      const m = block.match(/<pubDate>([^<]+)<\/pubDate>/i);
      const t = m ? Date.parse(m[1]) : NaN;
      if (!isNaN(t) && Date.now() - t <= 7 * 24 * 3600 * 1000) recent++;
    }
    return { articles: items.length, last_7d: recent };
  } catch (err) {
    if (!warned.news) { console.warn('[buzz] news unavailable:', err.message); warned.news = true; }
    return null;
  }
}

// ---------- Reddit (application-only OAuth) ----------
let redditToken = { value: null, expires: 0 };

async function redditAuth() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (redditToken.value && Date.now() < redditToken.expires) return redditToken.value;
  const res = await axios.post('https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      timeout: 8000,
      auth: { username: id, password: secret },
      headers: { 'User-Agent': 'DayHop/2.0 buzz (by /u/dayhop-app)', 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  redditToken = {
    value: res.data.access_token,
    expires: Date.now() + Math.max(60, (res.data.expires_in || 3600) - 120) * 1000
  };
  return redditToken.value;
}

async function redditSignal(name) {
  try {
    const token = await redditAuth();
    if (!token) return null; // not configured — expected-absent
    const res = await axios.get(`https://oauth.reddit.com/r/${SUBREDDITS}/search`, {
      timeout: 8000,
      params: { q: `"${name}"`, restrict_sr: 'on', sort: 'top', t: 'month', limit: 25 },
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'DayHop/2.0 buzz (by /u/dayhop-app)' }
    });
    const posts = ((res.data && res.data.data && res.data.data.children) || []).map(c => c.data);
    const engagement = posts.reduce((sum, p) => sum + Math.min(500, p.ups || 0) + 2 * (p.num_comments || 0), 0);
    return { posts: posts.length, engagement };
  } catch (err) {
    if (!warned.reddit) { console.warn('[buzz] reddit unavailable:', err.message); warned.reddit = true; }
    return null;
  }
}

// ---------- YouTube Data API ----------
async function youtubeSignal(name, area) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null; // not configured — expected-absent
  try {
    const publishedAfter = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const search = await client.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'id', q: `${name} ${String(area || '').split(',')[0]}`.trim(), type: 'video', publishedAfter, maxResults: 10, key }
    });
    const ids = ((search.data && search.data.items) || []).map(i => i.id && i.id.videoId).filter(Boolean);
    if (!ids.length) return { videos: 0, views: 0 };
    const stats = await client.get('https://www.googleapis.com/youtube/v3/videos', {
      params: { part: 'statistics', id: ids.join(','), key }
    });
    const views = ((stats.data && stats.data.items) || [])
      .reduce((sum, v) => sum + Number((v.statistics && v.statistics.viewCount) || 0), 0);
    return { videos: ids.length, views };
  } catch (err) {
    if (!warned.youtube) { console.warn('[buzz] youtube unavailable:', err.message); warned.youtube = true; }
    return null;
  }
}

// ---------- Blend ----------
// News ≤ 40, Reddit ≤ 35, YouTube ≤ 25 — log curves so the difference
// between 0 and 3 articles matters more than between 20 and 30.
function blend(news, reddit, youtube) {
  let score = 0;
  if (news) score += Math.min(40, Math.round(9 * log2p(news.articles) + 4 * log2p(news.last_7d)));
  if (reddit) score += Math.min(35, Math.round(8 * log2p(reddit.posts) + 5 * log2p(reddit.engagement / 50)));
  if (youtube) score += Math.min(25, Math.round(7 * log2p(youtube.videos) + 4 * log2p(youtube.views / 10000)));
  return Math.min(100, score);
}

/**
 * Buzz for one place name. { score, news, reddit, youtube, checked_at } —
 * absent/unconfigured sources are null. Cached 24h per name.
 */
async function scoreBuzz({ name, area } = {}) {
  if (!name) return null;
  const key = String(name).toLowerCase().trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const [news, reddit, youtube] = await Promise.all([
    newsSignal(name, area),
    redditSignal(name),
    youtubeSignal(name, area)
  ]);
  const value = { score: blend(news, reddit, youtube), news, reddit, youtube, checked_at: new Date().toISOString() };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

module.exports = { scoreBuzz };
