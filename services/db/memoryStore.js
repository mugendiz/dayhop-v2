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
const planVotes = new Map();         // shareId -> Map(`${stopKey}|${voterKey}` -> vote)

// ---------- plan votes (social vote MVP) ----------
async function upsertPlanVote({ shareId, stopKey, voterKey, vote }) {
  if (!planVotes.has(shareId)) planVotes.set(shareId, new Map());
  const m = planVotes.get(shareId);
  const k = `${stopKey}|${voterKey}`;
  if (vote === 0) m.delete(k); else m.set(k, vote);
  return true;
}

async function listPlanVotes(shareId) {
  const m = planVotes.get(shareId);
  if (!m) return [];
  return [...m.entries()].map(([k, vote]) => {
    const i = k.indexOf('|');
    return { stop_key: k.slice(0, i), voter_key: k.slice(i + 1), vote };
  });
}

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

// ---------- guides (exported shortlist itineraries) ----------
const guides = new Map(); // id -> record

async function createGuide({ ownerId, shareId, title, city, guide }) {
  const record = {
    id: genId('gd'), ownerId, share_id: shareId,
    title: title || 'Your day', city: city || null, guide,
    is_public: true, created_at: new Date().toISOString()
  };
  guides.set(record.id, record);
  return record;
}

async function countGuides(ownerId) {
  let n = 0;
  for (const g of guides.values()) if (g.ownerId === ownerId) n++;
  return n;
}

async function listGuides(ownerId) {
  return [...guides.values()]
    .filter(g => g.ownerId === ownerId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getGuideById(id, ownerId) {
  const g = guides.get(id);
  // Owner-scoped like getAdventure: never return another owner's guide.
  return g && g.ownerId === ownerId ? g : null;
}

async function updateGuide({ id, ownerId, title, city, guide }) {
  const g = guides.get(id);
  if (!g || g.ownerId !== ownerId) return null;
  if (title) g.title = title;
  if (city !== undefined) g.city = city;
  g.guide = guide;
  return g;
}

async function deleteGuide(id, ownerId) {
  const g = guides.get(id);
  if (!g || g.ownerId !== ownerId) return false;
  return guides.delete(id);
}

async function getGuideByShareId(shareId) {
  for (const g of guides.values()) {
    if (g.share_id === shareId && g.is_public) return g;
  }
  return null;
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
  createGuide, countGuides, listGuides, getGuideById, updateGuide, deleteGuide, getGuideByShareId,
  upsertUser,
  upsertPlanVote, listPlanVotes
};
