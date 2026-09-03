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

module.exports = { MODE_PROMPTS, SURPRISE_PROMPTS, DINING_QUERY, INDOOR_REFUGE_QUERY, CORRIDOR_QUERY };
