// routes/places.js — DayHop V2
// Static/curated place data. In V2 this is an in-memory seed list;
// swap the array for a real DB (Postgres/Supabase) when ready to scale.
const express = require('express');
const router = express.Router();

const PLACES = [
  {
    id: 'mill-pond-park',
    name: 'Mill Pond Park',
    category: 'kids',
    location: 'Richmond Hill',
    description: 'Splash pad, playground, and walking trails around the pond.',
    cost_tier: 'free',
    good_for_ages: 'all ages'
  },
  {
    id: 'richmond-hill-library',
    name: 'Richmond Hill Central Library',
    category: 'worldcup',
    location: 'Richmond Hill',
    description: 'Community space with screenings and family programming.',
    cost_tier: 'free',
    good_for_ages: 'all ages'
  },
  {
    id: 'lake-wilcox-park',
    name: 'Lake Wilcox Park',
    category: 'water',
    location: 'Richmond Hill',
    description: 'Beach area, splash pad, and lakeside trails.',
    cost_tier: 'free',
    good_for_ages: 'all ages'
  }
];

router.get('/', (req, res) => {
  const { category, location } = req.query;
  let results = PLACES;
  if (category) results = results.filter(p => p.category === category);
  if (location) {
    const q = location.toLowerCase();
    results = results.filter(p => p.location.toLowerCase().includes(q));
  }
  res.json({ places: results });
});

router.get('/:id', (req, res) => {
  const place = PLACES.find(p => p.id === req.params.id);
  if (!place) return res.status(404).json({ error: 'NOT_FOUND', message: 'Place not found.' });
  res.json({ place });
});

module.exports = router;
