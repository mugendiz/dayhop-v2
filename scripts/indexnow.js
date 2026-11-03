#!/usr/bin/env node
// scripts/indexnow.js — tell Bing (and the engines that share IndexNow:
// Yandex, Seznam, Naver) about DayHop's pages right away, instead of
// waiting for a crawl. Bing's index also feeds ChatGPT's search, and
// ChatGPT is DayHop's best-converting source (public.events first touch,
// 60 days to 2026-11-03).
//
// Ownership is proved by the key file public/<key>.txt, served at
// https://dayhop.quest/<key>.txt. Run only after a deploy that serves it:
//
//   node scripts/indexnow.js                 submit every URL in the live sitemap
//   node scripts/indexnow.js --dry           list what would be submitted
//
// IndexNow is a notification, not a ranking: it gets pages crawled sooner.

const axios = require('axios');

const HOST = 'dayhop.quest';
const KEY = 'c430e01a07721402cd7be4d5ed74be75';

(async () => {
  const dry = process.argv.includes('--dry');
  const keyCheck = await axios.get(`https://${HOST}/${KEY}.txt`, { validateStatus: () => true });
  if (keyCheck.status !== 200 || String(keyCheck.data).trim() !== KEY) {
    throw new Error(`key file not live at https://${HOST}/${KEY}.txt (status ${keyCheck.status}); deploy first`);
  }
  const xml = (await axios.get(`https://${HOST}/sitemap.xml`)).data;
  const urls = [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => u.startsWith(`https://${HOST}/`));
  console.log(`${urls.length} URLs in the live sitemap`);
  if (dry) { urls.forEach(u => console.log('  ' + u)); return; }
  const res = await axios.post('https://api.indexnow.org/indexnow',
    { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 10000) },
    { headers: { 'Content-Type': 'application/json; charset=utf-8' }, validateStatus: () => true });
  // 200 = accepted, 202 = accepted, key pending validation.
  console.log(`IndexNow answered ${res.status}${res.status === 200 || res.status === 202 ? ' (accepted)' : `: ${JSON.stringify(res.data).slice(0, 200)}`}`);
})().catch(err => { console.error(err.message); process.exit(1); });
