// routes/guides.js — DayHop V2
// Saved plans ("guides"): a self-contained, shareable copy of an itinerary.
// This is the save/edit/history primitive behind "My Plans".
//
//   POST   /api/guides            → save a guide (from shortlist+plan, or a
//                                   ready guide payload from edit/re-plan)
//   GET    /api/guides            → list the signed-in user's saved guides
//   PUT    /api/guides/:id        → save edits to a guide (Pro)
//   DELETE /api/guides/:id        → delete a saved guide
//   GET    /api/guides/shared/:id → public JSON for the /g/<share_id> page
//
// Gating (via services/entitlements — enforced only once Stripe is
// configured, Pro unlimited, gate errors fail open):
//   - all owner routes require a signed-in user (requireUser)
//   - free tier saves up to `saved_guides` guides total (default 2)
//   - saving EDITS to an existing guide (PUT) is Pro-only
//   - multi-day guides can only be saved by tiers whose max_trip_days allows

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const { store } = require('../services/db');
const memoryStore = require('../services/db/memoryStore');
const grok = require('../services/grok');
const billing = require('../services/billing');
const analytics = require('../services/analytics');
const { entitlementsFor, MAX_TRIP_DAYS } = require('../services/entitlements');
const { requireUser } = require('../middleware/auth');

const MAX_STOPS = 20;

// Only the fields the guide page renders — never store arbitrary client JSON.
const IDEA_FIELDS = [
  'id', 'title', 'why', 'wow_reason', 'category', 'location', 'venue', 'date',
  'good_for_ages', 'duration_minutes', 'cost_tier', 'price_from', 'currency',
  'rating', 'image_url', 'booking_url', 'maps_url', 'website', 'source', 'distance_km'
];

function sanitizeIdea(raw) {
  const idea = {};
  for (const key of IDEA_FIELDS) {
    const v = raw[key];
    if (v == null) continue;
    idea[key] = typeof v === 'string' ? v.slice(0, 2000) : v;
  }
  return idea;
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// One guide stop from client JSON: fixed fields only, idea sanitized. `note`
// is the user's own annotation from the editor.
function sanitizeStopPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const stop = {
    title: str(raw.title, 200),
    suggested_time: str(raw.suggested_time, 60),
    transition_note: str(raw.transition_note, 300),
    note: str(raw.note, 500),
    idea: sanitizeIdea(raw.idea && typeof raw.idea === 'object' ? raw.idea : {})
  };
  if (!stop.title && !stop.idea.title) return null;
  if (!stop.title) stop.title = stop.idea.title;
  return stop;
}

// A whole guide from client JSON (the edit / re-plan / multi-day save path).
// Returns null when there isn't at least one usable stop.
function sanitizeGuidePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {
    title: str(raw.title, 140) || 'Your day, mapped out',
    city: str(raw.city, 80) || null,
    notes: str(raw.notes, 1000)
  };
  // Weather snapshot from plan time — the share/print page shows it so an
  // exported guide records the conditions it was planned for.
  if (raw.weather && typeof raw.weather === 'object') {
    out.weather = {
      condition: str(raw.weather.condition, 30),
      temp_c: Number.isFinite(Number(raw.weather.temp_c)) ? Number(raw.weather.temp_c) : null,
      description: str(raw.weather.description, 80)
    };
  }
  if (Array.isArray(raw.days) && raw.days.length) {
    out.days = raw.days.slice(0, MAX_TRIP_DAYS).map((d, i) => ({
      label: str(d && d.label, 80) || `Day ${i + 1}`,
      start_time: str(d && d.start_time, 40),
      notes: str(d && d.notes, 500),
      stops: (Array.isArray(d && d.stops) ? d.stops : []).slice(0, MAX_STOPS).map(sanitizeStopPayload).filter(Boolean)
    })).filter(d => d.stops.length);
    if (!out.days.length) return null;
  } else {
    out.start_time = str(raw.start_time, 40);
    out.stops = (Array.isArray(raw.stops) ? raw.stops : []).slice(0, MAX_STOPS).map(sanitizeStopPayload).filter(Boolean);
    if (!out.stops.length) return null;
  }
  return out;
}

