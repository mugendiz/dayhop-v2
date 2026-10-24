// test/fixtures/playgroundQuery.js — the planner query that failed on
// 2026-10-24, rebuilt as a candidate pool so the ranking can be replayed
// without the live sources.
//
// Prompt: "The most adventurous playgrounds near me to go with a 4 year old",
// near-you in Richmond Hill, Adventure mode on. The live feed served cafes,
// climbing gyms, go-karting, a night market, horseback riding, Treetop
// Trekking and five library programs, with one tile that matched.
//
// The offenders below carry the names from that feed. The playgrounds and
// indoor play centres are what the same search also returns (the prompt
// search and the "playground park" / "indoor playground kids" theme queries);
// their names are placeholders, not claims about real venues. Coordinates are
// offsets from the Richmond Hill origin, so distances are realistic.

const PROMPT = 'The most adventurous playgrounds near me to go with a 4 year old';
const ORIGIN = { lat: 43.8828, lng: -79.4403 };

// km east/north of the origin → lat/lng (1° lat ≈ 111 km, 1° lng ≈ 80 km here).
const at = (eastKm, northKm) => ({ lat: ORIGIN.lat + northKm / 111, lng: ORIGIN.lng + eastKm / 80 });

function pool() {
  const P = [];
  const place = (o) => P.push(Object.assign({ source: 'google_places', rating_count: 250 }, o));

  // ---- Cafes and lounges (arrived through the always-on dining query) ----
  [
    ['Imperial Cafe', 1.2, 0.8], ['Covernotes Coffee House', 0.5, -1.4], ['Pistachio Blend', 2.6, 1.1],
    ['Roses Cafe Senso', -1.8, 2.2], ['Tangy Cafe', 3.1, -0.6], ['Possible Cafe', -2.4, -1.9]
  ].forEach(([title, e, n], i) => place(Object.assign({
    id: `gp-cafe-${i}`, title, category: 'food', theme_hit: true,
    description: 'Cozy cafe with specialty coffee, pastries and a lounge area.',
    types: ['cafe', 'coffee_shop'], rating: 4.6, rating_count: 320, cost_tier: '$', outdoor_seating: true
  }, at(e, n))));

  // ---- Climbing gyms ----
  place(Object.assign({ id: 'gp-hub-climbing', title: 'Hub Climbing Markham', category: 'adventures',
    description: 'Indoor bouldering and rope climbing gym with youth programs.', types: ['gym'], rating: 4.7, rating_count: 900 }, at(9, 1)));
  place(Object.assign({ id: 'gp-rockhaus', title: 'RockHaus Climbing', category: 'adventures',
    description: 'Bouldering gym, climb all day.', types: ['gym'], rating: 4.6, rating_count: 400 }, at(-11, -2)));
  place(Object.assign({ id: 'gp-hogtown', title: 'Hogtown Boulders', category: 'adventures',
    description: 'Bouldering gym with a training area.', types: ['gym'], rating: 4.8, rating_count: 300 }, at(-3, -18)));

  // ---- Go-karting and RC racing ----
  place(Object.assign({ id: 'gp-drift-zone', title: 'Drift Zone Aurora', category: 'adventures',
    description: 'Indoor go-kart racing and drift karts.', types: ['amusement_center'], rating: 4.5, rating_count: 600 }, at(2, 13)));
  place(Object.assign({ id: 'gp-rc-paradise', title: 'RC Paradise', category: 'adventures',
    description: 'RC car racing track and hobby shop.', types: ['store'], rating: 4.7, rating_count: 150 }, at(5, 8)));

  // ---- Events and experiences with no coordinates ----
  P.push({ id: 'cur-night-market', source: 'curated', title: 'Toronto Night Market', category: 'food',
    description: 'Street food stalls and night market vendors after dark.', venue: 'Downtown Toronto', location: 'Toronto',
    date: '2026-10-30', lat: null, lng: null, cost_tier: null });
  P.push({ id: 'vt-horseback', source: 'viator', title: 'Guided Horseback Trail Ride', category: 'adventures',
    description: 'Guided horseback riding through forest trails north of the city.', rating: 4.8, rating_count: 210,
    price_from: 89, currency: 'CAD', cost_tier: null, lat: null, lng: null });
  P.push({ id: 'cur-treetop-trekking', source: 'curated_catalog', title: 'Treetop Trekking zipline & aerial park', category: 'adventures',
    description: 'Ziplines and aerial ropes courses through the forest canopy.', tags: ['zipline', 'treetop', 'ropes course', 'climbing', 'adrenaline', 'forest', 'kids'],
    venue: 'Treetop Trekking', location: 'Brampton', lat: null, lng: null, cost_tier: '$$', wow: true });

  // ---- Library programs (TPL events: venue and address, no coordinates) ----
  [
    ['Game On Board Games', 'Teens', 'Board games for teens after school.'],
    ['Knitting Circle', 'Adults', 'Bring your needles: a relaxed knitting group.'],
    ['Crafturday', 'Children', 'Saturday crafts for kids.'],
    ['Family Story Time', 'Children 0 to 5 with a caregiver', 'Stories, songs and rhymes for little ones.'],
    ['Saturday Morning Stories', 'Children', 'Picture books and songs on Saturday morning.']
  ].forEach(([title, ages, description], i) => P.push({
    id: `tpl-${i}`, source: 'tpl_events', title, category: i === 1 ? 'culture' : 'kids', description,
    good_for_ages: ages, venue: 'Toronto Public Library, Steeles Branch', address: 'Steeles Library, Toronto',
    date: '2026-10-31', lat: null, lng: null, cost_tier: 'free', civic: true
  }));

  // ---- What actually answers the request ----
  // Outdoor playgrounds (theme query "playground park").
  [
    ['Mill Pond Park adventure playground', 1.5, 0.6, 4.6],
    ['Richmond Green playground and splash pad', 3.2, 2.4, 4.5],
    ['Bayview Hill Park playground', 2.1, -2.8, 4.4],
    ['Lake Wilcox Park playground', 0.4, 6.1, 4.7],
    ['Oak Ridges Corridor playground', -1.6, 7.8, 4.4],
    ['Toogood Pond Park playground', 9.8, -3.5, 4.6],
    ['Pioneer Park natural playground', -0.9, 3.9, 4.5],
    ['Sixteenth Avenue Park climbing playground', 4.4, -4.2, 4.3]
  ].forEach(([title, e, n, rating], i) => place(Object.assign({
    id: `gp-playground-${i}`, title, category: 'kids', theme_hit: true,
    description: 'Large playground with climbing structures, slides and swings for young children.',
    types: ['park', 'playground'], rating, rating_count: 180 + i * 20, cost_tier: 'free'
  }, at(e, n))));
  // Indoor play centres (theme query "indoor playground kids").
  [
    ['Kidz Kingdom indoor playground', 6.2, 1.8],
    ['Jungle Gym Junction indoor play centre', -4.4, -3.1]
  ].forEach(([title, e, n], i) => place(Object.assign({
    id: `gp-indoor-play-${i}`, title, category: 'kids', theme_hit: true,
    description: 'Indoor play centre with soft play, slides and a toddler zone.',
    types: ['amusement_center'], rating: 4.4, rating_count: 260, good_for_ages: 'Toddlers to 10', cost_tier: '$'
  }, at(e, n))));
  // The one tile that matched in the live feed: the curated indoor playgrounds.
  P.push({ id: 'cur-lol-playlab', source: 'curated_catalog', title: 'LOL PlayLab — indoor playground & edutainment', category: 'kids',
    tags: ['indoor', 'playground', 'rainy', 'kids', 'toddler', 'soft play', 'play centre'], venue: 'LOL PlayLab',
    location: 'Innovator Ave, Whitchurch-Stouffville', description: 'A big indoor play space: climbing, slides and structured play.',
    cost_tier: '$', good_for_ages: 'toddlers to 10', lat: 43.96269, lng: -79.26669 });
  P.push({ id: 'cur-oceanloop-aurora', source: 'curated_catalog', title: 'OceanLoop — indoor playground in Aurora', category: 'kids',
    tags: ['indoor', 'playground', 'kids', 'toddler', 'soft play', 'play centre'], venue: 'OceanLoop', location: 'Don Hillock Dr, Aurora',
    description: 'Ocean-themed indoor playground open late into the evening.', cost_tier: '$', good_for_ages: 'toddlers to 10',
    lat: 44.00904, lng: -79.41637 });

  // ---- Neutral neighbours a real pool also carries ----
  place(Object.assign({ id: 'gp-museum', title: 'Richmond Hill Heritage Centre', category: 'culture',
    description: 'Local history museum with rotating exhibits.', types: ['museum'], rating: 4.5, rating_count: 120 }, at(0.8, -0.5)));
  place(Object.assign({ id: 'gp-farm', title: 'Family farm with petting zoo', category: 'kids', theme_hit: true,
    description: 'Petting zoo, wagon rides and a corn maze for families.', types: ['farm', 'tourist_attraction'], rating: 4.5, rating_count: 500 }, at(14, 9)));
  place(Object.assign({ id: 'gp-escape', title: 'Escape Room Richmond Hill', category: 'general',
    description: 'Escape rooms for groups, ages 12 and up.', types: ['amusement_center'], rating: 4.8, rating_count: 700, good_for_ages: '12+' }, at(1.9, 0.2)));
  place(Object.assign({ id: 'gp-brewery', title: 'Taproom with a patio', category: 'patios',
    description: 'Craft brewery taproom with a big patio.', types: ['bar', 'brewery'], rating: 4.6, rating_count: 400, outdoor_seating: true }, at(-2.2, 0.9)));
  place(Object.assign({ id: 'gp-trail', title: 'Oak Ridges Moraine trail', category: 'general',
    description: 'Forest trail loop with boardwalks over the wetland.', types: ['park', 'hiking_area'], rating: 4.7, rating_count: 800, cost_tier: 'free' }, at(-3.5, 9.5)));
  return P;
}

module.exports = { PROMPT, ORIGIN, pool, at };
