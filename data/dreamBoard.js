// data/dreamBoard.js — Dream big (beta): the vision-board cards that sit
// beside the real open houses (services/dreamHomes.js) on the homepage
// rail and in the /dream scroll.
//
// A dream card is an aspiration plus a real, public way to get a taste of
// it today. Nothing here invents an event or a guest list: invite-only
// parties stay invite-only, and the card says so. Photos are Wikimedia
// Commons, self-hosted under public/img/dream/ (fetched 2026-11-03), each
// with its credit and licence; captions name the neighbourhood, never a
// house number. Facts checked 2026-11-03:
//   - Canadian International AutoShow: every February at the Metro
//     Toronto Convention Centre (2027 dates listed by ticket sites as Feb
//     12 to 21, not yet on autoshow.ca, so the card says February only).
//   - Casa Loma sells tickets to evening events separately from daytime
//     admission (casaloma.ca: Holiday Lights in winter, Summer Series).
//   - Harbourfront's waterfront along Queen's Quay is a public walkway.

const commons = file => `https://commons.wikimedia.org/wiki/${encodeURIComponent(file).replace(/%20/g, '_').replace(/%3A/g, ':')}`;

module.exports = [
  {
    id: 'mansions', kicker: 'Dream home', emoji: '🏰',
    title: 'Life on the Bridle Path',
    line: "Gated stone mansions on acre lots, ten minutes from the 401.",
    taste: "The homes are private, the streets are not. Walk or drive the Bridle Path on a Sunday, then tour a real open house below.",
    image: '/img/dream/mansion.jpg',
    alt: 'A gated stone mansion on the Bridle Path in Toronto',
    credit: { author: 'Michael from Calgary', licence: 'CC BY 2.0', url: commons('File:43 Country Ln (4572697868).jpg'), place: 'The Bridle Path, Toronto' },
    link: { label: 'Map it', url: 'https://www.google.com/maps/search/?api=1&query=The+Bridle+Path+Toronto' }
  },
  {
    id: 'supercars', kicker: 'Dream drive', emoji: '🏎️',
    title: 'Supercars up close',
    line: 'Concept cars, hypercars and the one you would order in every colour.',
    taste: 'The Canadian International AutoShow fills the Metro Toronto Convention Centre every February. Sit in the cars you will not buy yet.',
    image: '/img/dream/car.jpg',
    alt: 'A silver luxury sports sedan on display at the Canadian International AutoShow',
    credit: { author: 'Kalvin Chan', licence: 'CC BY 2.0', url: commons('File:2012 Canadian International AutoShow (6927102017).jpg'), place: 'Canadian International AutoShow, Toronto' },
    link: { label: 'AutoShow site', url: 'https://autoshow.ca/' }
  },
  {
    id: 'yachts', kicker: 'Dream weekend', emoji: '🛥️',
    title: 'Your own slip at the marina',
    line: 'Morning coffee on the deck, the skyline behind you, the lake ahead.',
    taste: "Walk the docks for free: Harbourfront's boardwalk along Queen's Quay runs past the boats all year, and the sunset is the same one the owners get.",
    image: '/img/dream/yacht.jpg',
    alt: 'Yachts and sailboats moored at Ontario Place Marina in Toronto',
    credit: { author: 'Raysonho', licence: 'CC0', url: commons('File:OntarioPlaceMarina.JPG'), place: 'Ontario Place Marina, Toronto, 2011' },
    link: { label: 'Map it', url: 'https://www.google.com/maps/search/?api=1&query=Harbourfront+Centre+Toronto' }
  },
  {
    id: 'invite-only', kicker: 'Dream night', emoji: '🥂',
    title: 'Invite-only nights',
    line: 'Black tie, a guest list, a castle lit up for the evening.',
    taste: 'The real ones are invite-only, and we will not pretend otherwise. Get a taste: Casa Loma, Toronto\'s castle, sells tickets to some of its evening events.',
    image: '/img/dream/castle.jpg',
    alt: 'Casa Loma, a castle in midtown Toronto',
    credit: { author: 'Guilhem Vellut', licence: 'CC BY 2.0', url: commons('File:Casa Loma @ Toronto (5106240461).jpg'), place: 'Casa Loma, Toronto' },
    link: { label: 'Casa Loma events', url: 'https://casaloma.ca/' }
  }
];
