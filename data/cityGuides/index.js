// data/cityGuides/index.js — DayHop V2
// Registry for the paid city nature guides. Content lives in one authored
// file per guide (real, stable places only — descriptions avoid volatile
// claims like exact fees and gate hours; every entry links to Google Maps
// as the live source of truth).
//
//   slug       URL/API id, also the Stripe metadata key
//   title      product name as sold
//   subtitle   one-line promise, shown on the page and the PDF cover
//   city_keys  lowercase substrings matched against the browsed city for
//              the feed promo card (first live match wins, order matters)
//   status     'live' = sellable now; 'coming_soon' = listed, not sellable
//              (US titles ship only after manual verification of every spot)
//   content    lazy require so the registry stays cheap to load

const GUIDES = [
  {
    slug: 'markham',
    title: 'Markham Nature Guide',
    subtitle: 'Rouge Valley trails, mill ponds, and quiet forest corners of Markham & Unionville.',
    city_keys: ['markham', 'unionville', 'milliken', 'thornhill'],
    status: 'live',
    content: () => require('./markham')
  },
  {
    slug: 'richmond-hill',
    title: 'Richmond Hill Nature Guide',
    subtitle: 'Kettle lakes, the Oak Ridges Moraine, and the green seams of Richmond Hill.',
    city_keys: ['richmond hill', 'oak ridges', 'l4c', 'l4e', 'l4s'],
    status: 'live',
    content: () => require('./richmond-hill')
  },
  {
    slug: 'newmarket',
    title: 'Newmarket Nature Guide',
    subtitle: 'Fairy Lake, the Nokiidaa Trail, and the conservation lands of Newmarket & Aurora.',
    city_keys: ['newmarket', 'aurora', 'east gwillimbury', 'holland landing'],
    status: 'live',
    content: () => require('./newmarket')
  },
  {
    slug: 'toronto',
    title: 'Toronto City Nature Spots',
    subtitle: 'Ravines, bluffs, islands, and urban wilderness inside Canada\'s biggest city.',
    city_keys: ['toronto', 'north york', 'scarborough', 'etobicoke', 'east york', 'downtown', 'gta'],
    status: 'live',
    content: () => require('./toronto')
  },
  {
    slug: 'hamilton',
    title: 'Hamilton Nature Guide',
    subtitle: 'The waterfall capital: Niagara Escarpment gorges, Cootes Paradise, and 100+ falls.',
    city_keys: ['hamilton', 'dundas', 'ancaster', 'waterdown', 'stoney creek', 'burlington'],
    status: 'live',
    content: () => require('./hamilton')
  },
  {
    slug: 'lake-simcoe',
    title: 'Lake Simcoe Nature Guide',
    subtitle: 'Beaches, provincial parks, and shoreline trails around Ontario\'s great near-north lake.',
    city_keys: ['simcoe', 'barrie', 'innisfil', 'georgina', 'keswick', 'jackson', 'bradford', 'orillia', 'beaverton'],
    status: 'live',
    content: () => require('./lake-simcoe')
  },
  {
    slug: 'staten-island',
    title: 'Staten Island Nature Guide',
    subtitle: 'The greenest borough: forests, wetlands, and shoreline beyond the ferry.',
    city_keys: ['staten island'],
    status: 'coming_soon',
    content: () => { throw new Error('staten-island guide is not verified yet'); }
  },
  {
    slug: 'silicon-valley',
    title: 'Silicon Valley Nature Guide',
    subtitle: 'Redwood canyons, baylands, and summit trails between San Jose and the sea.',
    city_keys: ['san jose', 'palo alto', 'mountain view', 'cupertino', 'sunnyvale'],
    status: 'coming_soon',
    content: () => { throw new Error('silicon-valley guide is not verified yet'); }
  }
];

module.exports = { GUIDES };
