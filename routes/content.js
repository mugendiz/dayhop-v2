// routes/content.js — DayHop V2
// POST /api/content/webhook — inbound article publishing (BabyLoveGrowth or
// any tool that can POST article JSON to a URL with a shared secret).
//
// Point BabyLoveGrowth at:  https://<host>/api/content/webhook
// with the secret from CONTENT_WEBHOOK_SECRET, sent as any of:
//   Authorization: Bearer <secret>   |   X-Webhook-Secret: <secret>
//   ?secret=<secret>                 (for tools that only take a URL)
// Articles land in public.articles and render at /blog/<slug>.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const articles = require('../services/articles');

const SECRET = process.env.CONTENT_WEBHOOK_SECRET;

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function presentedSecret(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers['x-webhook-secret'] || req.query.secret || '';
}

router.post('/webhook', async (req, res) => {
  if (!SECRET) {
    return res.status(503).json({
      error: 'WEBHOOK_NOT_CONFIGURED',
      message: 'Set CONTENT_WEBHOOK_SECRET to enable content publishing.'
    });
  }
  if (!timingSafeEqual(presentedSecret(req), SECRET)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bad or missing webhook secret.' });
  }
  try {
    // Some tools wrap the article ({ article: {...} } or { data: {...} }).
    const body = req.body || {};
    const payload = body.article || body.data || body;
    const items = Array.isArray(payload) ? payload : [payload];
    const results = [];
    for (const item of items.slice(0, 20)) {
      results.push(await articles.upsertFromWebhook(item));
    }
    console.log('[content] webhook published:', results.map(r => r.slug).join(', '));
    res.json({ received: true, articles: results });
  } catch (err) {
    if (err.code === 'ARTICLE_INVALID') {
      return res.status(400).json({ error: 'ARTICLE_INVALID', message: err.message });
    }
    console.error('[content] webhook failed:', err.message);
    res.status(500).json({ error: 'WEBHOOK_FAILED', message: 'Could not store the article.' });
  }
});

module.exports = router;
