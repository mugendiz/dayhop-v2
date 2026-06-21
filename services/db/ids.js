// services/db/ids.js — app-generated record ids, shared by both stores so
// memory and Supabase produce identical id shapes (e.g. "adv-...", "sub-...").
function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
module.exports = { genId };