function guideDayCount(guide) {
  return guide && Array.isArray(guide.days) && guide.days.length ? guide.days.length : 1;
}

function guideStopCount(guide) {
  if (!guide) return 0;
  if (Array.isArray(guide.days)) return guide.days.reduce((n, d) => n + ((d.stops && d.stops.length) || 0), 0);
  return (guide.stops && guide.stops.length) || 0;
}

// Grok-free fallback: stops in shortlist order, spaced by duration + 30 min.
function fallbackPlan(items) {
  let cursor = 10 * 60; // minutes since midnight, 10:00 AM
  const fmt = (m) => {
    const h24 = Math.floor(m / 60) % 24;
    const h = h24 % 12 || 12;
    return `${h}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  };
  const stops = items.map((item) => {
    const dur = Number(item.duration_minutes) || 90;
    const stop = {
      id: String(item.id),
      title: item.title,
      suggested_time: `${fmt(cursor)} - ${fmt(cursor + dur)}`,
      transition_note: ''
    };
    cursor += dur + 30;
    return stop;
  });
  return { plan_title: 'Your day, mapped out', start_time: '10:00 AM', stops, notes: '' };
}

// Merge the itinerary skeleton (times/transitions) with the full idea payloads
// so the stored guide is self-contained — the share page needs no other data.
// Handles both single-day (plan.stops) and multi-day (plan.days) skeletons.
function assembleGuide(plan, items, city) {
  const byId = new Map(items.map(i => [String(i.id), i]));
  const toStops = (skeletonStops) => (skeletonStops || []).map((stop, i) => {
    const idea = byId.get(String(stop.id)) || items[i] || {};
    return {
      title: stop.title || idea.title || '',
      suggested_time: stop.suggested_time || '',
      transition_note: stop.transition_note || '',
      note: '',
      idea: sanitizeIdea(idea)
    };
  });
  const guide = {
    title: plan.plan_title || 'Your day, mapped out',
    city: city || null,
    notes: plan.notes || ''
  };
  if (Array.isArray(plan.days) && plan.days.length) {
    guide.days = plan.days.slice(0, MAX_TRIP_DAYS).map((d, i) => ({
      label: (d && d.label) || `Day ${i + 1}`,
      start_time: (d && d.start_time) || '',
      notes: (d && d.notes) || '',
      stops: toStops(d && d.stops)
    }));
  } else {
    guide.start_time = plan.start_time || '';
    guide.stops = toStops(plan.stops);
  }
  return guide;
}

function shareUrlFor(req, record) {
  return `${req.protocol}://${req.get('host')}/g/${record.share_id}`;
}

// The owner-facing JSON for one saved guide (list rows + write responses).
function guideResponse(req, record) {
  return {
    id: record.id,
    share_id: record.share_id,
    share_url: shareUrlFor(req, record),
    title: record.title,
    city: record.city,
    day_count: guideDayCount(record.guide),
    stop_count: guideStopCount(record.guide),
    guide: record.guide,
    created_at: record.created_at,
    updated_at: (record.guide && record.guide.updated_at) || null
  };
}

router.post('/', requireUser, async (req, res, next) => {
  const { items, city, plan, guide: rawGuide } = req.body || {};
  const hasGuidePayload = rawGuide && typeof rawGuide === 'object';

  if (!hasGuidePayload && (!Array.isArray(items) || items.length === 0)) {
    return res.status(400).json({
      error: 'EMPTY_SHORTLIST',
      message: 'Add at least one idea to your shortlist before saving a plan.'
    });
  }

  // Free tier: `saved_guides` plans total. Enforced only once Stripe is
  // configured (before that entitlements resolve to preview/unlimited);
  // fails open on gate errors.
  const ent = await entitlementsFor(req.user || req.ownerId).catch(() => null);
  if (ent && ent.saved_guides != null) {
    try {
      let existing;
      try {
        existing = await store.countGuides(req.ownerId, req.dbCtx);
      } catch (err) {
        existing = await memoryStore.countGuides(req.ownerId);
      }
      if (existing >= ent.saved_guides) {
        return res.status(402).json({
          error: 'UPGRADE_REQUIRED',
          feature: 'saved_guides',
          message: `Free includes ${ent.saved_guides} saved plans. Go Pro for unlimited saved plans and full history.`,
          limit: ent.saved_guides
        });
      }
    } catch (err) {
      console.warn('[guides] gate check failed (allowing):', err.message);
    }
  }

  try {
    let guide;
    if (hasGuidePayload) {
      // Ready-made guide (edited or re-planned client-side): sanitize and save.
      guide = sanitizeGuidePayload(rawGuide);
      if (!guide) {
        return res.status(400).json({ error: 'INVALID_GUIDE', message: 'That plan has no usable stops.' });
      }
      if (!guide.city && city) guide.city = str(city, 80);
    } else {
      const trimmed = items.slice(0, MAX_STOPS);
      // Reuse the client's already-built plan when it sent one; otherwise ask
      // Grok, and if Grok is down fall back to a deterministic schedule — a
      // save must never fail just because the AI is unavailable.
      let skeleton = plan && (Array.isArray(plan.stops) && plan.stops.length || Array.isArray(plan.days) && plan.days.length) ? plan : null;
      if (!skeleton) {
        try {
          skeleton = await grok.buildDayPlan({ items: trimmed, city });
        } catch (err) {
          console.warn('[guides] Grok plan failed, using fallback schedule:', err.message);
          skeleton = fallbackPlan(trimmed);
        }
      }
      guide = assembleGuide(skeleton, trimmed, city);
    }

    // Multi-day guides are Pro territory: the /plan route already gates
    // building them, this is the belt-and-braces on the save path.
    if (billing.isConfigured() && ent && guideDayCount(guide) > ent.max_trip_days) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        feature: 'multi_day',
        message: 'Saving multi-day itineraries is a Pro feature. Go Pro to keep your weekend plans.'
      });
    }

    guide.updated_at = new Date().toISOString();
    const shareId = crypto.randomBytes(9).toString('base64url');
    const guideRow = { ownerId: req.ownerId, shareId, title: guide.title, city: guide.city, guide };
    let record;
    try {
      record = await store.createGuide(guideRow, req.dbCtx);
    } catch (err) {
      // Fail-soft (e.g. guides table not migrated yet): keep saves working
      // in process memory, like billing does for subscriptions.
      console.warn('[guides] persist failed (kept in memory):', err.message);
      record = await memoryStore.createGuide(guideRow);
    }

    analytics.recordEvent({
      type: 'guide_created',
      ownerKey: req.ownerId,
      meta: { stops: guideStopCount(guide), days: guideDayCount(guide), from: hasGuidePayload ? 'guide_payload' : 'shortlist' }
    });
    res.status(201).json(guideResponse(req, record));
  } catch (err) { next(err); }
});

