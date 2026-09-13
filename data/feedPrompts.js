// data/feedPrompts.js — DayHop V2
// The FIXED vocabulary of Google Places text queries the product is allowed
// to buy for its feeds. Shared by routes/browse.js, routes/surprise.js,
// services/candidates.js and services/venueIndex.js so the venue index can
// pre-buy exactly these (× data/venueCells.js) on a schedule, and the live
// feeds read them back for free. Adding a query here adds
// (cells × 1) metered searches per 30-day refresh — see docs/maps-cost.md.

// One synthetic prompt per mode, daypart-free (daypart is applied after the
// fetch, as pure re-ordering — routes/browse.js daypartOrder).
const MODE_PROMPTS = {
  rr: 'peaceful gardens and parks, quiet scenic trails and lookouts, calm waterfront walks and beaches, cozy coffee and brunch spots, farmers markets, museums and galleries, spas and wellness, tea rooms and quiet cafés, relaxed dinner spots and quiet patios, sunset lookouts, dessert cafés, picnic spots, conservation areas',
  adventure: 'ziplining and treetop trekking, aerial adventure parks, rock climbing and indoor climbing, mountain biking trails, kayaking, paddleboarding and rafting, hiking adventures, go-karting, jet ski and watersport rentals, trampoline parks, axe throwing, escape rooms, laser tag, high-energy evening events and shows, night hikes'
};

// ---------- Seasonal periods ----------
// MODE_PROMPTS above is the evergreen spine and stays year-round. These are
// what the feed ASKS GOOGLE FOR in a given part of the year, because ranking
// can only reorder what the query returned: in January the evergreen prompt
// literally asks for beaches and kayaking, so no amount of seasonal scoring
// could put a toboggan hill in the feed — it was never fetched.
//
// Nine periods, not four seasons. Ontario's outdoor year does not move in
// quarters: maple season, blossoms, strawberries, high summer, fair season,
// apple-and-pumpkin, peak colour and the festive run are each a few weeks and
// each wants a different question asked.
//
// COST: every distinct query string is one Places search per cell per 30-day
// refresh (services/venueIndex.js). All nine periods in the vocabulary at once
// would be 18 × 18 = 324 extra rows and would push the index past the 1,000
// free monthly searches. So only the CURRENT and NEXT period are ever in the
// vocabulary — 4 strings on top of the evergreen 2, ~936 rows, ~31/day. The
// next period is included so the feed is already warm on the day it turns.
const PERIODS = [
  {
    id: 'deep-winter', from: '01-01', to: '02-29',
    rr: 'outdoor skating rinks and skating trails, winter light festivals, cozy cafés and tea rooms, museums and art galleries, indoor conservatories and greenhouses, winter markets, hot chocolate spots, indoor swimming pools',
    adventure: 'tobogganing and sledding hills, snow tubing parks, outdoor skating trails, cross-country ski and snowshoe trails, ski hills, indoor climbing gyms, trampoline parks, indoor karting'
  },
  {
    id: 'maple', from: '03-01', to: '04-05',
    rr: 'maple syrup farms and sugar bush pancake houses, indoor conservatories and greenhouses, museums and art galleries, cozy cafés, early spring boardwalks, farmers markets',
    adventure: 'maple sugar bush tours, indoor climbing gyms, trampoline parks, late-season snowshoe and cross-country ski trails, indoor karting, escape rooms'
  },
  {
    id: 'blossom', from: '04-06', to: '05-31',
    rr: 'cherry blossom and tulip gardens, botanical gardens and arboretums, waterfalls at full flow, birdwatching spots and nature reserves, greenhouses, patios reopening, farmers markets',
    adventure: 'hiking trails and escarpment lookouts, mountain biking trails, treetop trekking and aerial adventure parks, rock climbing, kayaking and canoe rentals, go-karting'
  },
  {
    id: 'strawberry', from: '06-01', to: '06-30',
    rr: 'strawberry picking farms, waterfront boardwalks and beaches, botanical gardens, ice cream shops, patios, farmers markets, splash pads and wading pools, sunset lookouts',
    adventure: 'kayaking paddleboarding and canoe rentals, treetop trekking and ziplining, mountain biking, swimming holes, go-karting, jet ski rentals'
  },
  {
    id: 'high-summer', from: '07-01', to: '08-20',
    rr: 'swimming beaches and waterfront boardwalks, splash pads and wading pools, shaded conservation areas, ice cream and gelato, patios, outdoor concerts, botanical gardens, sunset lookouts, provincial parks',
    adventure: 'kayaking paddleboarding and rafting, ziplining and treetop trekking, water parks and wave pools, jet ski and watersport rentals, mountain biking, go-karting'
  },
  {
    id: 'fair-season', from: '08-21', to: '09-15',
    rr: 'sunflower fields, late-season swimming beaches, farmers markets and county fairs, patios, botanical gardens, waterfront walks, ice cream shops',
    adventure: 'ziplining and treetop trekking, mountain biking trails, kayaking and paddling, go-karting, agricultural fairs and midways, hiking trails'
  },
  {
    id: 'apple-pumpkin', from: '09-16', to: '10-15',
    rr: 'apple picking orchards and cider mills, pumpkin patches, farmers markets, fall fairs, scenic drives, botanical gardens, cozy cafés, conservation areas',
    adventure: 'corn mazes and hayrides, treetop trekking, mountain biking in fall colour, hiking trails and escarpment lookouts, haunted attractions, go-karting'
  },
  {
    id: 'peak-colour', from: '10-16', to: '11-10',
    rr: 'fall colour lookouts and scenic drives, conservation areas and ravine trails, pumpkin patches, cozy cafés and bakeries, museums and art galleries, farmers markets',
    adventure: 'hiking trails at peak fall colour, escarpment and gorge lookouts, mountain biking, halloween and haunted attractions, treetop trekking, indoor climbing gyms'
  },
  {
    id: 'festive', from: '11-11', to: '12-31',
    rr: 'holiday markets and christmas villages, festival of lights displays, outdoor skating rinks, museums and art galleries, indoor conservatories and greenhouses, cozy cafés and tea rooms',
    adventure: 'outdoor skating trails, early-season tobogganing hills, indoor climbing gyms, trampoline parks, indoor karting, escape rooms, light trail walks'
  }
];

