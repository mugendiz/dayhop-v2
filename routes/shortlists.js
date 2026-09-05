// routes/shortlists.js — DayHop V2 (mobile Favs grid, Sept 2026)
// Named shortlists ("My Favs" pages). One list per city+mood is auto-created
// by each generate; people rename them and make more by hand. Same trust
// model as routes/shortlist.js: owner comes from the verified token, guests
// keep the same shapes in localStorage and get a 401 here.
//
//   GET    /api/shortlists          → { lists: [{ id, name, city, mood, created_at, updated_at, count }] }
//   POST   /api/shortlists          { name?, city?, mood?, auto? } → 201 { list } | 200 { list, existed: true }
//   PATCH  /api/shortlists/:id      { name } → { list }
//   DELETE /api/shortlists/:id      → 204 (its items go with it)
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');
const { requireUser } = require('../middleware/auth');
const analytics = require('../services/analytics');

const MAX_LISTS = 20;
const NAME_MAX = 40;

router.use(requireUser);

const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
const cleanCity = (v) => String(v || '').trim().slice(0, 60) || null;
function cleanMood(v) {
  const m = String(v || '').trim().toLowerCase();
  if (!m) return null;
  return m === 'adventure' ? 'adventure' : 'rr';
}
const moodLabel = (mood) => mood === 'adventure' ? 'Adventure' : 'R&R';
function autoName(city, mood) {
  const c = city || 'GTA';
  return mood ? `${c} · ${moodLabel(mood)}` : c;
}

// Start of the current Toronto calendar day, as an ISO instant (DST-safe).
const TORONTO_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
function torontoDayStartIso(now = new Date()) {
  const parts = Object.fromEntries(TORONTO_FMT.formatToParts(now).map(p => [p.type, p.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const start = new Date(now.getTime() - hour * 3600000);
  start.setUTCMinutes(0, 0, 0);
  return start.toISOString();
}

router.get('/', async (req, res, next) => {
  try {
    const lists = await store.listShortlists(req.ownerId, req.dbCtx);
    res.json({ lists });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const body = req.body || {};
  const city = cleanCity(body.city);
  const mood = cleanMood(body.mood);
  const explicitName = cleanName(body.name);
  const auto = !explicitName;
  const name = explicitName || autoName(city, mood);
  try {
    // Dedupe auto-created lists: the same city+mood searched twice on one
    // Toronto day reuses the list instead of stacking "Markham · R&R" x5.
    if (auto) {
      const existing = await store.findShortlistByCityMood(req.ownerId, city, mood, torontoDayStartIso(), req.dbCtx);
      if (existing) return res.json({ list: existing, existed: true });
    }
    const lists = await store.listShortlists(req.ownerId, req.dbCtx);
    if (lists.length >= MAX_LISTS) {
      return res.status(409).json({ error: 'LIST_CAP', message: `You can keep up to ${MAX_LISTS} lists — delete one to make room.` });
    }
    const list = await store.createShortlist({ ownerId: req.ownerId, name, city, mood }, req.dbCtx);
    analytics.recordEvent({ type: 'favs_list_created', ownerKey: req.ownerId, meta: { city, mood, auto } });
    res.status(201).json({ list, existed: false });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  const name = cleanName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'INVALID_INPUT', message: `A name of 1–${NAME_MAX} characters is required.` });
  try {
    const list = await store.renameShortlist(String(req.params.id), req.ownerId, name, req.dbCtx);
    if (!list) return res.status(404).json({ error: 'NOT_FOUND', message: 'No such list.' });
    analytics.recordEvent({ type: 'favs_list_renamed', ownerKey: req.ownerId, meta: { list_id: list.id } });
    res.json({ list });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existed = await store.deleteShortlist(String(req.params.id), req.ownerId, req.dbCtx);
    if (!existed) return res.status(404).json({ error: 'NOT_FOUND', message: 'No such list.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.autoName = autoName;
module.exports.torontoDayStartIso = torontoDayStartIso;
module.exports.MAX_LISTS = MAX_LISTS;
