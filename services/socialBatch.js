// services/socialBatch.js — DayHop V2
// Tuesday social content batch: Grok drafts the week's post concepts
// (captions, hooks, visual direction) grounded in what DayHop actually has
// live — the seasonal spotlight and real catalog entries — then the batch
// is emailed to the operator. Rendering images and posting stay human jobs
// (no TikTok/IG publishing API worth the ban risk); this kills the blank
// page, which is the part that actually stops the posting habit.

const { callGrok } = require('./grok');
const { getSpotlight } = require('./spotlight');
const { sendEmail } = require('./email');

const BATCH_TO = process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com';

function seasonalPicks(limit = 10) {
  // A taste of the live catalog so Grok writes about real places, not
  // inventions. Titles + categories only — enough grounding, tiny prompt.
  try {
    const catalog = require('../data/curatedCatalog');
    const month = new Date().getMonth() + 1;
    const { isCatalogSeasonEligible } = require('../data/seasons');
    return catalog
      .filter(e => isCatalogSeasonEligible(e.seasonal || null, month))
      .slice(0, limit)
      .map(e => ({ title: e.title, category: e.category, location: e.location }));
  } catch (e) {
    return [];
  }
}

async function buildBatch() {
  const sp = getSpotlight();
  const messages = [
    {
      role: 'system',
      content: `You write social content for DayHop (dayhop.quest), an AI weekend planner for Toronto/GTA families. Instagram is @dayhopofficial, TikTok is dayhop3.

Voice: warm, plain, a little wry — a local parent who knows the good spots, never a brand shouting. No hype, no emoji walls, no "hey fam". Hooks name a real feeling (the Thursday night "what are we doing this weekend" scramble, the rainy Saturday panic, the kid who is bored by 9 AM).

Return ONLY valid JSON, no markdown fences:
{
  "posts": [
    {
      "platform": "instagram" | "tiktok",
      "format": "one of: meme, carousel, talking-point video, trend-remix",
      "concept": "one sentence — what the post IS",
      "hook": "the first line / on-screen text",
      "caption": "the full caption, ready to paste, ending with a soft dayhop.quest mention",
      "hashtags": ["5-8 relevant tags, GTA/Toronto family niche, no generic #fyp spam"],
      "visual_direction": "one sentence for the image/video render"
    }
  ]
}

Make exactly 4 posts: 2 Instagram, 2 TikTok. At least one should be usable this week without filming anything (meme or text-forward). Never invent venue facts — the provided real places are the only ones you may name.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        this_week: new Date().toISOString().slice(0, 10),
        seasonal_spotlight: sp ? { name: sp.name, range: sp.range } : null,
        real_places_you_may_name: seasonalPicks()
      })
    }
  ];
  const result = await callGrok(messages, { temperature: 0.8 });
  if (!result || !Array.isArray(result.posts)) throw new Error('Grok returned an unexpected batch shape');
  return result.posts.slice(0, 6);
}

function formatBatch(posts) {
  const lines = [`DayHop social batch — week of ${new Date().toISOString().slice(0, 10)}`, ''];
  posts.forEach((p, i) => {
    lines.push(`${i + 1}. [${String(p.platform || '').toUpperCase()}] ${p.format || ''} — ${p.concept || ''}`);
    lines.push(`   Hook: ${p.hook || ''}`);
    lines.push(`   Caption:`);
    lines.push(String(p.caption || '').split('\n').map(l => '   ' + l).join('\n'));
    lines.push(`   Tags: ${(p.hashtags || []).join(' ')}`);
    lines.push(`   Visual: ${p.visual_direction || ''}`);
    lines.push('');
  });
  lines.push('Posting checklist:');
  lines.push('  1. TikTok first — the account still has ZERO posts (trail-loop.mp4 is ready).');
  lines.push('  2. Render visuals with the meme pipeline (social/ folder) or Zeely image ads.');
  lines.push('  3. Queue the Instagram pair in Zeely social posting.');
  lines.push('  4. 10 minutes of comment replies after posting.');
  return lines.join('\n');
}

async function sendBatch() {
  const posts = await buildBatch();
  const text = formatBatch(posts);
  const res = await sendEmail({
    to: BATCH_TO,
    subject: 'DayHop social batch: 4 posts drafted for this week',
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  });
  if (res.sent) console.log(`[social] Tuesday batch sent to ${BATCH_TO}`);
  else console.warn('[social] batch send failed:', res.reason);
  return res;
}

module.exports = { buildBatch, sendBatch };
