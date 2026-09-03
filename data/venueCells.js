// data/venueCells.js — DayHop V2
// The geography the venue index covers: one cell per populated area of the
// Ontario belt DayHop serves. Each cell is bought once per query per 30-day
// refresh (services/venueIndex.js), so the bill scales with THIS list, not
// with users. `core` cells are crawled first (the GTA proper — where nearly
// all traffic is); the rest fill in over the daily refresh allowance.
// radiusKm is the search bias radius AND the coverage radius: a request
// point is "covered" when it lies within radiusKm of a cell centre.

const CELLS = [
  { id: 'toronto-downtown', label: 'Downtown Toronto', lat: 43.6532, lng: -79.3832, radiusKm: 8, core: true },
  { id: 'north-york', label: 'North York', lat: 43.7615, lng: -79.4111, radiusKm: 9, core: true },
  { id: 'scarborough', label: 'Scarborough', lat: 43.7731, lng: -79.2578, radiusKm: 10, core: true },
  { id: 'etobicoke', label: 'Etobicoke', lat: 43.6205, lng: -79.5132, radiusKm: 10, core: true },
  { id: 'mississauga', label: 'Mississauga', lat: 43.5890, lng: -79.6441, radiusKm: 11, core: true },
  { id: 'vaughan', label: 'Vaughan', lat: 43.8372, lng: -79.5083, radiusKm: 10, core: true },
  { id: 'richmond-hill', label: 'Richmond Hill', lat: 43.8828, lng: -79.4403, radiusKm: 9, core: true },
  { id: 'markham', label: 'Markham', lat: 43.8561, lng: -79.3370, radiusKm: 10, core: true },
  { id: 'brampton', label: 'Brampton', lat: 43.7315, lng: -79.7624, radiusKm: 11 },
  { id: 'newmarket-aurora', label: 'Newmarket & Aurora', lat: 44.0300, lng: -79.4600, radiusKm: 12 },
  { id: 'pickering-whitby', label: 'Pickering, Ajax & Whitby', lat: 43.8700, lng: -79.0200, radiusKm: 12 },
  { id: 'oshawa', label: 'Oshawa', lat: 43.8971, lng: -78.8658, radiusKm: 11 },
  { id: 'oakville-burlington', label: 'Oakville & Burlington', lat: 43.4000, lng: -79.7500, radiusKm: 13 },
  { id: 'hamilton', label: 'Hamilton', lat: 43.2557, lng: -79.8711, radiusKm: 13 },
  { id: 'niagara-falls', label: 'Niagara Falls & Niagara-on-the-Lake', lat: 43.1200, lng: -79.1000, radiusKm: 16 },
  { id: 'barrie', label: 'Barrie & Lake Simcoe', lat: 44.3894, lng: -79.6903, radiusKm: 16 },
  { id: 'collingwood', label: 'Collingwood & Blue Mountain', lat: 44.5006, lng: -80.2169, radiusKm: 16 },
  { id: 'muskoka', label: 'Muskoka (Bracebridge & Huntsville)', lat: 45.1500, lng: -79.3000, radiusKm: 22 }
];

module.exports = { CELLS };