const mmdd = (ymd) => String(ymd).slice(5, 10);

/** The period a Toronto-local YYYY-MM-DD falls in. Ranges never wrap. */
function periodFor(ymd) {
  const d = mmdd(ymd);
  return PERIODS.find(p => d >= p.from && d <= p.to) || PERIODS[0];
}

function nextPeriod(period) {
  return PERIODS[(PERIODS.indexOf(period) + 1) % PERIODS.length];
}

/** The seasonal query for one mode on one day. */
function seasonalPrompt(mode, ymd) {
  const p = periodFor(ymd);
  return p[mode] || p.rr;
}

/**
 * Exactly the seasonal strings the venue index is allowed to buy right now:
 * this period and the next, both modes. Four strings, deliberately — see the
 * COST note above.
 */
function activeSeasonalPrompts(ymd) {
  const cur = periodFor(ymd);
  const nxt = nextPeriod(cur);
  return [...new Set([cur.rr, cur.adventure, nxt.rr, nxt.adventure])];
}

// Two fixed variants per mode for "Surprise me" (rotated by day).
const SURPRISE_PROMPTS = {
  rr: [
    'hidden gems, surprising beautiful places, buzzworthy new openings, scenic lookouts, unusual gardens, acclaimed restaurants and Michelin-recognized dining, and calm one-of-a-kind spots locals love',
    'secret gardens, quiet scenic viewpoints, remarkable new openings, peaceful waterfronts, charming cafés, celebrated fine dining and viral food spots locals line up for, and under-the-radar calm places locals recommend'
  ],
  adventure: [
    'surprising thrills, unusual adrenaline activities, buzzworthy new attractions, one-of-a-kind adventures and hidden gems locals rave about',
    'unique adventure experiences, exciting new attractions, adrenaline sports, unusual outdoor challenges and thrilling hidden gems locals talk about'
  ]
};

// Always-on dining query (keeps the "New & notable dining" shelf fed in
// both modes), the advisory-day indoor-refuge query, and the corridor
// radar query (routes/browse.js corridorFinds).
const DINING_QUERY = 'highly rated restaurants and cafes';
const INDOOR_REFUGE_QUERY = 'best indoor attractions museums galleries aquariums';
const CORRIDOR_QUERY = 'popular restaurants cafes and attractions';

module.exports = { MODE_PROMPTS, PERIODS, periodFor, nextPeriod, seasonalPrompt, activeSeasonalPrompts, SURPRISE_PROMPTS, DINING_QUERY, INDOOR_REFUGE_QUERY, CORRIDOR_QUERY };
