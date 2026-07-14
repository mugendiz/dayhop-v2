// data/themes.js — DayHop V2
// Static theme-expansion map: turns a user's prompt into broader search
// intent without an extra LLM call. "swimming" should pull public pools,
// but also beaches, splash pads, lakes, waterparks and paddling rentals —
// the whole neighbourhood of the request, not just its literal words.
//
// Each theme:
//   triggers      — prompt words/stems that activate the theme
//   placesQueries — extra Google Places text searches to fan out
//   categories    — idea categories this theme maps to
//   tags          — shared vocabulary matched against curated catalog tags
//                   and used by the relevance scorer

const THEMES = [
  {
    theme: 'water',
    triggers: ['swim', 'swimming', 'pool', 'splash', 'beach', 'beaches', 'lake', 'lakes',
      'water', 'waterpark', 'waterfront', 'paddle', 'paddling', 'kayak', 'canoe',
      'paddleboard', 'wading', 'lifeguard', 'sandcastle'],
    placesQueries: ['public swimming pool', 'beach', 'splash pad',
      'waterpark', 'kayak canoe paddleboard rental', 'lakefront park'],
    categories: ['water', 'kids', 'adventures', 'cruises'],
    tags: ['water', 'swim', 'pool', 'beach', 'splash', 'lake', 'paddle', 'kayak',
      'canoe', 'paddleboard', 'waterpark', 'waterfront', 'slides', 'wave pool']
  },
  {
    theme: 'adrenaline',
    triggers: ['adventure', 'adventurous', 'adrenaline', 'thrill', 'thrilling', 'exciting',
      'extreme', 'zipline', 'ziplining', 'climb', 'climbing', 'bouldering', 'karting',
      'go-kart', 'go kart', 'kart', 'skydive', 'skydiving', 'helicopter', 'daring',
      'mountain bike', 'mountain biking', 'bmx', 'axe', 'rafting', 'bungee', 'coaster',
      'rollercoaster', 'roller coaster', 'trampoline', 'escape room', 'ski', 'skiing',
      'snowboard', 'tubing', 'atv', 'paraglide', 'paragliding', 'parasail'],
    placesQueries: ['zipline aerial adventure park', 'rock climbing bouldering gym',
      'go kart racing track', 'axe throwing escape room', 'mountain bike park',
      'trampoline park'],
    categories: ['adventures'],
    tags: ['adrenaline', 'thrill', 'zipline', 'climbing', 'bouldering', 'karting',
      'helicopter', 'skydiving', 'treetop', 'ropes course', 'trampoline',
      'mountain bike', 'axe throwing', 'escape room', 'coaster', 'ski', 'snowboard',
      'tubing', 'racing', 'vr']
  },
  {
    theme: 'kids-outdoor',
    triggers: ['kids', 'kid', 'toddler', 'children', 'child', 'family', 'playground',
      'park', 'stroller', 'year-old', 'daughter', 'son'],
    placesQueries: ['playground park', 'petting zoo farm', 'conservation area family'],
    categories: ['kids', 'water'],
    tags: ['kids', 'playground', 'toddler', 'family', 'farm', 'animals', 'park', 'splash']
  },
  {
    theme: 'kids-indoor',
    triggers: ['indoor', 'rainy', 'rain', 'cold', 'winter', 'playplace', 'museum',
      'aquarium', 'arcade', 'bowling'],
    placesQueries: ['indoor playground kids', 'family arcade bowling', 'interactive museum'],
    categories: ['kids', 'culture'],
    tags: ['indoor', 'museum', 'aquarium', 'arcade', 'bowling', 'science', 'play centre',
      'trampoline', 'rainy day']
  },
  {
    theme: 'patios',
    triggers: ['patio', 'patios', 'rooftop', 'beer', 'drinks', 'brunch', 'brewery',
      'cocktail', 'winery', 'pub'],
    placesQueries: ['rooftop patio restaurant', 'craft brewery patio', 'waterfront patio'],
    categories: ['patios', 'food'],
    tags: ['patio', 'rooftop', 'beer', 'brewery', 'drinks', 'brunch', 'winery', 'pub']
  },
  {
    theme: 'food',
    triggers: ['eat', 'eating', 'food', 'lunch', 'dinner', 'restaurant', 'snack', 'dessert',
      'ice cream', 'market', 'foodie', 'hungry', 'bakery'],
    placesQueries: ['family friendly restaurant', 'food market hall', 'ice cream dessert shop'],
    categories: ['food', 'patios'],
    tags: ['food', 'restaurant', 'market', 'dessert', 'ice cream', 'bakery', 'lunch', 'dinner']
  },
  {
    theme: 'culture',
    triggers: ['museum', 'art', 'gallery', 'history', 'historic', 'culture', 'cultural',
      'theatre', 'theater', 'show', 'exhibit', 'castle'],
    placesQueries: ['museum', 'art gallery', 'historic site attraction'],
    categories: ['culture'],
    tags: ['museum', 'art', 'gallery', 'history', 'theatre', 'exhibit', 'castle', 'heritage']
  },
  {
    theme: 'nature',
    triggers: ['hike', 'hiking', 'trail', 'nature', 'forest', 'walk', 'walking', 'bike',
      'biking', 'cycling', 'garden', 'gardens', 'picnic', 'outdoors', 'birdwatching'],
    placesQueries: ['hiking trail conservation area', 'botanical garden', 'scenic lookout park'],
    categories: ['general', 'kids', 'adventures'],
    tags: ['hike', 'trail', 'nature', 'forest', 'garden', 'picnic', 'lookout', 'bike', 'bluffs']
  },
  {
    theme: 'animals',
    triggers: ['zoo', 'animal', 'animals', 'farm', 'aquarium', 'safari', 'wildlife',
      'horse', 'pony', 'butterfly'],
    placesQueries: ['zoo wildlife park', 'petting farm', 'aquarium'],
    categories: ['kids', 'general'],
    tags: ['zoo', 'animals', 'farm', 'aquarium', 'safari', 'wildlife', 'butterfly', 'pony']
  },
  {
    theme: 'worldcup',
    triggers: ['world cup', 'worldcup', 'soccer', 'football', 'match', 'game', 'watch party',
      'fifa', 'sports bar'],
    placesQueries: ['world cup watch party sports bar', 'soccer viewing party big screen'],
    categories: ['worldcup', 'patios'],
    tags: ['world cup', 'soccer', 'watch party', 'big screen', 'fan fest', 'sports bar']
  },
  {
    theme: 'cruises',
    triggers: ['cruise', 'boat', 'sail', 'sailing', 'harbour', 'harbor', 'ferry', 'island'],
    placesQueries: ['harbour boat cruise', 'ferry island'],
    categories: ['cruises', 'water'],
    tags: ['cruise', 'boat', 'sail', 'ferry', 'island', 'harbour', 'lake ontario']
  },
  {
    theme: 'date-night',
    triggers: ['date', 'romantic', 'anniversary', 'couples', 'evening out', 'night out'],
    placesQueries: ['romantic restaurant view', 'evening entertainment venue'],
    categories: ['food', 'patios', 'culture'],
    tags: ['romantic', 'date', 'evening', 'view', 'live music', 'couples']
  }
];

/**
 * Match a free-text prompt against theme triggers. Returns up to `max`
 * themes ordered by how many triggers hit (ties keep THEMES order, so the
 * more specific activity themes listed first win over generic ones).
 */
function matchThemes(prompt, max = 2) {
  const text = ` ${String(prompt || '').toLowerCase()} `;
  const scored = [];
  for (const theme of THEMES) {
    let hits = 0;
    for (const trigger of theme.triggers) {
      // Word-boundary-ish match so "swim" hits "swimming" but "art" not "party".
      const re = new RegExp(`[^a-z]${escapeRegExp(trigger)}`, 'i');
      if (re.test(text)) hits++;
    }
    if (hits > 0) scored.push({ theme, hits });
  }
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, max).map(s => s.theme);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { THEMES, matchThemes };
