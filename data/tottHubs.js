// data/tottHubs.js — DayHop V2 ("Talk of the town" shelf)
// The regions "Talk of the town" picks are curated for. A browse request maps
// to the nearest hub within HUB_SNAP_KM of the user's point (or the picked
// city's geocoded centroid); picks are stored per hub. Each hub carries the
// vocabulary the weekly picker needs: what "local" means there and which
// standout towns sit inside the ~2-hour drive belt.
//
// Toronto is always refreshed weekly; every other hub refreshes only once a
// real browse has come from it (services/talkOfTown.js), so the picker's
// cost scales with actual usage, not with the length of this list.

const HUBS = [
  {
    id: 'toronto', name: 'Toronto & the GTA', lat: 43.6532, lng: -79.3832,
    local: 'Toronto, Mississauga, Brampton, Vaughan, Markham, Richmond Hill, Oakville, Burlington, Pickering, Ajax, Whitby, Oshawa',
    far: 'Niagara-on-the-Lake, Niagara Falls, Hamilton, Kitchener-Waterloo, Guelph, Barrie, Collingwood, Peterborough, Prince Edward County, Muskoka'
  },
  {
    id: 'hamilton-niagara', name: 'Hamilton & Niagara', lat: 43.2557, lng: -79.8711,
    local: 'Hamilton, Burlington, Grimsby, St. Catharines, Niagara Falls, Niagara-on-the-Lake, Welland',
    far: 'Toronto, Kitchener-Waterloo, Guelph, Brantford, Fort Erie, Oakville'
  },
  {
    id: 'kitchener-waterloo', name: 'Kitchener-Waterloo & Guelph', lat: 43.4516, lng: -80.4925,
    local: 'Kitchener, Waterloo, Cambridge, Guelph, Elora, Fergus, Stratford',
    far: 'Toronto, Hamilton, London, Brantford, Orangeville, Collingwood'
  },
  {
    id: 'london', name: 'London & Southwestern Ontario', lat: 42.9849, lng: -81.2453,
    local: 'London, St. Thomas, Woodstock, Strathroy, Port Stanley, Grand Bend',
    far: 'Kitchener-Waterloo, Stratford, Sarnia, Windsor, Hamilton, Bayfield'
  },
  {
    id: 'barrie-muskoka', name: 'Barrie, Simcoe & Muskoka', lat: 44.3894, lng: -79.6903,
    local: 'Barrie, Orillia, Innisfil, Midland, Collingwood, Wasaga Beach, Gravenhurst, Bracebridge',
    far: 'Toronto, Huntsville, Algonquin Highway 60, Newmarket, Owen Sound'
  },
  {
    id: 'peterborough', name: 'Peterborough & the Kawarthas', lat: 44.3091, lng: -78.3197,
    local: 'Peterborough, Lakefield, Lindsay, Bobcaygeon, Cobourg, Port Hope',
    far: 'Toronto, Oshawa, Belleville, Prince Edward County, Haliburton'
  },
  {
    id: 'kingston', name: 'Kingston & Quinte', lat: 44.2312, lng: -76.4860,
    local: 'Kingston, Gananoque, Belleville, Picton, Prince Edward County, Napanee',
    far: 'Ottawa, Brockville, Peterborough, Cobourg, Thousand Islands'
  },
  {
    id: 'ottawa', name: 'Ottawa & the Valley', lat: 45.4215, lng: -75.6972,
    local: 'Ottawa, Gatineau, Kanata, Orléans, Manotick, Almonte, Carleton Place',
    far: 'Kingston, Brockville, Perth, Pembroke, Montebello, Mont-Tremblant'
  },
  {
    id: 'windsor', name: 'Windsor-Essex', lat: 42.3149, lng: -83.0364,
    local: 'Windsor, LaSalle, Tecumseh, Amherstburg, Kingsville, Leamington',
    far: 'London, Sarnia, Chatham-Kent, Point Pelee, Pelee Island'
  },
  {
    id: 'sudbury', name: 'Sudbury & North Bay', lat: 46.4917, lng: -80.9930,
    local: 'Sudbury, North Bay, Espanola, Killarney',
    far: 'Manitoulin Island, Parry Sound, Temagami, Sault Ste. Marie'
  }
];

// A request snaps to a hub only when the user is genuinely inside its orbit.
const HUB_SNAP_KM = 120;
// The furthest a pick may sit from its hub (~2 hours' drive).
const HUB_REACH_KM = 180;
// "Far" picks (beyond this from the user) are capped at 2 of 5.
const FAR_KM = 60;

function haversineKm(a, b) {
  const R = 6371;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest hub within HUB_SNAP_KM of a point, or null. */
function hubFor(point) {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null;
  let best = null;
  let bestKm = Infinity;
  for (const h of HUBS) {
    const km = haversineKm(point, h);
    if (km < bestKm) { best = h; bestKm = km; }
  }
  return best && bestKm <= HUB_SNAP_KM ? best : null;
}

function hubById(id) {
  return HUBS.find(h => h.id === id) || null;
}

module.exports = { HUBS, HUB_SNAP_KM, HUB_REACH_KM, FAR_KM, hubFor, hubById, haversineKm };
