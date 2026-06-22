// services/db/memoryStore.js — in-memory implementation of the data store.
// This is the local-dev / no-credentials fallback. It preserves the exact
// behavior the routes had when they each owned a Map/array, but behind the
// same async interface as the Supabase store so routes are backend-agnostic.
// Data lives only for the process lifetime and is wiped on restart.

const { genId } = require('./ids');

const adventures = new Map();        // id -> record
const shortlist = new Map();         // ownerId -> Map(ideaId -> item)
const submissions = [];              // array of submission records
const users = new Map();             // id -> user

// ---------- adventures ----------
async function createAdventure({ ownerId, plan }) {
  const id = genId('adv');
  const record = { id, ownerId, plan, created_at: new Date().toISOString() };
  adventures.set(id, record);
  return record;
}

async function listAdventures(ownerId) {
  return [...adventures.values()]
    .filter(a => a.ownerId === ownerId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getAdventure(id, ownerId) {
  const record = adventures.get(id);
  // Match the Supabase store: only return the row to its owner.
  return record && record.ownerId === ownerId ? record : null;
}

async function deleteAdventure(id) {
  return adventures.delete(id);
}

// ---------- shortlist ----------
function ownerMap(ownerId) {
  if (!shortlist.has(ownerId)) shortlist.set(ownerId, new Map());
  return shortlist.get(ownerId);
}

async function addShortlistItem({ ownerId, idea }) {
  const map = ownerMap(ownerId);
  const ideaId = String(idea.id);
  // Upsert: keep the original created_at if it already exists.
  const existing = map.get(ideaId);
  const record = existing || { id: genId('sl'), ownerId, idea_id: ideaId, idea, created_at: new Date().toISOString() };
  record.idea = idea;
  map.set(ideaId, record);
  return record;
}

async function listShortlist(ownerId) {
  const map = shortlist.get(ownerId);
  if (!map) return [];
  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function removeShortlistItem({ ownerId, ideaId }) {
  const map = shortlist.get(ownerId);
  if (!map) return false;
  return map.delete(String(ideaId));
}

async function clearShortlist(ownerId) {
  const map = shortlist.get(ownerId);
  if (!map) return 0;
  const n = map.size;
  shortlist.delete(ownerId);
  return n;
}

// ---------- community submissions ----------
async function createSubmission({ title, location, date, description, submittedBy }) {
  const submission = {
    id: genId('sub'),
    title,
    location,
    date,
    description: description || '',
    submittedBy: submittedBy || 'anonymous',
    status: 'pending',
    submitted_at: new Date().toISOString()
  };
  submissions.push(submission);
  return submission;
}

async function listPendingSubmissions() {
  return submissions.filter(s => s.status === 'pending');
}

async function setSubmissionStatus(id, status) {
  const sub = submissions.find(s => s.id === id);
  if (!sub) return null;
  sub.status = status;
  return sub;
}

// ---------- users (minimal; Phase 3 wires real auth) ----------
async function upsertUser({ id, email }) {
  const record = users.get(id) || { id, created_at: new Date().toISOString() };
  if (email) record.email = email;
  users.set(id, record);
  return record;
}

module.exports = {
  createAdventure, listAdventures, getAdventure, deleteAdventure,
  addShortlistItem, listShortlist, removeShortlistItem, clearShortlist,
  createSubmission, listPendingSubmissions, setSubmissionStatus,
  upsertUser
};
