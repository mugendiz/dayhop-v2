// services/newOpenings.js — DayHop V2 (discovery Phases 1-3 + autopilot)
// The "it's all over socials but not in DayHop" collector: scans local-media
// RSS feeds for opening-flavored headlines, has Grok extract real, visitable
// new attractions/venues from them, and drafts curatedCatalog entries.
// Publishing is verification-gated (services/autoCatalog.js): a find that
// passes Google Places + Grok publishes to the
// live catalog automatically; anything the chain can't confirm stays in the
// admin Discovery inbox for the human pass. Trust contract > coverage —
// "verified" is earned by the chain or by a human, never assumed.
//
// Feeds verified live 2026-07-25 (BlogTO and DailyHive have no public RSS —
// don't re-add them). Global News regional feeds carry general news; the
// headline gate + Grok filtering strip the non-attraction noise.
//
// 2026-08-15: feed list narrowed from Canada-wide to the southern-Ontario
// day-trip belt. Publishing is now geography-gated (services/regionGate.js),
// so Quebec/West/East feeds could no longer produce publishable entries —
// they only crowded Ontario items out of the 100-headline Grok batch.
// Restore any feed via NEW_OPENINGS_FEEDS if the serving region ever grows.

const axios = require('axios');
const { callGrok } = require('./grok');
const { scoreBuzz } = require('./buzz');
const autoCatalog = require('./autoCatalog');

const DEFAULT_FEEDS =
  'Curiocity|https://curiocity.com/feed/;' +
  'Narcity Toronto|https://www.narcity.com/feeds/toronto.rss;' +
  'NOW Toronto|https://nowtoronto.com/feed/;' +
  'Streets of Toronto|https://streetsoftoronto.com/feed/;' +
  'ToDoCanada|https://www.todocanada.ca/feed/;' +
  'Global Toronto|https://globalnews.ca/toronto/feed/;' +
  'Global Hamilton|https://globalnews.ca/hamilton/feed/;' +
  'Global London|https://globalnews.ca/london/feed/;' +
  'Global Kingston|https://globalnews.ca/kingston/feed/;' +
  'Global Barrie|https://globalnews.ca/barrie/feed/;' +
  'Global Guelph|https://globalnews.ca/guelph/feed/;' +
  'Global Peterborough|https://globalnews.ca/peterborough/feed/';

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ITEM_AGE_DAYS = 45;
// Weekly cadence justifies a bigger Grok batch than the old 6h loop needed.
const MAX_GATED_ITEMS = 100;

// Headline gate: cheap pre-filter so Grok only reads plausible candidates.
const OPENING_RE = /\b(open(s|ed|ing)?|now open|debuts?|launch(es|ed|ing)?|unveil(s|ed)?|first look|brand.new|grand opening|new (attraction|experience|exhibit|museum|park|ride|restaurant|cafe|café|patio|festival|spot|space))\b/i;

const VALID_CATEGORIES = new Set(['worldcup', 'kids', 'patios', 'water', 'cruises', 'adventures', 'culture', 'food', 'general']);

const client = axios.create({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml'
  }
});

const cache = { at: 0, data: null };
let inflight = null;

