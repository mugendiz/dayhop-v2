// routes/events.js — DayHop V2
// Seed event data (World Cup 2026 watch parties + local happenings).
// Replace with a real events DB / community submission pipeline as it matures.
const express = require('express');
const router = express.Router();

const EVENTS = [
  {
    id: 'wc26-rh-library-watch-party',
    title: 'World Cup 2026 Watch Party — Richmond Hill Library',
    category: 'worldcup',
    location: 'Richmond Hill',
    date: '2026-06-20',
    description: 'Big screen, kids activity corner, concession on site.',
    cost_tier: 'free',
    source: 'curated'
  }
];

router.get('/', (req, res) => {
  const { category, from, to } = req.query;
  let results = EVENTS;
  if (category) results = results.filter(e => e.category === category);
  if (from) results = results.filter(e => e.date >= from);
  if (to) results = results.filter(e => e.date <= to);
  res.json({ events: results });
});

router.get('/:id', (req, res) => {
  const event = EVENTS.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found.' });
  res.json({ event });
});

module.exports = router;
