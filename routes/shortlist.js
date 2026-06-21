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

router.post('/', async (req, res, next) => {
  const { idea } = req.body || {};
  if (!idea || idea.id == null) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'An idea with an id is required.' });
  }
  try {
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