function feeds() {
  return String(process.env.NEW_OPENINGS_FEEDS || DEFAULT_FEEDS)
    .split(';').map(s => s.trim()).filter(Boolean)
    .map(pair => {
      const [label, url] = pair.split('|').map(p => p.trim());
      return label && /^https:\/\//.test(url || '') ? { label, url } : null;
    })
    .filter(Boolean);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function clean(fragment) {
  return decodeEntities(
    String(fragment)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function parseRss(xml, sourceLabel) {
  const items = [];
  const blocks = String(xml).split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const grab = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? clean(m[1]) : '';
    };
    const title = grab('title');
    if (!title) continue;
    items.push({
      source: sourceLabel,
      title,
      link: grab('link'),
      published: grab('pubDate'),
      summary: grab('description').slice(0, 280)
    });
  }
  return items;
}

function freshEnough(item) {
  if (!item.published) return true; // no date → let the headline gate decide
  const t = Date.parse(item.published);
  return isNaN(t) || Date.now() - t <= MAX_ITEM_AGE_DAYS * 24 * 3600 * 1000;
}

// A paste-ready curatedCatalog skeleton. opened_at is deliberately null —
// the reviewer fills it from the source (two-source rule) before committing.
function draftEntry(c) {
  const slug = String(c.name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  return {
    id: `cur-${slug || 'new-opening'}`,
    title: c.name,
    category: VALID_CATEGORIES.has(c.category) ? c.category : 'general',
    tags: Array.isArray(c.tags) ? c.tags.slice(0, 8).map(t => String(t).toLowerCase()) : [],
    location: c.area || 'Toronto',
    venue: c.name,
    description: String(c.summary || '').slice(0, 180),
    cost_tier: '$$',
    good_for_ages: 'all ages',
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${c.area || 'Canada'}`)}`,
    booking_url: null,
    opened_at: null,
    wow: true,
    seasonal: null
  };
}

async function extractCandidates(items) {
  const numbered = items.map((it, i) => ({
    i, title: it.title, summary: it.summary, published: it.published, source: it.source
  }));
  const messages = [
    {
      role: 'system',
      content: 'You are DayHop\'s new-openings scout for southern Ontario — the Toronto/GTA and its day-trip belt (Hamilton, Niagara, Guelph, Kitchener-Waterloo, London, Barrie, Collingwood, Peterborough, Kingston, Prince Edward County, Muskoka). From local-news items you identify REAL, physical, visitable attractions/venues/experiences that are newly opened or opening — things a person could put on a day plan. Always include the town/city in "area" (e.g. "Leslieville, Toronto" or "Vineland, Niagara"). Exclude: closures, roundup listicles with no single new place, real-estate/transit/political news, one-night-only events, and anything outside this southern-Ontario region. Be conservative: when unsure, leave it out. Respond with JSON only.'
    },
    {
      role: 'user',
      content: `News items:\n${JSON.stringify(numbered)}\n\nReturn: {"candidates":[{"item_index":number,"name":"official place/attraction name","area":"neighbourhood or town","kind":"attraction|exhibit|restaurant|park|venue|other","opened_hint":"what the item says about when it opened/opens","summary":"honest, concrete, <=160 chars, no hype","category":"one of kids|patios|water|cruises|adventures|culture|food|general","tags":["4-8 lowercase search keywords"]}]}`
    }
  ];
  const parsed = await callGrok(messages, { temperature: 0.2 });
  return Array.isArray(parsed && parsed.candidates) ? parsed.candidates : [];
}

/**
 * Scan feeds → gate → extract → draft. Cached 6h (one Grok call per window);
 * concurrent callers share the in-flight run. Never throws: failures come
 * back as { items: [], error }.
 */
async function collect() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = doCollect().finally(() => { inflight = null; });
  return inflight;
}

async function doCollect() {
  const feedList = feeds();
  const settled = await Promise.allSettled(
    feedList.map(f => client.get(f.url).then(res => parseRss(res.data, f.label)))
  );
  const articles = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') articles.push(...r.value);
    else console.warn(`[new-openings] feed failed (${feedList[i].label}):`, r.reason && r.reason.message);
  });

  const gated = articles
    .filter(freshEnough)
    .filter(a => OPENING_RE.test(a.title))
    .slice(0, MAX_GATED_ITEMS);

  let items = [];
  let error = null;
  if (gated.length) {
    try {
      const candidates = await extractCandidates(gated);
      items = candidates
        .filter(c => c && c.name)
        .map(c => {
          const article = gated[c.item_index] || {};
          return {
            name: c.name,
            area: c.area || null,
            kind: c.kind || null,
            opened_hint: c.opened_hint || null,
            summary: c.summary || null,
            article: { title: article.title || null, url: article.link || null, source: article.source || null, published: article.published || null },
            draft: draftEntry(c)
          };
        });
    } catch (err) {
      console.warn('[new-openings] extraction failed:', err.message);
      error = 'Entity extraction failed — raw headlines below.';
      // Degrade honestly: surface the gated headlines with no drafts rather
      // than pretending the scan found nothing.
      items = gated.map(a => ({
        name: a.title, area: null, kind: 'headline', opened_hint: null, summary: a.summary,
        article: { title: a.title, url: a.link, source: a.source, published: a.published },
        draft: null
      }));
    }
  }

  // Phase 2: buzz-score the extracted candidates (skip raw headlines) and
  // sort loudest-first, so the inbox leads with what socials are on about.
  const scoreable = items.filter(it => it.draft);
  if (scoreable.length) {
    const CONCURRENCY = 3;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scoreable.length) }, async () => {
      while (next < scoreable.length) {
        const item = scoreable[next++];
        try {
          item.buzz = await scoreBuzz({ name: item.name, area: item.area });
        } catch (e) { item.buzz = null; }
      }
    }));
    items.sort((a, b) => ((b.buzz && b.buzz.score) || 0) - ((a.buzz && a.buzz.score) || 0));

    // Phase 3: autopilot — every drafted find runs the verification chain
    // (Google Places existence + Grok editorial); passers publish straight
    // into the live catalog, Canada-wide. Non-passers stay in the inbox
    // annotated with WHY, so the human pass reviews exactly what the
    // machines couldn't confirm.
    try {
      await autoCatalog.processFinds(scoreable);
    } catch (err) {
      console.warn('[new-openings] autopilot failed (finds stay in inbox):', err.message);
    }
  }

  const data = {
    generated_at: new Date().toISOString(),
    feeds_scanned: feedList.length,
    articles_seen: articles.length,
    headlines_gated: gated.length,
    error,
    items
  };
  cache.at = Date.now();
  cache.data = data;
  return data;
}

/**
 * The cached scan, if one exists — never triggers collection. Lets the
 * admin page show "N awaiting review" on load without a 20s scan.
 */
function peek() {
  if (!cache.data) return null;
  return Object.assign({ cached: true, cached_at: new Date(cache.at).toISOString() }, cache.data);
}

module.exports = { collect, peek };
