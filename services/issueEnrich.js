// services/issueEnrich.js — DayHop V2
// What makes a newsletter issue worth forwarding: per pick, one punchy line
// on why a parent would care and a "best for" tag or two; per issue, the one
// standout pick to lead with ("If you only do one thing").
//
// Tags come from the data alone (cost, ages, indoor, worth the drive), so
// they are never invented. The hook lines and the standout come from one
// short Grok call per issue, written only from each pick's own title and
// description; when Grok is unavailable or says something off-style, the
// pick's own first sentence stands in. An issue never fails to send because
// of this file.

const { lint } = require('./copyStyle');

const MAX_HOOK = 130;

// ---------- best-for tags (data only) ----------
const INDOOR_RE = /\b(indoor|museum|gallery|aquarium|science|arcade|trampoline|climbing gym|bouldering|play ?cent(re|er)|bowling|escape room|library|conservatory|greenhouse|pool)\b/i;
const DATE_RE = /\b(romantic|date night|couples|wine|cocktail|rooftop|candle|jazz|live music|sauna|nordic spa)\b/i;
// No splash pads: they close in September, and a November issue tagged
// "Toddlers" for one would promise a feature that is not there.
const TODDLER_RE = /\b(toddler|stroller|little ones|small kids|preschool|petting|playground)\b/i;

function bestFor(p) {
  const text = `${p.title || ''} ${p.description || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`;
  const tags = [];
  const free = p.cost_tier === 'free' || p.price_from === 0;
  if (free) tags.push('Free');
  const ages = String(p.good_for_ages || '');
  // "all ages" is not a toddler pick; only explicit toddler signals count.
  if (TODDLER_RE.test(text) || /(^|\D)[0-3]\+/.test(ages)) tags.push('Toddlers');
  if (INDOOR_RE.test(text) || (p.tags || []).includes('rainy day')) tags.push('Rainy day');
  if (DATE_RE.test(text) || /\b(18|19|21)\+/.test(ages)) tags.push('Date night');
  if (p.worth_trip) tags.push('Day trip');
  if (!tags.length && /kids|family/i.test(`${p.category} ${ages}`)) tags.push('Kids');
  return [...new Set(tags)].slice(0, 2);
}

// ---------- hook lines ----------
const dashFix = s => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s-{1,2}\s/g, ', ').replace(/\s+/g, ' ').trim();

// The pick's own first sentence, cut at a word if it runs long. (Cutting at
// the first comma was tried and broke lists mid-thought: "An 1860s village
// where costumed blacksmiths.")
function firstSentence(text) {
  const s = dashFix(text);
  const one = (s.match(/^.*?[.!?](\s|$)/) || [s])[0].trim();
  return one.length <= MAX_HOOK ? one : `${one.slice(0, MAX_HOOK - 1).replace(/\s+\S*$/, '')}…`;
}

// Grok writes good lines but ignores length (Nov 2026 tryouts: 145 to 159
// characters against a 110 ask). A long line is kept up to its last clause
// break before the cap, if that still says something (50+ characters):
// "Step back to the 1860s at Black Creek Pioneer Village, where costumed
// blacksmiths…" becomes "Step back to the 1860s at Black Creek Pioneer Village."
function cleanHook(h) {
  let s = dashFix(h).replace(/^["']|["']$/g, '');
  if (s.length > MAX_HOOK) {
    // The FIRST clause break after 45 characters, not the last: the last
    // comma is often inside a list ("…where costumed blacksmiths, millers")
    // and cutting there leaves a broken fragment.
    const re = /,\s|;\s|\s(where|with|while|which)\s/g;
    let m, cut = -1;
    while ((m = re.exec(s)) && m.index < MAX_HOOK) { if (m.index >= 45) { cut = m.index; break; } }
    s = cut > 0 ? `${s.slice(0, cut).replace(/[,;]$/, '').trim()}.` : '';
  }
  if (!s || lint(s).length) return null;
  return s;
}

/**
 * → { hooks: [string per pick], standout: index, by: 'grok' | 'fallback' }
 * deps.search: the Grok call (services/grok.callGrokSearch), injectable.
 * deps.offline: skip Grok entirely (admin previews), first sentences only.
 */
async function enrichIssue(picks, { kind = 'weekend', search, offline = false } = {}) {
  const fallback = { hooks: picks.map(p => firstSentence(p.description || p.title)), standout: 0, by: 'fallback' };
  if (!picks.length || offline) return fallback;
  try {
    const call = search || require('./grok').callGrokSearch;
    const input = picks.map((p, i) => `${i}. ${p.title}${p.venue ? ` (${p.venue})` : ''}: ${String(p.description || '').slice(0, 300)}`).join('\n');
    const instructions = [
      `You write the one-line hooks for DayHop's ${kind === 'tott' ? 'Monday "Talk of the town"' : 'Thursday weekend'} email to GTA parents.`,
      'For each pick, one line of 50 to 110 characters on why a parent would care: concrete, warm, specific, a little playful. Use only what the pick\'s own text says; never add facts, prices or times. Do not just repeat the title.',
      `It is ${new Date().toLocaleDateString('en-CA', { month: 'long', timeZone: 'America/Toronto' })} in Ontario. Never mention anything closed this time of year (splash pads, outdoor pools, patios in winter) even if the pick's text does; pick a different detail.`,
      'Write natural English with normal punctuation: apostrophes, commas and a full stop. No em dashes, no en dashes, no spaced hyphens. No emoji.',
      'Also choose the single standout pick, the one thing to do if a family only does one.',
      'Reply with ONE JSON object only: {"hooks": ["line for pick 0", "line for pick 1", ...], "standout": <index>}'
    ].join('\n');
    const res = await call(input, { instructions, tools: [], temperature: 0.6, timeoutMs: 45000 });
    const data = res && res.data;
    if (!data || !Array.isArray(data.hooks)) return fallback;
    const hooks = picks.map((p, i) => cleanHook(data.hooks[i]) || fallback.hooks[i]);
    const s = Number(data.standout);
    return { hooks, standout: Number.isInteger(s) && s >= 0 && s < picks.length ? s : 0, by: 'grok' };
  } catch (err) {
    console.warn('[issue-enrich] Grok hooks unavailable, using first sentences:', err.message);
    return fallback;
  }
}

// Put the standout first and attach hook + tags to every pick, so both the
// email and the web page read the same issue. Pure.
function applyEnrichment(picks, e) {
  const order = [e.standout, ...picks.map((_, i) => i).filter(i => i !== e.standout)];
  return order.map((i, pos) => Object.assign({}, picks[i], {
    hook: e.hooks[i] || null,
    best_for: bestFor(picks[i]),
    standout: pos === 0
  }));
}

module.exports = { enrichIssue, applyEnrichment, bestFor, firstSentence, cleanHook };
