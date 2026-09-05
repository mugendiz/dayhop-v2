// services/db/supabaseStore.js — Supabase/Postgres implementation of the store.
// Same async interface as memoryStore. Column names are snake_case in the DB;
// these helpers map rows back to the camelCase shapes the routes return so the
// API response is identical regardless of which backend is active.

const { getClient, getUserClient } = require('./client');
const { genId } = require('./ids');

// Pick the PostgREST client for a call: a signed-in user's token-scoped client
// (so RLS keyed on auth.uid() applies) when ctx.accessToken is present, else
// the shared anon client (used for anonymous paths like community submit).
function clientFor(ctx) {
  return ctx && ctx.accessToken ? getUserClient(ctx.accessToken) : getClient();
}

function fail(error, where) {
  const err = new Error(`Supabase ${where} failed: ${error.message}`);
  err.code = 'DB_ERROR';
  err.cause = error;
  return err;
}

const adventureFromRow = (r) => r && ({ id: r.id, ownerId: r.owner_id, plan: r.plan, created_at: r.created_at });
const shortlistFromRow = (r) => r && ({ id: r.id, ownerId: r.owner_id, idea_id: r.idea_id, idea: r.idea, created_at: r.created_at });
const submissionFromRow = (r) => r && ({
  id: r.id, title: r.title, location: r.location, date: r.event_date,
  description: r.description, submittedBy: r.submitted_by,
  status: r.status, submitted_at: r.submitted_at
});

// ---------- adventures ----------
async function createAdventure({ ownerId, plan }, ctx) {
  const row = { id: genId('adv'), owner_id: ownerId, plan };
  const { data, error } = await clientFor(ctx).from('adventures').insert(row).select().single();
  if (error) throw fail(error, 'createAdventure');
  return adventureFromRow(data);
}

async function listAdventures(ownerId, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('adventures').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw fail(error, 'listAdventures');
  return (data || []).map(adventureFromRow);
}

async function getAdventure(id, ownerId, ctx) {
  // Scope by owner_id at the DB layer so isolation never depends solely on a
  // route-level check (RLS is also bypassed when a service key is configured).
  const { data, error } = await clientFor(ctx)
    .from('adventures').select('*').eq('id', id).eq('owner_id', ownerId).maybeSingle();
  if (error) throw fail(error, 'getAdventure');
  return adventureFromRow(data);
}

async function deleteAdventure(id, ctx) {
  const { data, error } = await clientFor(ctx).from('adventures').delete().eq('id', id).select('id');
  if (error) throw fail(error, 'deleteAdventure');
  return Array.isArray(data) && data.length > 0;
}

// ---------- shortlist ----------
async function addShortlistItem({ ownerId, idea }, ctx) {
  const client = clientFor(ctx);
  const ideaId = String(idea.id);
  // INSERT first — the common case, one round trip. A unique-constraint hit
  // (re-add, or a double-tap racing two inserts — which used to 500) falls
  // through to UPDATE, which keeps the original row's primary key (matches
  // memoryStore). The old select-then-write version had a race window
  // between the SELECT and the INSERT.
  const row = { id: genId('sl'), owner_id: ownerId, idea_id: ideaId, idea };
  const ins = await client.from('shortlist_items').insert(row).select().single();
  if (!ins.error) return shortlistFromRow(ins.data);
  if (ins.error.code !== '23505') throw fail(ins.error, 'addShortlistItem');
  const { data, error } = await client
    .from('shortlist_items').update({ idea }).eq('owner_id', ownerId).eq('idea_id', ideaId).select().single();
  if (error) throw fail(error, 'addShortlistItem');
  return shortlistFromRow(data);
}

async function listShortlist(ownerId, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('shortlist_items').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw fail(error, 'listShortlist');
  return (data || []).map(shortlistFromRow);
}

async function removeShortlistItem({ ownerId, ideaId }, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('shortlist_items').delete().eq('owner_id', ownerId).eq('idea_id', String(ideaId)).select('id');
  if (error) throw fail(error, 'removeShortlistItem');
  return Array.isArray(data) && data.length > 0;
}

async function clearShortlist(ownerId, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('shortlist_items').delete().eq('owner_id', ownerId).select('id');
  if (error) throw fail(error, 'clearShortlist');
  return Array.isArray(data) ? data.length : 0;
}

// ---------- community submissions ----------
async function createSubmission({ title, location, date, description, submittedBy }, ctx) {
  const row = {
    id: genId('sub'), title, location, event_date: date,
    description: description || '', submitted_by: submittedBy || 'anonymous', status: 'pending'
  };
  const { data, error } = await clientFor(ctx).from('community_submissions').insert(row).select().single();
  if (error) throw fail(error, 'createSubmission');
  return submissionFromRow(data);
}

