// services/samePlace.js — DayHop V2
// "Is this the same place (or event) under another name?" for the
// personalized trip guide, so a book never recommends one thing twice.
//
// Listings name the same place many ways: "Edwards Gardens" and "Edwards
// Gardens & the Don ravine trails"; "Markham Festival of Lights" and "41st
// Annual Festival of Lights"; "Remembrance Day Parade" and "Richmond Hill
// Remembrance Day Parade and Ceremony". Two titles match when the words of
// the shorter one are (nearly all) inside the longer one, once town names
// and filler are set aside. Two titles that name DIFFERENT towns are never
// the same ("Treetop Trekking Stouffville" is not "Treetop Trekking
// Brampton").

const { ONTARIO_PLACES } = require('../data/ontarioPlaces');

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Town names as word sequences, longest first ("richmond hill" before "hill").
const TOWNS = [...new Set(ONTARIO_PLACES.map(p => norm(p.name)).concat(['toronto', 'gta', 'ontario', 'canada']))]
  .filter(t => t.length >= 4)
  .sort((a, b) => b.length - a.length);
const FILLER = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'near', 'nearby', 'local', 'annual', 'year', 'round',
  'a', 'an', 'of', 'at', 'in', 'on', 'to', 'by', 'its', 'our', 'walk', 'visit', 'see', 'look', 'through', 'ride']);

// → { towns: Set, words: Set } for a title.
function signature(title) {
  let s = ` ${norm(title)} `;
  const towns = new Set();
  for (const t of TOWNS) {
    if (s.includes(` ${t} `)) { towns.add(t); s = s.split(` ${t} `).join(' '); }
  }
  const words = new Set(s.split(/\s+/).filter(w => w && !FILLER.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w)));
  return { towns, words };
}

// The name before any subtitle: "Toronto Zoo — 10 km of trails" → "toronto zoo".
const headKey = title => norm(String(title || '').split(/\s(?:&|and|[-–—])\s|:\s|,\s|\s\(/)[0]).replace(/^the /, '');

function samePlace(a, b) {
  if (!a || !b) return false;
  if (norm(a) === norm(b) || headKey(a) === headKey(b)) return true;
  const A = signature(a), B = signature(b);
  if (A.towns.size && B.towns.size && ![...A.towns].some(t => B.towns.has(t))) return false;
  const [small, big] = A.words.size <= B.words.size ? [A.words, B.words] : [B.words, A.words];
  if (small.size < 2) return false; // one shared word ("park") proves nothing
  const hits = [...small].filter(w => big.has(w)).length;
  return hits / small.size >= 0.75;
}

// Every name a listing goes by: its title, and for a place (not a dated
// event) the venue it sits in. "Look through Canada's largest telescope" is
// at "David Dunlap Observatory, Richmond Hill", which is how another source
// names it. Events share streets ("Main Street, Markham"), so their venue
// never makes two events one; nor does an address or a one-word venue.
function namesOf(x) {
  if (!x) return [];
  if (typeof x === 'string') return [x];
  const names = [x.title || x.name].filter(Boolean);
  const venue = String((x.listing && x.listing.where) || x.where || '').split(',')[0].trim();
  if (!x.date && venue && !/\d/.test(venue) && venue.split(/\s+/).length >= 2) names.push(venue);
  return names;
}

// A running list of what a book has already recommended. Takes titles or
// listing objects.
function placeSet(items = []) {
  const seen = [];
  const api = {
    has: x => namesOf(x).some(n => seen.some(s => samePlace(s, n))),
    add: x => { seen.push(...namesOf(x)); return api; },
    // true (and remembered) when new; false when already in the set
    claim: x => (api.has(x) ? false : (api.add(x), true))
  };
  items.forEach(api.add);
  return api;
}

// Near-duplicate advice ("Pack snacks for Leila's 3pm slump" and "Snacks
// for Leila's early tired moments"): most significant words shared.
function sameAdvice(a, b) {
  const words = s => new Set(norm(s).split(/\s+/).filter(w => w.length >= 4 && !FILLER.has(w)).map(w => w.replace(/s$/, '')));
  const A = words(a), B = words(b);
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size < 2) return false;
  return [...small].filter(w => big.has(w)).length / small.size >= 0.6;
}

module.exports = { samePlace, placeSet, namesOf, sameAdvice, signature };
