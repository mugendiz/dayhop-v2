// services/planVotes.js — social vote MVP (Sept 2026, launches post-revenue).
// The shared guide link is the unit families forward to each other; this
// lets whoever opens it tap 👍/👎 per stop and "I'm in", so the owner can
// decide without a group chat. Pure validation + tally shaping here; storage
// lives in services/db (memoryStore / supabaseStore).

const MAX_STOPS = 20;

function enabled() {
  return String(process.env.SOCIAL_VOTE || '').toLowerCase() === 'on';
}

// stop: 'going' | integer 0..19 (global stop index in the guide page).
function normalizeStopKey(stop) {
  if (stop === 'going') return 'going';
  const n = Number(stop);
  if (Number.isInteger(n) && n >= 0 && n < MAX_STOPS) return String(n);
  return null;
}

// 1 / -1 / 0 (clear). "going" only takes 1 or 0.
function normalizeVote(vote, stopKey) {
  const v = Number(vote);
  if (![1, -1, 0].includes(v)) return null;
  if (stopKey === 'going' && v === -1) return null;
  return v;
}

// Voter identity: a signed-in user id beats anything the client sends; an
// anonymous voter must present its own guest id (the same localStorage key
// app.js uses), so one browser = one vote per stop.
function voterKeyFor(req) {
  if (req.ownerId) return String(req.ownerId).slice(0, 80);
  const raw = String((req.body && req.body.voter) || (req.query && req.query.v) || '').trim();
  return /^guest-[a-z0-9]{4,16}$/.test(raw) ? raw : null;
}

function tally(rows, voterKey) {
  const stops = {};
  let going = 0;
  const mine = { going: false, stops: {} };
  for (const r of rows) {
    if (r.stop_key === 'going') {
      if (r.vote === 1) going++;
      if (voterKey && r.voter_key === voterKey && r.vote === 1) mine.going = true;
      continue;
    }
    const s = stops[r.stop_key] || (stops[r.stop_key] = { up: 0, down: 0 });
    if (r.vote === 1) s.up++; else if (r.vote === -1) s.down++;
    if (voterKey && r.voter_key === voterKey) mine.stops[r.stop_key] = r.vote;
  }
  return { going, stops, mine };
}

module.exports = { enabled, normalizeStopKey, normalizeVote, voterKeyFor, tally, MAX_STOPS };
