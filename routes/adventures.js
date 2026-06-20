// routes/adventures.js — DayHop V2
// "Adventures" are saved/built day plans. V2 uses an in-memory store keyed
// by a client-generated id (passed from localStorage on the frontend) so
// plans survive a refresh without requiring full auth yet.
// Swap this Map for a real DB + user accounts when auth ships.
const express = require('express');
const router = express.Router();

const adventures = new Map();

router.post('/', (req, res) => {
  const { ownerId, plan } = req.body || {};
  if (!ownerId || !plan) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId and plan are required.' });
  }
  const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = { id, ownerId, plan, created_at: new Date().toISOString() };
  adventures.set(id, record);
  res.status(201).json({ adventure: record });
});

router.get('/', (req, res) => {
  const { ownerId } = req.query;
  if (!ownerId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId query param is required.' });
  }
  const results = [...adventures.values()].filter(a => a.ownerId === ownerId);
  res.json({ adventures: results });
});

router.get('/:id', (req, res) => {
  const adv = adventures.get(req.params.id);
  if (!adv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
  res.json({ adventure: adv });
});

router.delete('/:id', (req, res) => {
  const existed = adventures.delete(req.params.id);
  if (!existed) return res.status(404).json({ error: 'NOT_FOUND', message: 'Adventure not found.' });
  res.status(204).send();
});

module.exports = router;
