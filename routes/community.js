// routes/community.js — DayHop V2
// Community event submissions, held in a moderation queue until a
// curator approves them. In-memory for V2; move to a real DB + admin
// dashboard before opening submissions publicly.
const express = require('express');
const router = express.Router();

const submissions = [];

router.post('/submit', (req, res) => {
  const { title, location, date, description, submittedBy } = req.body || {};

  if (!title || !location || !date) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'title, location, and date are required.'
    });
  }

  const submission = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    location,
    date,
    description: description || '',
    submittedBy: submittedBy || 'anonymous',
    status: 'pending',
    submitted_at: new Date().toISOString()
  };

  submissions.push(submission);
  res.status(201).json({
    submission,
    message: 'Thanks — your event is in our review queue and will appear once vetted.'
  });
});

// Curator-facing: list pending submissions. Lock this behind real auth
// before launch — currently open for internal review only.
router.get('/queue', (req, res) => {
  res.json({ pending: submissions.filter(s => s.status === 'pending') });
});

router.post('/:id/approve', (req, res) => {
  const sub = submissions.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
  sub.status = 'approved';
  res.json({ submission: sub });
});

router.post('/:id/reject', (req, res) => {
  const sub = submissions.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
  sub.status = 'rejected';
  res.json({ submission: sub });
});

module.exports = router;
