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
    // A temporary stand-in, not the real thing. Places can only return Upper
    // Canada Mall for this, because a travelling bounce park is not a place,
    // and a photo of a mall facade on a card about inflatable castles is the
    // wrong picture rather than a missing one. This is the same playground
    // image the app already falls back to for the kids category, so it is
    // licence-clean and on-message. Swap in the operator's own photo when one
    // is to hand (royalduck.ca, or the mall's event listing): one URL, no
    // other change needed.
    image_url: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=900&q=70',
    booking_url: 'https://www.royalduck.ca/',
    source: 'curated'
  },
  {
    // Founder-flagged via Instagram (@ouradventures.withgrace with
    // @narcitycanada), Oct 8 2026. Dates and venue are confirmed by two
    // listings apart from the post: NOW Toronto and Toronto On Demand, both
    // Oct 9 to 12 2026 at Sugar Beach, 11 Dockside Dr, produced by Street
    // Eats Market. Hours are from the NOW Toronto listing. Free admission is
    // the post's claim (Narcity is a co-author) and matches the free 2025
    // edition at HTO Park; neither listing contradicts it.
    //
    // No image_url on purpose. Unlike a pop-up in a mall lot, the host venue
    // IS the picture here: a Places photo of Sugar Beach is the right photo.
    // The creator's own photo is theirs, so it is not borrowed.
    //
    // No booking_url: free entry, and no organizer page could be confirmed.
    id: 'cur-fall-harvest-market-sugar-beach-2026',
    title: 'Fall Harvest Market at Sugar Beach',
    category: 'food',
    location: 'Toronto',
    venue: 'Sugar Beach, 11 Dockside Dr',
    date: '2026-10-09',
    date_end: '2026-10-12',
    description: 'A free Thanksgiving weekend harvest market on the waterfront: local vendors, fall food and drinks, live music, pumpkin carving, apple bobbing and plenty of photo spots. Friday 5 to 10 pm, Saturday and Sunday noon to 10 pm, Monday noon to 8 pm.',
    cost_tier: 'free',
    source: 'curated'
  },
  {
    // Added Oct 15 2026 while the weekly Talk of the town search sat in its
    // mid-week dead zone (PR #40), so the shelf had real outdoor picks into
    // Halloween. Dates confirmed by two listings: Toronto Tourism's
    // Halloween guide (Sep 26 to Oct 31 2026) and Todocanada (Sep 25 to
    // Nov 1 2026). date_end is the earlier of the two ends, so the card can
    // only ever come down a day early, never stay up a day late. Neither
    // listing's price was confirmed for 2026, so the description names none;
    // it is a timed, ticketed evening walk, hence $$.
    //
    // No image_url and no booking_url: no licence-clean photo of the
    // pumpkins is to hand, and the official site could not be reached to
    // confirm its address. The Places photo of the park is the fallback.
    id: 'cur-pumpkins-after-dark-milton-2026',
    title: 'Pumpkins After Dark at Country Heritage Park',
    category: 'kids',
    location: 'Milton',
    venue: 'Country Heritage Park, 8560 Tremaine Rd',
    date: '2026-09-26',
    date_end: '2026-10-31',
    description: 'An evening walk through thousands of hand-carved, glowing pumpkins on the grounds of Country Heritage Park. Timed tickets, so book a slot before you drive out.',
    cost_tier: '$$',
    source: 'curated'
  }
];

module.exports = EVENTS;
