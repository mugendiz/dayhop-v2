// routes/shortlist.js — DayHop V2
// Server-side persistence for a user's shortlist, keyed by owner id (the
// localStorage guest id today; a real user id after Phase 3 auth). The
// frontend keeps localStorage as the source of truth for guests and syncs
// here best-effort, so this never blocks the UX — it just makes the data
// model real and ready for accounts. Storage via the shared store.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');

router.get('/', async (req, res, next) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId query param is required.' });
  }
  try {
    const items = await store.listShortlist(ownerId);
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { ownerId, idea } = req.body || {};
  if (!ownerId || !idea || idea.id == null) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId and an idea with an id are required.' });
  }
  try {
    const item = await store.addShortlistItem({ ownerId, idea });
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

router.delete('/:ideaId', async (req, res, next) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId query param is required.' });
  }
  try {
    const existed = await store.removeShortlistItem({ ownerId, ideaId: req.params.ideaId });
    if (!existed) return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not on the shortlist.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.delete('/', async (req, res, next) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId query param is required.' });
  }
  try {
    const removed = await store.clearShortlist(ownerId);
    res.json({ removed });
  } catch (err) { next(err); }
});

module.exports = router;
