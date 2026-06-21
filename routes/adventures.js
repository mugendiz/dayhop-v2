// routes/adventures.js — DayHop V2
// "Adventures" are saved/built day plans, gated to a signed-in user. The owner
// comes from the verified auth token (req.ownerId), never the client. Reads and
// deletes run under the user's RLS context (req.dbCtx), so a user only ever
// sees or removes their own. Storage via the shared store.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');
const { requireUser } = require('../middleware/auth');

router.use(requireUser);

router.post('/', async (req, res, next) => {
  const { plan } = req.body || {};
  if (!plan) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'plan is required.' });
  }
  try {
    const adventure = await store.createAdventure({ ownerId: req.ownerId, plan }, req.dbCtx);
    res.status(201).json({ adventure });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const adventures = await store.listAdventures(req.ownerId, req.dbCtx);
    res.json({ adventures });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const adventure = await store.getAdventure(req.params.id, req.dbCtx);
    // RLS (or the owner check below for memory mode) ensures cross-user reads 404.
    if (!adventure || adventure.ownerId !== req.ownerId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
    }
    res.json({ adventure });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // Confirm ownership first (covers the in-memory path, which has no RLS).
    const existing = await store.getAdventure(req.params.id, req.dbCtx);
    if (!existing || existing.ownerId !== req.ownerId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
    }
    await store.deleteAdventure(req.params.id, req.dbCtx);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