// "My Plans": every saved guide the user owns, newest first. The full guide
// payload rides along so the client can open/edit without a second request.
router.get('/', requireUser, async (req, res, next) => {
  try {
    let rows;
    try {
      rows = await store.listGuides(req.ownerId, req.dbCtx);
      // A save that fail-softed during a DB blip lives only in process
      // memory: without this merge it never appears in "My Plans" once the
      // DB recovers (even though its share link works), so the user sees
      // "saved" and then the plan silently vanishes from the list.
      if (store !== memoryStore) {
        const memRows = await memoryStore.listGuides(req.ownerId);
        if (memRows.length) {
          const seen = new Set(rows.map(r => String(r.id)));
          rows = rows.concat(memRows.filter(r => !seen.has(String(r.id))))
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        }
      }
    } catch (err) {
      console.warn('[guides] list fell back to memory:', err.message);
      rows = await memoryStore.listGuides(req.ownerId);
    }
    const ent = await entitlementsFor(req.user || req.ownerId).catch(() => null);
    res.json({
      guides: rows.map(r => guideResponse(req, r)),
      limit: ent ? ent.saved_guides : null, // null = unlimited
      tier: ent ? ent.tier : 'preview'
    });
  } catch (err) { next(err); }
});

// Save edits to an existing guide — the Pro half of "editable guides".
// (Free users can edit locally in the client; persisting the edit is Pro.)
router.put('/:id', requireUser, async (req, res, next) => {
  try {
    const ent = await entitlementsFor(req.user || req.ownerId).catch(() => null);
    if (billing.isConfigured() && (!ent || !ent.can_edit_saved_guides)) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        feature: 'edit_guide',
        message: 'Saving your customized plan is a Pro feature. Go Pro to edit and keep every version.'
      });
    }

    const guide = sanitizeGuidePayload(req.body && req.body.guide);
    if (!guide) {
      return res.status(400).json({ error: 'INVALID_GUIDE', message: 'That plan has no usable stops.' });
    }
    if (billing.isConfigured() && ent && guideDayCount(guide) > ent.max_trip_days) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        feature: 'multi_day',
        message: 'Saving multi-day itineraries is a Pro feature.'
      });
    }
    guide.updated_at = new Date().toISOString();

    const id = String(req.params.id);
    const patch = { id, ownerId: req.ownerId, title: guide.title, city: guide.city, guide };
    let record;
    try {
      record = await store.updateGuide(patch, req.dbCtx);
    } catch (err) {
      console.warn('[guides] update fell back to memory:', err.message);
      record = await memoryStore.updateGuide(patch);
    }
    // Not in the primary store? The guide may be a fail-soft save that only
    // exists in memory (same both-stores rule the delete route follows).
    if (!record && store !== memoryStore) {
      record = await memoryStore.updateGuide(patch);
    }
    if (!record) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'This plan no longer exists.' });
    }

    analytics.recordEvent({
      type: 'guide_edited',
      ownerKey: req.ownerId,
      meta: { stops: guideStopCount(guide), days: guideDayCount(guide) }
    });
    res.json(guideResponse(req, record));
  } catch (err) { next(err); }
});

