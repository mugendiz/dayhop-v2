// services/relevance.js — DayHop V2
// Ranks the merged candidate pool against the user's prompt before it is
// capped and sent to Grok. Previously candidates were round-robin
// interleaved, so a highly relevant item from a late source could be
// trimmed while an unrelated event survived. Simple additive keyword/tag
// scoring — no embeddings, no network calls.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my',
  'our', 'your', 'me', 'us', 'we', 'i', 'is', 'are', 'be', 'this', 'that',
  'some', 'any', 'then', 'after', 'before', 'near', 'nearby', 'around',
  'something', 'somewhere', 'anything', 'want', 'like', 'need', 'looking',
  'day', 'hours', 'hour', 'afternoon', 'morning', 'evening', 'today',
  'tomorrow', 'weekend', 'old', 'year', 'years', 'please', 'fun', 'go',
  'do', 'get', 'have', 'it', 'out', 'up', 'so', 'or', 'but', 'not', 'no'
]);

// Tokenize a prompt: lowercase, strip punctuation, drop stopwords, and add
// naive singular forms so "beaches" also matches "beach".
function tokenize(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  const tokens = new Set(raw);
  for (const w of raw) {
    if (w.endsWith('ies')) tokens.add(w.slice(0, -3) + 'y');
    else if (w.endsWith('es')) tokens.add(w.slice(0, -2));
    if (w.endsWith('s')) tokens.add(w.slice(0, -1));
    if (w.endsWith('ing') && w.length > 5) tokens.add(w.slice(0, -3)); // swimming → swimm... also add -ing stem
    if (w.endsWith('ming') && w.length > 5) tokens.add(w.slice(0, -4)); // swimming → swim
  }
  return tokens;
}

function textHits(tokens, text) {
  if (!text) return 0;
  const t = String(text).toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (t.includes(token)) hits++;
  }
  return hits;
}

/**
 * Score candidates against the prompt, matched themes (data/themes.js
 * shapes) and the active category filter. Returns [{ candidate, score }].
 */
function scoreCandidates(candidates, { prompt, themes = [], filter } = {}) {
  const tokens = tokenize(prompt);
  const themeTags = new Set();
  const themeCategories = new Set();
  for (const theme of themes) {
    (theme.tags || []).forEach(t => themeTags.add(t.toLowerCase()));
    (theme.categories || []).forEach(c => themeCategories.add(c));
  }

  const now = Date.now();
  const soon = now + 7 * 24 * 3600 * 1000;

  return candidates.map(candidate => {
    let score = 0;

    // Direct prompt-token overlap: title matches count double.
    score += 2 * textHits(tokens, candidate.title);
    score += textHits(tokens, candidate.description);
    score += textHits(tokens, candidate.venue);
    score += textHits(tokens, candidate.category);

    // Theme vocabulary: candidate tags/category vs matched theme tags.
    const candTags = (candidate.tags || []).map(t => String(t).toLowerCase());
    if (candTags.some(t => themeTags.has(t)) || themeCategories.has(candidate.category)) {
      score += 3;
    }
    // Curated tags also count against raw prompt tokens.
    score += Math.min(2, candTags.filter(t => tokens.has(t)).length);

    // Came from a theme-expanded Places query — already intent-matched.
    if (candidate.theme_hit) score += 3;

    // Active category chip.
    if (filter && filter !== 'all' && candidate.category === filter) score += 3;

    // Quality signals.
    if (candidate.rating >= 4.5 && (candidate.rating_count || 0) >= 100) score += 1.5;
    else if (candidate.rating >= 4.0) score += 0.5;

    // Dated events happening soon beat far-future ones.
    if (candidate.date) {
      const when = Date.parse(candidate.date);
      if (!Number.isNaN(when) && when >= now - 24 * 3600 * 1000 && when <= soon) score += 1;
    }

    // Keep genuine discovery entries alive even with zero token overlap.
    if (candidate.wow === true) score += 1;
    if (candidate.civic === true || candidate.cost_tier === 'free') score += 0.5;

    return { candidate, score };
  });
}

/**
 * Pick the top `cap` candidates by score while guaranteeing every source
 * that returned anything keeps at least a small voice (up to 2 entries),
 * so the pool Grok sees stays diverse. Output is relevance-ordered.
 */
function selectTop(scored, cap = 60) {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const picked = new Set();
  const perSource = new Map();

  // Pass 1: diversity floor — up to 2 best per source.
  for (const entry of sorted) {
    if (picked.size >= cap) break;
    const src = entry.candidate.source || 'unknown';
    const count = perSource.get(src) || 0;
    if (count < 2) {
      picked.add(entry);
      perSource.set(src, count + 1);
    }
  }

  // Pass 2: fill the rest purely by score.
  for (const entry of sorted) {
    if (picked.size >= cap) break;
    picked.add(entry);
  }

  return sorted.filter(e => picked.has(e)).map(e => e.candidate);
}

module.exports = { scoreCandidates, selectTop, tokenize };
