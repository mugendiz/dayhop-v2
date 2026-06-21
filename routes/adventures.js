// routes/adventures.js — DayHop V2
// "Adventures" are saved/built day plans, keyed by an owner id (the
// localStorage guest id today; a real user id once auth ships in Phase 3).
// Storage goes through the shared store: Supabase when configured, else an
// in-memory fallback — see services/db.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');

router.post('/', async (req, res, next) => {
  const { ownerId, plan } = req.body || {};
  if (!ownerId || !plan) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId and plan are required.' });
  }
  try {
    const adventure = await store.createAdventure({ ownerId, plan });
    res.status(201).json({ adventure });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId query param is required.' });
  }
  try {
    const adventures = await store.listAdventures(ownerId);
    res.json({ adventures });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const adventure = await store.getAdventure(req.params.id);
    if (!adventure) return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
    res.json({ adventure });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existed = await store.deleteAdventure(req.params.id);
    if (!existed) return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
