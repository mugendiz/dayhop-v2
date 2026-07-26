// routes/shortlist.js — DayHop V2
// Server-side shortlist persistence, gated to a signed-in user. The owner is
// taken from the verified auth token (req.ownerId), never from the client, so
// one user can't read or write another's shortlist. Anonymous guests keep a
// local-only shortlist in the browser; they get a 401 here and the frontend
// treats persistence as a sign-in upsell. Storage via the shared store.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');
const { requireUser } = require('../middleware/auth');

router.use(requireUser);

router.get('/', async (req, res, next) => {
  try {
    const items = await store.listShortlist(req.ownerId, req.dbCtx);
    res.json({ items });
  } catch (err) { next(err); }
});

// Ideas are stored verbatim (the client re-renders them as-is), so bound
// the blast radius: real ideas serialize to ~1-2 KB, and no honest
// shortlist needs hundreds of entries. Without these caps a signed-in
// account could bank megabytes of arbitrary JSON.
const MAX_IDEA_BYTES = 8 * 1024;
const MAX_ITEMS = 100;

router.post('/', async (req, res, next) => {
  const { idea } = req.body || {};
  if (!idea || idea.id == null) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'An idea with an id is required.' });
  }
  if (JSON.stringify(idea).length > MAX_IDEA_BYTES) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'That idea payload is too large.' });
  }
  try {
    // Updating an existing item is always allowed; only NEW items count
    // against the cap.
    const items = await store.listShortlist(req.ownerId, req.dbCtx);
    const exists = items.some(i =>
      String(i.idea_id != null ? i.idea_id : (i.idea && i.idea.id)) === String(idea.id));
    if (!exists && items.length >= MAX_ITEMS) {
      return res.status(400).json({
        error: 'LIMIT_REACHED',
        message: `Shortlists cap at ${MAX_ITEMS} places — remove a few before adding more.`
      });
    }
    const item = await store.addShortlistItem({ ownerId: req.ownerId, idea }, req.dbCtx);
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

router.delete('/:ideaId', async (req, res, next) => {
  try {
    const existed = await store.removeShortlistItem({ ownerId: req.ownerId, ideaId: req.params.ideaId }, req.dbCtx);
    if (!existed) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not on the shortlist.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.delete('/', async (req, res, next) => {
  try {
    const removed = await store.clearShortlist(req.ownerId, req.dbCtx);
    res.json({ removed });
  } catch (err) { next(err); }
});

module.exports = router;