router.delete('/:id', requireUser, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    // A guide can live in either store (fail-soft creates land in memory), so
    // try both — deleted from anywhere counts.
    let deleted = false;
    try {
      deleted = await store.deleteGuide(id, req.ownerId, req.dbCtx);
    } catch (err) {
      console.warn('[guides] delete fell back to memory:', err.message);
    }
    const deletedFromMemory = await memoryStore.deleteGuide(id, req.ownerId);
    if (!deleted && !deletedFromMemory) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'This plan no longer exists.' });
    }
    analytics.recordEvent({ type: 'guide_deleted', ownerKey: req.ownerId });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/shared/:shareId', async (req, res, next) => {
  try {
    const shareId = String(req.params.shareId);
    let record = null;
    try {
      record = await store.getGuideByShareId(shareId);
    } catch (err) {
      console.warn('[guides] shared read fell back to memory:', err.message);
    }
    if (!record) record = await memoryStore.getGuideByShareId(shareId);
    if (!record) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'This guide does not exist or is no longer shared.' });
    }
    // Public payload: everything the page renders, never the owner id.
    res.json({
      share_id: record.share_id,
      title: record.title,
      city: record.city,
      guide: record.guide,
      created_at: record.created_at
    });
  } catch (err) { next(err); }
});

module.exports = router;
