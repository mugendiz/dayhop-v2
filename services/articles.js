// services/articles.js — DayHop V2
// Article store behind /blog and POST /api/content/webhook.
//
// Two layers, merged at read time:
//   1. Seed stories from data/blogArticles.js — ship in the repo, so the blog
//      has content with zero configuration.
//   2. public.articles rows (BabyLoveGrowth webhook or any future CMS) — via
//      the service-key Supabase client, same pattern as place_details. When
//      Supabase isn't configured (or the table doesn't exist yet), webhook
//      articles land in an in-process map so the integration still works,
//      just without deploy-survival.
// A DB/webhook row with the same slug as a seed WINS — any seed story can be
// superseded without a deploy.

const dbClient = require('./db/client');
const SEEDS = require('../data/blogArticles');

const LIST_TTL_MS = 5 * 60 * 1000; // /blog is public + cacheable; 5 min is plenty
let listCache = { data: null, at: 0 };

// In-process fallback when Supabase is absent — keyed by slug.
const memory = new Map();

function normalize(a) {
  return {
    slug: a.slug,
    title: a.title,
    description: a.description || '',
    html: a.html,
    hero_image_url: a.hero_image_url || null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    author: a.author || 'DayHop',
    source: a.source || 'seed',
    published_at: a.published_at || new Date().toISOString()
  };
}

// Webhook HTML is secret-gated (trusted sender), but strip the obviously
// executable bits anyway — belt and suspenders for a public page.
function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '');
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function fetchDbArticles() {
  if (!dbClient.isConfigured()) return [...memory.values()];
  try {
    const { data, error } = await dbClient.getClient()
      .from('articles')
      .select('slug, title, description, html, hero_image_url, tags, author, source, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []).map(normalize);
  } catch (err) {
    // Table missing / RLS surprise: the blog must still render the seeds.
    console.warn('[articles] db read failed (serving seeds + memory):', err.message);
    return [...memory.values()];
  }
}

// Published articles, newest first, DB rows winning over same-slug seeds.
async function listPublished() {
  if (listCache.data && Date.now() - listCache.at < LIST_TTL_MS) return listCache.data;
  const db = await fetchDbArticles();
  const bySlug = new Map();
  for (const seed of SEEDS) bySlug.set(seed.slug, normalize(seed));
  for (const row of db) bySlug.set(row.slug, row);
  const merged = [...bySlug.values()]
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  listCache = { data: merged, at: Date.now() };
  return merged;
}

async function getBySlug(slug) {
  const all = await listPublished();
  return all.find(a => a.slug === slug) || null;
}

// Webhook upsert. Accepts the loose shapes content tools send: BabyLoveGrowth
// posts article JSON whose field names have shifted across versions, so every
// field is resolved from a list of aliases.
async function upsertFromWebhook(payload) {
  const p = payload || {};
  const title = p.title || p.headline || p.name;
  const html = p.html || p.content_html || p.body_html || p.content || p.body || p.markdown;
  if (!title || !html) {
    const err = new Error('Article needs at least a title and html/content.');
    err.code = 'ARTICLE_INVALID';
    throw err;
  }
  const article = normalize({
    slug: slugify(p.slug || title),
    title: String(title).slice(0, 300),
    description: String(p.description || p.meta_description || p.metaDescription || p.excerpt || '').slice(0, 500),
    html: sanitizeHtml(html),
    hero_image_url: p.hero_image_url || p.heroImageUrl || p.image_url || p.image || p.cover_image || null,
    tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 12) : [],
    author: p.author || 'DayHop',
    source: 'webhook',
    published_at: p.published_at || p.publishedAt || new Date().toISOString()
  });
  if (!article.slug) {
    const err = new Error('Could not derive a slug from the title.');
    err.code = 'ARTICLE_INVALID';
    throw err;
  }

  let persisted = false;
  if (dbClient.isConfigured()) {
    try {
      const { error } = await dbClient.getClient()
        .from('articles')
        .upsert({ ...article, updated_at: new Date().toISOString() }, { onConflict: 'slug' });
      if (error) throw error;
      persisted = true;
    } catch (err) {
      console.warn('[articles] db upsert failed (holding in memory):', err.message);
    }
  }
  if (!persisted) memory.set(article.slug, article);
  listCache = { data: null, at: 0 }; // new content is visible immediately
  return { slug: article.slug, persisted };
}

module.exports = { listPublished, getBySlug, upsertFromWebhook };
