// routes/community.js — DayHop V2
// Community event submissions, held in a moderation queue until a curator
// approves them. Storage goes through the shared store (Supabase when
// configured, else in-memory) — see services/db.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');

router.post('/submit', async (req, res, next) => {
  const { title, location, date, description, submittedBy } = req.body || {};

  if (!title || !location || !date) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'title, location, and date are required.'
    });
  }

  try {
    const submission = await store.createSubmission({ title, location, date, description, submittedBy });
    res.status(201).json({
      submission,
      message: 'Thanks — your event is in our review queue and will appear once vetted.'
    });
  } catch (err) { next(err); }
});

// Curator-facing: list pending submissions. Lock this behind real auth
// before launch — currently open for internal review only.
router.get('/queue', async (req, res, next) => {
  try {
    const pending = await store.listPendingSubmissions();
    res.json({ pending });
  } catch (err) { next(err); }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const submission = await store.setSubmissionStatus(req.params.id, 'approved');
    if (!submission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
    res.json({ submission });
  } catch (err) { next(err); }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const submission = await store.setSubmissionStatus(req.params.id, 'rejected');
    if (!submission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
    res.json({ submission });
  } catch (err) { next(err); }
});

module.exports = router;
