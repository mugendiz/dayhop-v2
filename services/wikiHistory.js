// services/wikiHistory.js — DayHop V2
// The history pages of a personalized guide: the city's Wikipedia summary
// and the opening paragraphs of its History section, quoted as written and
// credited (CC BY-SA 4.0 requires attribution and the licence name, both on
// the page and in the guide's credits). Nothing here is paraphrased or
// generated, so nothing here can be invented.
//
// Keyless REST + action API, a descriptive User-Agent (Wikimedia policy),
// cached 30 days. Ontario only: a page whose summary never mentions Ontario
// is the wrong Kingston, and we would rather print no history than that.

const axios = require('axios');
const apiCache = require('./apiCache');

const client = axios.create({
  timeout: 20000,
  headers: { 'User-Agent': 'DayHop/2.0 (Ontario trip guides; contact zokaamazon@gmail.com)' }
});
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_CHARS = 2600;

// "== History ==" … next same-level heading. Pure, so tests can feed text.
// Sub-headings ("=== Early settlement ===") are kept as paragraph breaks.
function historySection(wikitext) {
  const text = String(wikitext || '');
  const m = text.match(/(^|\n)==\s*History\s*==\s*\n([\s\S]*?)(\n==[^=][^\n]*==\s*\n|$)/i);
  if (!m) return [];
  const paras = m[2]
    .split(/\n+/)
    .map(p => p.replace(/^=+\s*|\s*=+$/g, '').trim())
    .filter(p => p.length > 60); // drop leftover sub-headings and stubs
  const out = [];
  let used = 0;
  for (const p of paras) {
    if (used + p.length > MAX_HISTORY_CHARS && out.length) break;
    out.push(p);
    used += p.length;
  }
  return out;
}

async function fetchSummary(title) {
  const res = await client.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    { validateStatus: s => s === 200 || s === 404 });
  if (res.status !== 200 || !res.data || res.data.type === 'disambiguation') return null;
  return res.data;
}

async function getCityHistory(city) {
  const name = String(city || '').trim();
  if (!name) return null;
  return apiCache.cached({
    key: `wiki:history:${name.toLowerCase()}`,
    ttlMs: TTL_MS,
    fetch: async () => {
      let summary = null;
      for (const t of [`${name}, Ontario`, `${name}, Toronto`, name]) {
        const s = await fetchSummary(t).catch(() => null);
        if (s && /ontario|toronto/i.test(`${s.description || ''} ${s.extract || ''}`)) { summary = s; break; }
      }
      if (!summary) return null;
      const title = summary.titles && summary.titles.canonical ? summary.titles.canonical.replace(/_/g, ' ') : summary.title;
      const res = await client.get('https://en.wikipedia.org/w/api.php', {
        params: { action: 'query', prop: 'extracts', explaintext: 1, exsectionformat: 'wiki', titles: title, format: 'json', formatversion: 2 }
      }).catch(() => null);
      const page = res && res.data && res.data.query && res.data.query.pages && res.data.query.pages[0];
      return {
        title,
        summary: summary.extract || '',
        history: historySection(page && page.extract),
        url: (summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page) ||
          `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        license: 'CC BY-SA 4.0'
      };
    }
  });
}

module.exports = { getCityHistory, historySection };