async function listPendingSubmissions(ctx) {
  // Oldest-first (FIFO) so the moderation queue is fair and matches memoryStore.
  const { data, error } = await clientFor(ctx)
    .from('community_submissions').select('*').eq('status', 'pending').order('submitted_at', { ascending: true });
  if (error) throw fail(error, 'listPendingSubmissions');
  return (data || []).map(submissionFromRow);
}

async function setSubmissionStatus(id, status, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('community_submissions').update({ status }).eq('id', id).select().maybeSingle();
  if (error) throw fail(error, 'setSubmissionStatus');
  return submissionFromRow(data);
}

// ---------- guides (exported shortlist itineraries) ----------
const guideFromRow = (r) => r && ({
  id: r.id, ownerId: r.owner_id, share_id: r.share_id, title: r.title,
  city: r.city, guide: r.guide, is_public: r.is_public, created_at: r.created_at
});

async function createGuide({ ownerId, shareId, title, city, guide }, ctx) {
  const row = {
    id: genId('gd'), owner_id: ownerId, share_id: shareId,
    title: title || 'Your day', city: city || null, guide
  };
  const { data, error } = await clientFor(ctx).from('guides').insert(row).select().single();
  if (error) throw fail(error, 'createGuide');
  return guideFromRow(data);
}

async function countGuides(ownerId, ctx) {
  const { count, error } = await clientFor(ctx)
    .from('guides').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId);
  if (error) throw fail(error, 'countGuides');
  return count || 0;
}

async function listGuides(ownerId, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('guides').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw fail(error, 'listGuides');
  return (data || []).map(guideFromRow);
}

async function getGuideById(id, ownerId, ctx) {
  // Owner-scoped at the DB layer (like getAdventure) so isolation never
  // depends solely on RLS being active.
  const { data, error } = await clientFor(ctx)
    .from('guides').select('*').eq('id', id).eq('owner_id', ownerId).maybeSingle();
  if (error) throw fail(error, 'getGuideById');
  return guideFromRow(data);
}

// Edit timestamps live inside the guide jsonb (guide.updated_at, set by the
// route) so no schema migration is needed on already-deployed guides tables.
async function updateGuide({ id, ownerId, title, city, guide }, ctx) {
  const patch = { guide };
  if (title) patch.title = title;
  if (city !== undefined) patch.city = city;
  const { data, error } = await clientFor(ctx)
    .from('guides').update(patch).eq('id', id).eq('owner_id', ownerId).select().maybeSingle();
  if (error) throw fail(error, 'updateGuide');
  return guideFromRow(data);
}

async function deleteGuide(id, ownerId, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('guides').delete().eq('id', id).eq('owner_id', ownerId).select('id');
  if (error) throw fail(error, 'deleteGuide');
  return Array.isArray(data) && data.length > 0;
}

async function getGuideByShareId(shareId) {
  // Share pages are anonymous by design — the anon client + "guides shared
  // read" RLS policy scope this to is_public rows.
  const { data, error } = await getClient()
    .from('guides').select('*').eq('share_id', shareId).eq('is_public', true).maybeSingle();
  if (error) throw fail(error, 'getGuideByShareId');
  return guideFromRow(data);
}

// ---------- plan votes (social vote MVP) ----------
// Server-only table (no RLS policies): always the shared service client,
// keyed on a share_id that is unguessable by construction.
async function upsertPlanVote({ shareId, stopKey, voterKey, vote }) {
  const client = getClient();
  if (vote === 0) {
    const { error } = await client.from('plan_votes').delete()
      .eq('share_id', shareId).eq('stop_key', stopKey).eq('voter_key', voterKey);
    if (error) throw fail(error, 'upsertPlanVote:delete');
    return true;
  }
  const row = { share_id: shareId, stop_key: stopKey, voter_key: voterKey, vote, updated_at: new Date().toISOString() };
  const { error } = await client.from('plan_votes').upsert(row, { onConflict: 'share_id,stop_key,voter_key' });
  if (error) throw fail(error, 'upsertPlanVote');
  return true;
}

async function listPlanVotes(shareId) {
  const { data, error } = await getClient()
    .from('plan_votes').select('stop_key, voter_key, vote').eq('share_id', shareId).limit(5000);
  if (error) throw fail(error, 'listPlanVotes');
  return data || [];
}

// ---------- users ----------
async function upsertUser({ id, email }, ctx) {
  const row = id ? { id, email } : { email };
  const { data, error } = await clientFor(ctx)
    .from('users').upsert(row, { onConflict: 'email' }).select().single();
  if (error) throw fail(error, 'upsertUser');
  return data;
}

module.exports = {
  createAdventure, listAdventures, getAdventure, deleteAdventure,
  addShortlistItem, listShortlist, removeShortlistItem, clearShortlist,
  createSubmission, listPendingSubmissions, setSubmissionStatus,
  createGuide, countGuides, listGuides, getGuideById, updateGuide, deleteGuide, getGuideByShareId,
  upsertUser,
  upsertPlanVote, listPlanVotes
};
