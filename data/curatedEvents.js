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
  },
  {
    // Founder-flagged via Instagram (@wonderof.jazzylife), Oct 2026. Dates,
    // location and the pitch are from Upper Canada Mall's own event listing,
    // so this is the operator's word and not a creator's estimate: Sat 03 Oct
    // to Sun 01 Nov 2026, south parking lot at Yonge St and Davis Dr.
    //
    // date_end is the point of this entry as much as the event is. A 29 day
    // run is the first thing in the catalog long enough to expose the
    // start-date filters in services/candidates.js and the Talk of the town
    // floor, both of which treated an event as over the day after it opened.
    //
    // Prices from the operator's card, via the creator's screenshot: $28.99
    // general admission age 10 and up, $34.99 for one child and one adult,
    // up to $92.97 for three children and two adults, $14.99 per person for
    // the unlimited tour pass. Only the entry price is in the description so
    // a change to one tier cannot quietly make the card wrong.
    id: 'cur-royal-duck-upper-canada-2026',
    title: 'The Royal Duck bounce park at Upper Canada Mall',
    category: 'kids',
    location: 'Newmarket',
    venue: 'Upper Canada Mall, south lot at Yonge St and Davis Dr',
    date: '2026-10-03',
    date_end: '2026-11-01',
    description: 'A travelling pop-up bounce park of giant inflatable castles in the south parking lot, with music and room to jump. From $28.99 for ages 10 and up.',
    cost_tier: '$$',
    source: 'curated'
  }
];

module.exports = EVENTS;
