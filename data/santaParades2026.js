// data/santaParades2026.js — GTA Santa Claus parades, 2026 season.
//
// Every row was checked against the organizer's OWN page (town, city or the
// parade's official site) on the date in `verified_on`. Aggregator listings
// (todocanada, childslife, ontariofestivals, fandom) disagreed with each
// other on Ajax, Pickering and Milton in Nov 2026, so none of them is a
// source here. A field the official page did not state is null and the page
// says "not posted yet"; never fill one from a listing.
//
// `lat`/`lng` mark the start area for the map, placed by hand from the
// official start point. They are approximate on purpose (the page says so).
//
// Towns with no 2026 date on their own site yet are in NOT_POSTED. Re-check
// them, and the null times, before each weekend; update verified_on when you
// do.

const PARADES = [
  {
    slug: 'oakville', town: 'Oakville', name: 'Oakville Santa Claus Parade',
    date: '2026-11-14', time: null,
    where: 'Downtown Oakville',
    lat: 43.4472, lng: -79.6668,
    official_url: 'https://www.oakville.ca/community-events/events/town-of-oakville-events/santa-claus-parade/',
    verified_on: '2026-11-03',
    note: 'Theme: North Pole Sweets and Treats. Rain or shine.'
  },
  {
    slug: 'brampton', town: 'Brampton', name: 'Brampton Santa Claus Parade',
    date: '2026-11-21', time: '5 p.m.',
    where: 'Starts at Bramalea Road and Central Park Drive',
    lat: 43.7225, lng: -79.7195,
    official_url: 'https://www.bramptonsantaclausparade.com/',
    verified_on: '2026-11-03',
    note: 'An evening parade.'
  },
  {
    slug: 'mississauga', town: 'Mississauga', name: 'Mississauga Santa Claus Parade',
    date: '2026-11-21', time: '6 p.m.',
    where: 'Downtown Mississauga, through Celebration Square (300 City Centre Dr)',
    lat: 43.5890, lng: -79.6441,
    official_url: 'https://www.mississauga.ca/arts-and-culture/events/mississauga-santa-claus-parade-2026/',
    verified_on: '2026-11-03',
    note: 'Free activities at Celebration Square from 4 p.m., including a DJ skate party. Santa lights the tree as he passes.'
  },
  {
    slug: 'newmarket', town: 'Newmarket', name: 'Newmarket Santa Claus Parade',
    date: '2026-11-21', time: '11 a.m. to 1 p.m.',
    where: 'Starts at Eagle Street and Lorne Avenue, east on Eagle to Main Street',
    lat: 44.0487, lng: -79.4712,
    official_url: 'https://www.newmarket.ca/community-and-culture/events-meetings/2026-11-21-santa-claus-parade',
    verified_on: '2026-11-03',
    note: 'Donations collected along the route go to the Newmarket Food Pantry.'
  },
  {
    slug: 'aurora', town: 'Aurora', name: 'Santa Under the Stars Parade',
    date: '2026-11-21', time: '6 p.m. to 8 p.m.',
    where: 'Southbound on Yonge Street from Orchard Heights Boulevard',
    lat: 44.0083, lng: -79.4697,
    official_url: 'https://www.aurora.ca/recreation-arts-and-culture/specialevents/santa-under-the-stars-parade/',
    verified_on: '2026-11-03',
    note: 'Yonge Street closes to traffic from 3 p.m. to 8 p.m.'
  },
  {
    slug: 'toronto', town: 'Toronto', name: 'The Original Santa Claus Parade',
    date: '2026-11-22', time: null,
    where: 'Downtown Toronto (2026 route not posted yet)',
    lat: 43.6629, lng: -79.3957,
    official_url: 'https://www.thesantaclausparade.com/',
    verified_on: '2026-11-03',
    note: 'The 122nd parade. It is also live on Citytv and Citytv+.'
  },
  {
    slug: 'markham', town: 'Markham', name: 'Markham Santa Claus Parade',
    date: '2026-11-28', time: '11 a.m. to 1 p.m.',
    where: 'Main Street Markham, from Highway 7 north to 16th Avenue',
    lat: 43.8695, lng: -79.2637,
    official_url: 'https://www.markham.ca/about-city-markham/events/attend-city-event/markham-santa-claus-parade',
    verified_on: '2026-11-03',
    note: 'The 52nd annual parade. It begins at Highway 7.'
  },
  {
    slug: 'pickering', town: 'Pickering', name: 'Pickering Santa Claus Parade',
    date: '2026-11-28', time: '10 a.m.',
    where: 'Temporary 2026 route on Whites Road',
    lat: 43.8370, lng: -79.1040,
    official_url: 'https://www.pickering.ca/parks-recreation-culture/festivals-and-events/santa-claus-parade/',
    verified_on: '2026-11-03',
    note: 'The route moved this year because of City Centre construction. No spectators on the bridge.'
  },
  {
    slug: 'ajax', town: 'Ajax', name: "Santa's Spectacle of Lights",
    date: '2026-11-28', time: '6 p.m. to 7:30 p.m.',
    where: 'Bayly Street and Mackenzie Avenue, east on Bayly, north on Harwood Avenue South to Town Hall',
    lat: 43.8420, lng: -79.0330,
    official_url: 'https://ajax.ca/event/santas-spectacle-of-lights-town-of-ajax-santa-claus-parade/',
    verified_on: '2026-11-03',
    note: 'Tree lighting and an after party at Town Hall (65 Harwood Ave S) right after.'
  },
  {
    slug: 'vaughan', town: 'Vaughan', name: 'Santafest Parade',
    date: '2026-11-29', time: '1:30 p.m.',
    where: 'Springside Road and Melville Avenue to Vaughan City Hall',
    lat: 43.8550, lng: -79.5110,
    official_url: 'https://www.vaughan.ca/residential/recreation-programs-and-fitness/events/festive-celebrations/santafest-parade',
    verified_on: '2026-11-03',
    note: null
  },
  {
    slug: 'stouffville', town: 'Whitchurch-Stouffville', name: 'Stouffville Santa Claus Parade',
    date: '2026-12-05', time: '6 p.m.',
    where: 'Main Street, from Ninth Line to Park Drive',
    lat: 43.9707, lng: -79.2490,
    official_url: 'https://www.townofws.ca/play/events/santa-claus-parade/',
    verified_on: '2026-11-03',
    note: 'A parade of lights down the historic downtown.'
  },
  {
    slug: 'burlington', town: 'Burlington', name: 'Burlington Santa Claus Parade',
    date: '2026-12-06', time: '2 p.m. to 4 p.m.',
    where: 'Downtown Burlington',
    lat: 43.3255, lng: -79.7990,
    official_url: 'https://www.burlington.ca/en/news/festivals-and-events/santa-claus-parade.aspx',
    verified_on: '2026-11-03',
    note: null
  }
];

// Checked 2026-11-03: no 2026 date on the town's own site yet.
const NOT_POSTED = ['Richmond Hill', 'Oshawa', 'Whitby', 'Milton'];

module.exports = { PARADES, NOT_POSTED };
