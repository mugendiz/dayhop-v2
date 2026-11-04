// data/dreamBoard.js — Dream big: Toronto's winter showcase (admin preview).
//
// Each dream pairs a vision-board aspiration with a real, public way to get
// a taste of it this winter. Built from the research report "Dream big
// vision board features" (reports/, 2026-11-03). Rules:
//   - Every date and price is from the source named in `source`, checked on
//     `verified_on`. Where a price is not posted, `cost` says "Ticketed",
//     never a guessed number.
//   - `status`: 'official' (organizer's own site), 'press' (organizer news
//     release or City of Toronto), 'listing' (third-party listings only,
//     labelled as such on the card), 'tba' (not announced: never shown).
//   - A dream whose dates have passed hides itself (visibleDreams below).
//   - Invite-only things are called invite-only.
//   - Photos: Wikimedia Commons, CC BY / CC0 / public domain, self-hosted in
//     public/img/dream/, credited; captions never imply a venue takes part
//     in something it was not checked for. No photo, no problem: those
//     dreams render as a typographic poster.

const commons = file => `https://commons.wikimedia.org/wiki/${encodeURIComponent(file).replace(/%20/g, '_').replace(/%3A/g, ':')}`;
const CHECKED = '2026-11-03';

const DREAMS = [
  {
    id: 'horse-show', kicker: 'Country estate', emoji: '🐎',
    title: 'Front row at the horse show',
    line: 'Show jumpers, dressage and the Royal Horse Show under one roof, every November.',
    taste: 'The Royal Agricultural Winter Fair runs the Royal Horse Show at Exhibition Place. Book the evening sessions for the full black-and-gold ring.',
    when: { start: '2026-11-06', end: '2026-11-15' }, venue: 'Enercare Centre, Exhibition Place',
    cost: 'Ticketed', status: 'press', verified_on: CHECKED,
    source: 'https://www.royalfair.org/',
    image: '/img/dream/horse.jpg', alt: 'A horse being groomed in the barns at the Royal Agricultural Winter Fair',
    credit: { author: 'Matt MacGillivray', licence: 'CC BY 2.0', url: commons('File:Royal Agricultural Winter Fair.jpg'), place: 'Royal Agricultural Winter Fair, Toronto' },
    link: { label: 'Royal Fair', url: 'https://www.royalfair.org/' }
  },
  {
    id: 'christmas-market', kicker: 'European travel', emoji: '🎄',
    title: 'A Christmas market without the flight',
    line: 'Wooden chalets, mulled cider and lights strung over cobblestones.',
    taste: 'The Distillery Winter Village opens November 12. Entry is free Monday to Wednesday until December 13; closed Christmas Day.',
    when: { start: '2026-11-12', end: '2027-01-03' }, venue: 'Distillery District',
    cost: 'Free Mon to Wed', status: 'press', verified_on: CHECKED,
    source: 'https://www.newswire.ca/news-releases/the-distillery-winter-village-returns-november-12-898310263.html',
    image: '/img/dream/market.jpg', alt: 'Wooden market stalls in the Distillery District at Christmas',
    credit: { author: 'booledozer', licence: 'Public domain', url: commons('File:Christmas festival in the distillery district, 2014 12 03 (5) (15322379433).jpg'), place: 'Distillery District, Toronto, 2014' },
    link: { label: 'Winter Village details', url: 'https://www.newswire.ca/news-releases/the-distillery-winter-village-returns-november-12-898310263.html' }
  },
  {
    id: 'gallery-night', kicker: 'Art collector', emoji: '🖼️',
    title: 'Your first gallery night',
    line: 'Walk the collection after dark, the way collectors do at an opening.',
    taste: 'The AGO is free on the first Wednesday of every month, 6 to 9 p.m. (Nov 4, Dec 2, Jan 6, Feb 3, Mar 3). Tickets are limited, so book online. Ages 14 to 24 get a free annual pass.',
    when: { start: '2026-11-04', end: '2027-03-03', dates: ['2026-11-04', '2026-12-02', '2027-01-06', '2027-02-03', '2027-03-03'] }, venue: 'Art Gallery of Ontario',
    cost: 'Free', status: 'official', verified_on: CHECKED,
    source: 'https://ago.ca/visitor-information/visit-free',
    image: '/img/dream/ago.jpg', alt: 'The entrance of the Art Gallery of Ontario',
    credit: { author: 'Owen Byrne', licence: 'CC BY 2.0', url: commons('File:Art Gallery of Ontario entrance.jpg'), place: 'Art Gallery of Ontario, Toronto' },
    link: { label: 'Free Wednesdays', url: 'https://ago.ca/visitor-information/visit-free' }
  },
  {
    id: 'ballet', kicker: 'Opera-house night', emoji: '🩰',
    title: 'A night at the ballet',
    line: 'Velvet seats, a full orchestra and snow falling on stage.',
    taste: 'The National Ballet of Canada dances The Nutcracker at the Four Seasons Centre, December 5 to 31.',
    when: { start: '2026-12-05', end: '2026-12-31' }, venue: 'Four Seasons Centre',
    cost: 'Ticketed', status: 'official', verified_on: CHECKED,
    source: 'https://national.ballet.ca/',
    image: '/img/dream/ballet.jpg', alt: 'The glass front of the Four Seasons Centre for the Performing Arts in winter',
    credit: { author: 'Luke Walker', licence: 'CC BY 2.0', url: commons('File:Fourseasonscentrefromacrossstreet.jpg'), place: 'Four Seasons Centre, Toronto' },
    link: { label: 'National Ballet', url: 'https://national.ballet.ca/' }
  },
  {
    id: 'boat-show', kicker: 'Dream yacht', emoji: '🛥️',
    title: 'Step aboard a yacht',
    line: 'Cruisers, sailboats and the one you would name after the kids.',
    taste: 'The Toronto International Boat Show fills the Enercare Centre January 16 to 24. Climb aboard; tickets go on sale this November.',
    when: { start: '2027-01-16', end: '2027-01-24' }, venue: 'Enercare Centre',
    cost: 'Ticketed', status: 'official', verified_on: CHECKED,
    source: 'https://www.torontoboatshow.com/',
    image: '/img/dream/boatshow.jpg', alt: 'Personal watercraft and boats on display at the Toronto International Boat Show',
    credit: { author: 'airwaves1', licence: 'CC BY 2.0', url: commons('File:Toronto Boat Show Jan 2009 (3189911412).jpg'), place: 'Toronto International Boat Show, 2009' },
    link: { label: 'Boat Show', url: 'https://www.torontoboatshow.com/' }
  },
  {
    id: 'design-show', kicker: 'Designer interiors', emoji: '🛋️',
    title: "Walk through tomorrow's rooms",
    line: 'Furniture, lighting and kitchens you will be pinning all year.',
    taste: 'IDS Toronto, the Interior Design Show, runs January 21 to 24 at the Metro Toronto Convention Centre. Check which days are open to the public.',
    when: { start: '2027-01-21', end: '2027-01-24' }, venue: 'Metro Toronto Convention Centre',
    cost: 'Ticketed', status: 'official', verified_on: CHECKED,
    source: 'https://interiordesignshow.com/',
    image: null, alt: '',
    link: { label: 'IDS Toronto', url: 'https://interiordesignshow.com/' }
  },
  {
    id: 'winterlicious', kicker: 'Fine dining', emoji: '🍽️',
    title: 'Eat like a critic for $25',
    line: 'White tablecloths, tasting plates and a chef who knows your table.',
    taste: 'Winterlicious runs January 29 to February 11: prix fixe lunch $20 to $55 and dinner $25 to $75 at restaurants across the city. Participants are published closer to the date.',
    when: { start: '2027-01-29', end: '2027-02-11' }, venue: 'Restaurants across Toronto',
    cost: 'Prix fixe $20 to $75', status: 'official', verified_on: CHECKED,
    source: 'https://www.toronto.ca/explore-enjoy/festivals-events/showloveto/dineoutto/licious-participation',
    image: '/img/dream/dining.jpg', alt: 'A set dining room in a Toronto restaurant',
    credit: { author: "Bobak Ha'Eri", licence: 'CC BY 3.0', url: commons("File:2024-0605 Alo restaurant.jpg"), place: 'A Toronto dining room (pictured: Alo)' },
    link: { label: 'Winterlicious', url: 'https://www.toronto.ca/explore-enjoy/festivals-events/showloveto/dineoutto/licious-participation' }
  },
  {
    id: 'supercars', kicker: 'Dream drive', emoji: '🏎️',
    title: 'Sit in the car on your poster',
    line: 'Concept cars, hypercars and the one you would order in every colour.',
    taste: 'The Canadian International AutoShow fills the Metro Toronto Convention Centre February 12 to 21. Sit in the cars you will not buy yet.',
    when: { start: '2027-02-12', end: '2027-02-21' }, venue: 'Metro Toronto Convention Centre',
    cost: 'Ticketed', status: 'official', verified_on: CHECKED,
    source: 'https://autoshow.ca/',
    image: '/img/dream/car.jpg', alt: 'A silver luxury sports sedan on display at the Canadian International AutoShow',
    credit: { author: 'Kalvin Chan', licence: 'CC BY 2.0', url: commons('File:2012 Canadian International AutoShow (6927102017).jpg'), place: 'Canadian International AutoShow, Toronto' },
    link: { label: 'AutoShow', url: 'https://autoshow.ca/' }
  },
  {
    id: 'dream-home', kicker: 'Dream home', emoji: '🏰',
    title: 'Tour the house you would build',
    line: 'Gated stone mansions on acre lots, ten minutes from the 401.',
    taste: 'Walk the Bridle Path on a Sunday, tour a real open house below, then the National Home Show, March 5 to 14 at the Enercare Centre (dates from listings).',
    when: { start: '2027-03-05', end: '2027-03-14' }, venue: 'Enercare Centre',
    cost: 'Free to walk, show ticketed', status: 'listing', verified_on: CHECKED,
    source: 'https://tradefest.io/en/event/national-home-show',
    image: '/img/dream/mansion.jpg', alt: 'A gated stone mansion on the Bridle Path in Toronto',
    credit: { author: 'Michael from Calgary', licence: 'CC BY 2.0', url: commons('File:43 Country Ln (4572697868).jpg'), place: 'The Bridle Path, Toronto' },
    link: { label: 'Map the Bridle Path', url: 'https://www.google.com/maps/search/?api=1&query=The+Bridle+Path+Toronto' }
  },
  {
    id: 'nordic-spa', kicker: 'Spa retreat', emoji: '♨️',
    title: 'A Nordic spa day',
    line: 'Hot pools, a cold plunge and steam rising off the snow.',
    taste: 'Thermëa Spa Village in Whitby: day access $128 Monday to Thursday, $138 Friday to Sunday. Check the age limit before you book.',
    when: null, venue: 'Thermëa Spa Village, Whitby',
    cost: '$128 to $138', status: 'official', verified_on: CHECKED,
    source: 'https://thermea.com/whitby/thermal-experience/the-rates',
    image: null, alt: '',
    link: { label: 'Thermëa rates', url: 'https://thermea.com/whitby/thermal-experience/the-rates' }
  },
  {
    id: 'afternoon-tea', kicker: 'Grand hotel', emoji: '🫖',
    title: 'High tea at the Royal York',
    line: 'Chandeliers, tiered stands and the city\'s grand old railway hotel.',
    taste: 'The Fairmont Royal York serves afternoon tea on weekends, by reservation. Check this season\'s times and prices when you book.',
    when: null, venue: 'Fairmont Royal York',
    cost: 'Ticketed', status: 'official', verified_on: CHECKED,
    source: 'https://www.fairmont.com/en/hotels/toronto/fairmont-royal-york/dining/afternoon-tea.html',
    image: '/img/dream/tea.jpg', alt: 'A chandeliered ballroom at the Fairmont Royal York',
    credit: { author: 'Muhammad', licence: 'CC BY 2.0', url: commons('File:The Royal York.jpg'), place: 'Fairmont Royal York, Toronto' },
    link: { label: 'Afternoon tea', url: 'https://www.fairmont.com/en/hotels/toronto/fairmont-royal-york/dining/afternoon-tea.html' }
  },
  {
    id: 'helicopter', kicker: 'Private aviation', emoji: '🚁',
    title: 'See Toronto from a helicopter',
    line: 'The skyline, the islands and the lake, all in one sweep.',
    taste: 'Shared sightseeing flights leave from near Billy Bishop airport, weather permitting. Prices vary by operator; compare on the operator\'s own site (we found them on listings only).',
    when: null, venue: 'Near Billy Bishop airport',
    cost: 'Ticketed', status: 'listing', verified_on: CHECKED,
    source: 'https://www.tripster.com/detail/toronto-heli-tours',
    image: '/img/dream/skyline.jpg', alt: 'The Toronto skyline at sunset over the lake',
    credit: { author: 'Emiliano Carchia', licence: 'CC BY 3.0', url: commons('File:Orange Sunset (175581197).jpeg'), place: 'Toronto skyline at sunset' },
    link: { label: 'Tour listings', url: 'https://www.tripster.com/detail/toronto-heli-tours' }
  },
  {
    id: 'invite-only', kicker: 'Dream night', emoji: '🥂',
    title: 'Galas are invite-only. Castle nights are not.',
    line: 'Black tie, a guest list, a castle lit up for the evening.',
    taste: 'The real galas are invite-only. Casa Loma\'s holiday evenings are public; we will show them once this year\'s dates are posted.',
    when: null, venue: 'Casa Loma',
    cost: 'Ticketed', status: 'tba', verified_on: CHECKED,
    source: 'https://casaloma.ca/',
    image: '/img/dream/castle.jpg', alt: 'Casa Loma, a castle in midtown Toronto',
    credit: { author: 'Guilhem Vellut', licence: 'CC BY 2.0', url: commons('File:Casa Loma @ Toronto (5106240461).jpg'), place: 'Casa Loma, Toronto' },
    link: { label: 'Casa Loma', url: 'https://casaloma.ca/' }
  }
];

const STATUS_LABEL = { official: 'Official dates', press: 'From the organizer', listing: 'From listings', tba: 'Not announced' };

/** Shown dreams at `today` (YYYY-MM-DD): no 'tba', nothing already over;
 *  dated dreams first by their next date, then the year-round ones. Pure. */
function visibleDreams(today, list = DREAMS) {
  const next = d => {
    if (!d.when) return '9999-12-31';
    const upcoming = (d.when.dates || [d.when.start]).find(x => x >= today);
    return upcoming || (d.when.end >= today ? today : null);
  };
  return list
    .filter(d => d.status !== 'tba' && (!d.when || d.when.end >= today))
    .map(d => ({ d, n: next(d) }))
    .filter(x => x.n)
    .sort((a, b) => a.n.localeCompare(b.n))
    .map(x => Object.assign({}, x.d, { next_date: x.n === '9999-12-31' ? null : x.n }));
}

module.exports = DREAMS;
module.exports.DREAMS = DREAMS;
module.exports.visibleDreams = visibleDreams;
module.exports.STATUS_LABEL = STATUS_LABEL;
