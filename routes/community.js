// routes/community.js — DayHop V2
// Community event submissions, held in a moderation queue until a curator
// approves them. Storage goes through the shared store (Supabase when
// configured, else in-memory) — see services/db.
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');
const { requireUser } = require('../middleware/auth');
const { isAdmin } = require('../services/entitlements');

// Curator/moderation actions are admin-only — any signed-in user must not
// be able to see or decide other people's submissions. Mirrors the isAdmin
// check services/moderation.js already uses to bypass the ban guard.
function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required.' });
}

router.post('/submit', async (req, res, next) => {
  const { title, location, date, description, submittedBy } = req.body || {};

  if (!title || !location || !date) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'title, location, and date are required.'
    });
  }

  // Prefer the signed-in user's email for attribution when available.
  const attributedTo = (req.user && req.user.email) || submittedBy;

  try {
    const submission = await store.createSubmission({ title, location, date, description, submittedBy: attributedTo });
    res.status(201).json({
      submission,
      message: 'Thanks — your event is in our review queue and will appear once vetted.'
    });
  } catch (err) { next(err); }
});

// Curator-facing: list pending submissions and decide them. requireUser
// first (sets req.dbCtx so the per-user RLS policy applies), then
// requireAdmin — any signed-in user is no longer enough on its own.
router.get('/queue', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const pending = await store.listPendingSubmissions(req.dbCtx);
    res.json({ pending });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const submission = await store.setSubmissionStatus(req.params.id, 'approved', req.dbCtx);
    if (!submission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
    res.json({ submission });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const submission = await store.setSubmissionStatus(req.params.id, 'rejected', req.dbCtx);
    if (!submission) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' });
    res.json({ submission });
  } catch (err) { next(err); }
});

module.exports = router;
