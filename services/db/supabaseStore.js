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

async function getAdventure(id, ctx) {
  const { data, error } = await clientFor(ctx).from('adventures').select('*').eq('id', id).maybeSingle();
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
  const row = { id: genId('sl'), owner_id: ownerId, idea_id: String(idea.id), idea };
  // Upsert on the (owner_id, idea_id) unique constraint so re-adds don't error.
  const { data, error } = await clientFor(ctx)
    .from('shortlist_items')
    .upsert(row, { onConflict: 'owner_id,idea_id', ignoreDuplicates: false })
    .select().single();
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
  const { data, error } = await clientFor(ctx)
    .from('community_submissions').select('*').eq('status', 'pending').order('submitted_at', { ascending: false });
  if (error) throw fail(error, 'listPendingSubmissions');
  return (data || []).map(submissionFromRow);
}

async function setSubmissionStatus(id, status, ctx) {
  const { data, error } = await clientFor(ctx)
    .from('community_submissions').update({ status }).eq('id', id).select().maybeSingle();
  if (error) throw fail(error, 'setSubmissionStatus');
  return submissionFromRow(data);
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
  upsertUser
};
