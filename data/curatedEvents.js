// data/curatedEvents.js — DayHop-curated seed events.
// Extracted verbatim from routes/events.js so both the /api/events route and
// the generate candidate pipeline can share one source of truth.
// Ids use the 'cur-' prefix per the shared candidate id convention
// (see services/ticketmaster.js JSDoc).

const EVENTS = [
  {
    id: 'cur-wc26-rh-library-watch-party',
    title: 'World Cup 2026 Watch Party — Richmond Hill Library',
    category: 'worldcup',
    location: 'Richmond Hill',
    date: '2026-06-20',
    description: 'Big screen, kids activity corner, concession on site.',
    cost_tier: 'free',
    source: 'curated'
  }
];

module.exports = EVENTS;
