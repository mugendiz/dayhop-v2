// data/curatedCatalog.js — DayHop V2
// Evergreen GTA discovery catalog: real, verifiable places and experiences
// that make people say "I had no idea you could do that here." Unlike
// data/curatedEvents.js (dated events), these entries have no date — they
// are matched to the user's prompt by tags via services/relevance.js.
//
// Shape per entry:
//   id            'cur-' kebab slug, unique
//   title         specific and concrete
//   category      worldcup | kids | patios | water | cruises | adventures | culture | food | general
//   tags          keywords matched against prompt tokens and theme tags
//   location      area + GTA town, e.g. "Harbourfront, Toronto"
//   venue         the actual place name
//   description   ≤180 chars, honest and concrete
//   cost_tier     free | $ | $$ | $$$
//   good_for_ages e.g. "all ages", "8+"
//   maps_url      static Google Maps search link (no API cost)
//   wow           true for genuine "didn't know you could" entries
//   seasonal      'summer' | 'winter' | null (filtered by current month)

const mapsSearch = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// Optional per-entry fields for the "Just opened" layer (Phase 0 of the
// social-signal discovery plan):
//   opened_at    'YYYY-MM-DD' — when the attraction opened to the public
//   new_until    'YYYY-MM-DD' — badge/shelf expiry (default opened_at + 1y)
//   booking_url  official ticket page (curated entries may carry one)
// candidates.js derives `newly_opened` from these at request time, so the
// badge decays on its own — no cleanup pass needed.

module.exports = [
  // ---------- Just opened (verified 2026-07-24; sources in commit) ----------
  {
    id: 'cur-niagara-takes-flight',
    title: "Niagara Takes Flight — the new flying theatre at the Falls",
    category: 'adventures',
    tags: ['flight', 'flying', 'ride', 'immersive', 'indoor', 'niagara', 'falls', 'simulator', 'family', 'rainy', 'new'],
    location: "Table Rock Centre, Niagara Falls",
    venue: "Niagara Parks — Table Rock Centre",
    description: "The $25M flying-theatre ride at the brink of the Horseshoe Falls — a motion gondola soars the whole Niagara River on a 17-m dome, narrated by James Cameron.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Table Rock Centre Niagara Falls'),
    booking_url: 'https://www.niagaraparks.com/visit/attractions/niagaratakesflight',
    opened_at: '2025-08-29',
    wow: true, seasonal: null
  },
  {
    id: 'cur-monet-immersive',
    title: "Claude Monet: The Immersive Experience",
    category: 'culture',
    tags: ['immersive', 'art', 'exhibit', 'monet', 'indoor', 'rainy', 'projection', 'museum', 'date', 'new'],
    location: "YZD (Downsview), Toronto",
    venue: "Claude Monet: The Immersive Experience",
    description: "300+ Monet works turned into room-scale light and sound — 20,000 sq ft of projection plus a VR walk through Giverny. Opened February 2026.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('30 Hanover Road Toronto'),
    booking_url: 'https://monetexpo.com/toronto/',
    opened_at: '2026-02-26',
    wow: true, seasonal: null
  },
  {
    id: 'cur-arcadia-earth',
    title: "Arcadia Earth — immersive journey through 17 worlds",
    category: 'culture',
    tags: ['immersive', 'art', 'nature', 'environment', 'indoor', 'rainy', 'projection', 'kids', 'family'],
    location: "Downtown, Toronto",
    venue: "Arcadia Earth Toronto",
    description: "Seventeen rooms of projection, augmented reality, and art built from reclaimed materials — a nature story that lands with kids and adults alike.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Arcadia Earth Toronto'),
    booking_url: 'https://www.arcadiaearth.ca/',
    wow: true, seasonal: null
  },
  // ---------- Water & paddling (the "swimming → whole lake" pack) ----------
  {
    id: 'cur-harbourfront-kayak',
    title: "Kayak & SUP rentals at Harbourfront",
    category: 'water',
    tags: ['kayak', 'paddle', 'paddleboard', 'canoe', 'water', 'swim', 'lake', 'rental', 'summer'],
    location: "Harbourfront, Toronto",
    venue: "Harbourfront Canoe & Kayak Centre",
    description: "Rent a kayak or stand-up paddleboard downtown and paddle toward the Toronto Islands lagoons — no experience needed, lessons available.",
    cost_tier: '$$', good_for_ages: '8+',
    maps_url: mapsSearch('Harbourfront Canoe and Kayak Centre Toronto'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-centre-island-paddleboats',
    title: "Paddle boats at Centre Island",
    category: 'water',
    tags: ['paddleboat', 'paddle', 'boat', 'water', 'island', 'kids', 'ferry', 'summer'],
    location: "Toronto Islands, Toronto",
    venue: "Boat House, Centre Island",
    description: "Swan-shaped paddle boats on the Centre Island lagoons — a ferry ride, a paddle, and Centreville rides all in one car-free afternoon.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Boat House Centre Island Toronto'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-wonderland-splash-works',
    title: "Splash Works waterpark at Canada's Wonderland",
    category: 'water',
    tags: ['waterpark', 'water', 'swim', 'slides', 'wave pool', 'kids', 'summer'],
    location: "Vaughan",
    venue: "Canada's Wonderland",
    description: "20-acre waterpark inside Wonderland — Canada's largest outdoor wave pool, 16+ slides, and a splash zone for little kids, all on one admission.",
    cost_tier: '$$$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Canada's Wonderland Splash Works Vaughan"),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-bluffers-park-beach',
    title: "Bluffer's Park Beach under the Scarborough Bluffs",
    category: 'water',
    tags: ['beach', 'swim', 'water', 'hidden gem', 'nature', 'picnic', 'sand', 'summer'],
    location: "Scarborough",
    venue: "Bluffer's Park",
    description: "A sandy, lifeguarded beach at the foot of 90-metre white cliffs — feels like a coastal escape, 30 minutes from downtown.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Bluffers Park Beach Scarborough'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-hanlans-ward-beaches',
    title: "Ward's Island & Hanlan's Point beaches",
    category: 'water',
    tags: ['beach', 'swim', 'water', 'island', 'ferry', 'sand', 'picnic', 'summer'],
    location: "Toronto Islands, Toronto",
    venue: "Toronto Island Park",
    description: "Quiet, swimmable beaches a 15-minute ferry from downtown — Ward's is the calm family end with picnic tables under the trees.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Ward's Island Beach Toronto"),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-cherry-beach',
    title: "Cherry Beach — the calm dog-friendly cove",
    category: 'water',
    tags: ['beach', 'swim', 'water', 'dog', 'picnic', 'quiet', 'summer'],
    location: "Port Lands, Toronto",
    venue: "Cherry Beach",
    description: "A low-key lifeguarded beach with shady trees and calm water, minutes from downtown — the locals' pick when Woodbine is packed.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Cherry Beach Toronto'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-professors-lake',
    title: "Professor's Lake beach & pedal boats in Brampton",
    category: 'water',
    tags: ['lake', 'beach', 'swim', 'paddleboat', 'pedal boat', 'water', 'kids', 'summer'],
    location: "Brampton",
    venue: "Professor's Lake Recreation Centre",
    description: "A 65-acre spring-fed lake in the middle of Brampton with a sandy swimming beach, pedal boats, and a water slide.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Professor's Lake Recreation Centre Brampton"),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-wet-n-wild-toronto',
    title: "Wet'n'Wild Toronto waterpark",
    category: 'water',
    tags: ['waterpark', 'water', 'swim', 'slides', 'wave pool', 'kids', 'summer'],
    location: "Brampton",
    venue: "Wet'n'Wild Toronto",
    description: "Full-day waterpark with racing slides, a lazy river, wave pool and a dedicated little-kids splash area.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Wet'n'Wild Toronto Brampton"),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-sunnyside-pool',
    title: "Sunnyside Gus Ryder Pool — swim beside the lake",
    category: 'water',
    tags: ['pool', 'swim', 'swimming', 'water', 'outdoor pool', 'lakefront', 'kids', 'summer'],
    location: "Sunnyside, Toronto",
    venue: "Sunnyside Gus Ryder Outdoor Pool",
    description: "One of Canada's largest outdoor pools, right on the Sunnyside boardwalk — free swims, lake views, and an ice-cream stand next door.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Sunnyside Gus Ryder Pool Toronto'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-lake-wilcox-park',
    title: "Lake Wilcox waterfront park & canoe launch",
    category: 'water',
    tags: ['lake', 'water', 'canoe', 'kayak', 'playground', 'splash', 'kids', 'summer'],
    location: "Oak Ridges, Richmond Hill",
    venue: "Lake Wilcox Park",
    description: "Richmond Hill's own kettle lake — splash pad, waterfront boardwalk, playground, and a canoe/kayak launch on the north shore.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Lake Wilcox Park Richmond Hill'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-wave-pool-rh',
    title: "The Wave Pool — indoor waves year-round in Richmond Hill",
    category: 'water',
    tags: ['pool', 'swim', 'swimming', 'wave pool', 'indoor', 'water', 'kids', 'rainy day'],
    location: "Richmond Hill",
    venue: "The Wave Pool",
    description: "Richmond Hill's indoor wave pool with a 137-foot waterslide, Tarzan rope and toddler splash area — waves roll every 30 minutes, rain or shine.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('The Wave Pool Richmond Hill'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-ontario-place-trillium',
    title: "Trillium Park & the William G. Davis Trail",
    category: 'water',
    tags: ['waterfront', 'walk', 'picnic', 'lookout', 'water', 'sunset', 'free'],
    location: "Ontario Place, Toronto",
    venue: "Trillium Park",
    description: "A carved-granite waterfront park on the old Ontario Place grounds — skyline lookouts, a fire-pit bluff, and lakeside picnic lawns.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Trillium Park Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-tall-ship-kajama',
    title: "Tall ship harbour cruise on the Kajama",
    category: 'cruises',
    tags: ['cruise', 'boat', 'sail', 'tall ship', 'harbour', 'water', 'skyline', 'summer'],
    location: "Harbourfront, Toronto",
    venue: "Tall Ship Kajama",
    description: "Sail Toronto's harbour on a 165-foot three-masted schooner — kids can help hoist the sails; the skyline does the rest.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Tall Ship Kajama Toronto'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-scarborough-bluffs-paddle',
    title: "Paddle beneath the Scarborough Bluffs",
    category: 'water',
    tags: ['kayak', 'canoe', 'paddle', 'water', 'bluffs', 'nature', 'hidden gem', 'summer'],
    location: "Scarborough",
    venue: "Bluffer's Park Marina",
    description: "Launch a rented kayak from Bluffer's Park and paddle along the base of the cliffs — one of the most dramatic shorelines on Lake Ontario.",
    cost_tier: '$$', good_for_ages: '10+',
    maps_url: mapsSearch("Bluffer's Park Marina Scarborough"),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-albion-hills-swim',
    title: "Albion Hills conservation swim pond & bike trails",
    category: 'water',
    tags: ['swim', 'pond', 'lake', 'nature', 'bike', 'trail', 'picnic', 'camping', 'summer'],
    location: "Caledon",
    venue: "Albion Hills Conservation Park",
    description: "A supervised swim pond with a sandy edge inside 470 hectares of rolling forest — pair a swim with the GTA's best family mountain-bike trails.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Albion Hills Conservation Park Caledon'),
    wow: false, seasonal: 'summer'
  },

  // ---------- Adrenaline & big experiences ----------
  {
    id: 'cur-toronto-heli-tour',
    title: "Helicopter tour over downtown Toronto",
    category: 'adventures',
    tags: ['helicopter', 'thrill', 'adrenaline', 'view', 'skyline', 'bucket list'],
    location: "Billy Bishop Airport, Toronto",
    venue: "Toronto Heli Tours",
    description: "Seven minutes over the CN Tower, the harbour and the Islands — a genuine bucket-list view that costs less than dinner for four.",
    cost_tier: '$$$', good_for_ages: '5+',
    maps_url: mapsSearch('Toronto Heli Tours Billy Bishop'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-cn-tower-edgewalk',
    title: "EdgeWalk — hang off the CN Tower",
    category: 'adventures',
    tags: ['thrill', 'adrenaline', 'cn tower', 'bucket list', 'extreme', 'view'],
    location: "Downtown Toronto",
    venue: "CN Tower",
    description: "Walk the open ledge 356 m up the CN Tower on the world's highest full-circle hands-free walk. Teens 13+ with a guardian can do it too.",
    cost_tier: '$$$', good_for_ages: '13+',
    maps_url: mapsSearch('CN Tower EdgeWalk Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-treetop-trekking',
    title: "Treetop Trekking zipline & aerial park",
    category: 'adventures',
    tags: ['zipline', 'treetop', 'ropes course', 'climbing', 'adrenaline', 'forest', 'kids'],
    location: "Stouffville (also Brampton & Barrie)",
    venue: "Treetop Trekking Stouffville",
    description: "Ziplines, wobbly bridges and Tarzan swings through the forest canopy — separate kids' courses from age 5, big courses for teens and parents.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Treetop Trekking Stouffville'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-ifly-indoor-skydiving',
    title: "iFLY indoor skydiving",
    category: 'adventures',
    tags: ['skydiving', 'indoor', 'thrill', 'adrenaline', 'wind tunnel', 'kids', 'rainy day'],
    location: "Whitby (also Oakville)",
    venue: "iFLY Toronto",
    description: "Real freefall in a vertical wind tunnel — kids as young as 4 can fly, and it works rain or shine.",
    cost_tier: '$$$', good_for_ages: '4+',
    maps_url: mapsSearch('iFLY Toronto Whitby'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-k1-speed-karting',
    title: "K1 Speed indoor electric go-karting",
    category: 'adventures',
    tags: ['karting', 'go kart', 'racing', 'indoor', 'adrenaline', 'teens', 'rainy day'],
    location: "Vaughan (also Toronto & Mississauga)",
    venue: "K1 Speed Vaughan",
    description: "Fast electric karts on a pro-style indoor circuit with live lap timing — junior karts run from about age 8 / 48 inches.",
    cost_tier: '$$', good_for_ages: '8+',
    maps_url: mapsSearch('K1 Speed Vaughan'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-family-climbing',
    title: "Family climbing session at a bouldering gym",
    category: 'adventures',
    tags: ['climbing', 'bouldering', 'indoor', 'adrenaline', 'kids', 'rainy day'],
    location: "Toronto & Markham",
    venue: "Basecamp Climbing / Hub Climbing",
    description: "Padded-floor bouldering means kids climb real walls with zero rope fuss — most GTA gyms run drop-in family sessions on weekends.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Hub Climbing Markham'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-combat-archery',
    title: "Archery dodgeball (combat archery)",
    category: 'adventures',
    tags: ['archery', 'dodgeball', 'indoor', 'adrenaline', 'teens', 'birthday', 'rainy day'],
    location: "Markham / Toronto",
    venue: "Archers Arena",
    description: "Dodgeball with foam-tipped arrows in a padded arena — the game your kids will describe at school for a week.",
    cost_tier: '$$', good_for_ages: '10+',
    maps_url: mapsSearch('Archers Arena Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-horseback-caledon',
    title: "Guided horseback trail ride in the Caledon hills",
    category: 'adventures',
    tags: ['horse', 'horseback', 'trail ride', 'nature', 'animals', 'countryside'],
    location: "Caledon / Terra Cotta",
    venue: "Caledon-area trail stables",
    description: "Walk-pace guided trail rides through Niagara Escarpment forest — many stables take first-timers and kids about 9 and up.",
    cost_tier: '$$$', good_for_ages: '9+',
    maps_url: mapsSearch('horseback trail riding Caledon'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-joyride-150',
    title: "Joyride 150 indoor bike park",
    category: 'adventures',
    tags: ['mountain bike', 'bmx', 'bike', 'indoor', 'adrenaline', 'teens', 'rainy day'],
    location: "Markham",
    venue: "Joyride 150 Indoor Bike Park",
    description: "100,000 sq ft of indoor pump tracks, jumps and skills lines for mountain bikes and BMX — beginner zones and rentals mean first-timers ride too.",
    cost_tier: '$$', good_for_ages: '6+',
    maps_url: mapsSearch('Joyride 150 Indoor Bike Park Markham'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-skydive-toronto',
    title: "Tandem skydive over Simcoe County",
    category: 'adventures',
    tags: ['skydiving', 'thrill', 'adrenaline', 'extreme', 'bucket list', 'jump', 'summer'],
    location: "Innisfil (45 min north of the GTA)",
    venue: "Skydive Toronto",
    description: "A real 12,500-foot tandem jump strapped to a certified instructor — the biggest adrenaline hit within an hour of the city.",
    cost_tier: '$$$', good_for_ages: '18+',
    maps_url: mapsSearch('Skydive Toronto Innisfil'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-batl-axe-throwing',
    title: "Axe throwing at BATL",
    category: 'adventures',
    tags: ['axe throwing', 'axe', 'indoor', 'adrenaline', 'teens', 'birthday', 'rainy day'],
    location: "Toronto & Vaughan",
    venue: "BATL — Backyard Axe Throwing League",
    description: "The company that started urban axe throwing — coached lanes, round-robin matches, and the deeply satisfying thunk of a bullseye.",
    cost_tier: '$$', good_for_ages: '10+',
    maps_url: mapsSearch('BATL Axe Throwing Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-wonderland-coasters',
    title: "Coaster day at Canada's Wonderland",
    category: 'adventures',
    tags: ['coaster', 'rollercoaster', 'rides', 'thrill', 'adrenaline', 'theme park', 'teens', 'summer'],
    location: "Vaughan",
    venue: "Canada's Wonderland",
    description: "17 roller coasters including Yukon Striker, the world's longest dive coaster — Canada's biggest collection of serious thrill rides.",
    cost_tier: '$$$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Canada's Wonderland Vaughan"),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-rec-room-vr',
    title: "VR arena & games at The Rec Room",
    category: 'adventures',
    tags: ['vr', 'virtual reality', 'arcade', 'games', 'indoor', 'teens', 'rainy day'],
    location: "Roundhouse, Toronto (also Mississauga)",
    venue: "The Rec Room",
    description: "Free-roam VR, axe throwing lanes, and a two-storey arcade inside the historic Roundhouse — a full high-energy evening under one roof.",
    cost_tier: '$$', good_for_ages: '9+',
    maps_url: mapsSearch('The Rec Room Roundhouse Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-casa-loma-escape',
    title: "Escape rooms inside a real castle",
    category: 'adventures',
    tags: ['escape room', 'puzzle', 'castle', 'indoor', 'teens', 'rainy day', 'immersive'],
    location: "Midtown Toronto",
    venue: "Casa Loma Escape Series",
    description: "Theatrical escape games with live actors staged through Casa Loma's real tunnels and secret rooms — closer to immersive theatre than a puzzle box.",
    cost_tier: '$$$', good_for_ages: '13+',
    maps_url: mapsSearch('Casa Loma Escape Series Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-elora-gorge-tubing',
    title: "Tube the rapids through the Elora Gorge",
    category: 'adventures',
    tags: ['tubing', 'river', 'rapids', 'water', 'thrill', 'nature', 'summer', 'day trip'],
    location: "Elora (90 min west of the GTA)",
    venue: "Elora Gorge Conservation Area",
    description: "Float and bounce down the Grand River between 22-metre limestone cliffs — helmets and tubes rented on site; worth the drive on a hot day.",
    cost_tier: '$$', good_for_ages: '12+',
    maps_url: mapsSearch('Elora Gorge Conservation Area tubing'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-humber-paddle',
    title: "Paddle the Humber River from Old Mill",
    category: 'water',
    tags: ['kayak', 'canoe', 'paddle', 'river', 'nature', 'rental', 'heron', 'summer'],
    location: "Old Mill, Toronto",
    venue: "Toronto Adventures — Humber River",
    description: "Rent a kayak or canoe under the Old Mill bridge and paddle a surprisingly wild stretch of the Humber — herons and turtles minutes from the subway.",
    cost_tier: '$$', good_for_ages: '8+',
    maps_url: mapsSearch('Toronto Adventures Old Mill kayak Humber'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-kelso-mtb',
    title: "Mountain biking & cliff-top trails at Kelso",
    category: 'adventures',
    tags: ['mountain bike', 'bike', 'trail', 'escarpment', 'adrenaline', 'nature', 'summer'],
    location: "Milton",
    venue: "Kelso Conservation Area",
    description: "The Escarpment's classic mountain-bike hill — flowy forest singletrack with lake views, plus a beach at the bottom to cool off after.",
    cost_tier: '$', good_for_ages: '10+',
    maps_url: mapsSearch('Kelso Conservation Area mountain biking Milton'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-rattlesnake-climbing',
    title: "Learn outdoor rock climbing at Rattlesnake Point",
    category: 'adventures',
    tags: ['climbing', 'rock climbing', 'outdoor', 'escarpment', 'adrenaline', 'cliffs', 'summer'],
    location: "Milton",
    venue: "Rattlesnake Point Conservation Area",
    description: "The GTA's classic outdoor climbing crag — certified guiding outfits run beginner top-rope days on the same limestone cliffs the pros train on.",
    cost_tier: '$$$', good_for_ages: '10+',
    maps_url: mapsSearch('Rattlesnake Point rock climbing Milton'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-glen-eden-snow',
    title: "Ski & snowboard day at Glen Eden",
    category: 'adventures',
    tags: ['ski', 'snowboard', 'snow', 'winter', 'lessons', 'adrenaline', 'kids'],
    location: "Milton",
    venue: "Glen Eden Ski & Snowboard Centre",
    description: "The closest real ski hill to most of the GTA — night skiing, a terrain park, and learn-to-ski programs that actually fit a day trip.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Glen Eden Ski Snowboard Centre Milton'),
    wow: false, seasonal: 'winter'
  },
  {
    id: 'cur-snow-valley-tubing',
    title: "Snow tubing at Snow Valley",
    category: 'adventures',
    tags: ['tubing', 'snow', 'winter', 'sledding', 'kids', 'thrill'],
    location: "Barrie (1 hr north of the GTA)",
    venue: "Snow Valley Snow Tubing Park",
    description: "Ontario's biggest tubing park — lift-serviced lanes so you ride up and bomb down all day, zero skill required.",
    cost_tier: '$$', good_for_ages: '4+',
    maps_url: mapsSearch('Snow Valley Snow Tubing Barrie'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-blue-mountain-day',
    title: "Blue Mountain adventure day trip",
    category: 'adventures',
    tags: ['coaster', 'gondola', 'ropes course', 'mountain', 'thrill', 'day trip', 'village'],
    location: "Collingwood (2 hrs from the GTA)",
    venue: "Blue Mountain Resort",
    description: "The Ridge Runner mountain coaster, open-air gondola, ropes courses and a walkable village — the GTA's default big-adventure day trip in any season.",
    cost_tier: '$$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Blue Mountain Resort Collingwood'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-glow-mini-putt',
    title: "Glow-in-the-dark mini putt",
    category: 'adventures',
    tags: ['mini golf', 'glow', 'indoor', 'kids', 'rainy day', 'birthday'],
    location: "Vaughan / Richmond Hill area",
    venue: "Putting Edge",
    description: "Black-light mini golf where everything glows — a reliable 90-minute crowd-pleaser for mixed ages, any weather.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Putting Edge Vaughan'),
    wow: false, seasonal: null
  },

  // ---------- Kids favourites ----------
  {
    id: 'cur-ripleys-aquarium',
    title: "Walk the shark tunnel at Ripley's Aquarium",
    category: 'kids',
    tags: ['aquarium', 'sharks', 'indoor', 'kids', 'animals', 'rainy day', 'downtown'],
    location: "Downtown Toronto",
    venue: "Ripley's Aquarium of Canada",
    description: "The moving glass tunnel under Dangerous Lagoon puts sharks and sawfish directly overhead — go at opening or after 5pm to dodge crowds.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Ripley's Aquarium of Canada Toronto"),
    wow: false, seasonal: null
  },
  {
    id: 'cur-toronto-zoo',
    title: "Toronto Zoo — 10 km of trails and 3,000 animals",
    category: 'kids',
    tags: ['zoo', 'animals', 'kids', 'outdoor', 'walking', 'splash'],
    location: "Scarborough",
    venue: "Toronto Zoo",
    description: "Canada's biggest zoo, with a splash pad and Zoomobile for little legs — the Tundra polar bears and orangutan house are the anchors.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Toronto Zoo'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-science-centre-popups',
    title: "Ontario Science Centre pop-up experiences",
    category: 'kids',
    tags: ['science', 'museum', 'indoor', 'kids', 'hands-on', 'rainy day'],
    location: "Toronto",
    venue: "Ontario Science Centre (temporary locations)",
    description: "While the main building is closed, the Science Centre runs hands-on pop-ups at Harbourfront and Sherway — check what's on before you go.",
    cost_tier: '$', good_for_ages: '3-12 years',
    maps_url: mapsSearch('Ontario Science Centre pop-up Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-legoland-vaughan',
    title: "LEGOLAND Discovery Centre",
    category: 'kids',
    tags: ['lego', 'indoor', 'kids', 'rides', 'rainy day', 'toddler'],
    location: "Vaughan Mills, Vaughan",
    venue: "LEGOLAND Discovery Centre Toronto",
    description: "Two rides, a 4D cinema and a MINILAND Toronto built from a million bricks — sized for the 3-10 crowd, adults must bring a kid.",
    cost_tier: '$$', good_for_ages: '3-10 years',
    maps_url: mapsSearch('LEGOLAND Discovery Centre Vaughan'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-downeys-farm',
    title: "Downey's Farm — animals, wagon rides & play barns",
    category: 'kids',
    tags: ['farm', 'animals', 'kids', 'outdoor', 'wagon ride', 'corn maze', 'toddler'],
    location: "Caledon",
    venue: "Downey's Farm Market",
    description: "A proper working farm day: goats and pony grooming, giant jumping pillows, wagon rides, and seasonal berry or apple picking.",
    cost_tier: '$', good_for_ages: '1-10 years',
    maps_url: mapsSearch("Downey's Farm Market Caledon"),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-chudleighs-farm',
    title: "Chudleigh's apple farm & giant slides",
    category: 'kids',
    tags: ['farm', 'apple picking', 'kids', 'outdoor', 'slides', 'bakery'],
    location: "Milton",
    venue: "Chudleigh's Farm",
    description: "Apple picking plus tree-house climbs, hill slides and famous apple blossoms from the bakery — a full-day farm classic since 1967.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch("Chudleigh's Farm Milton"),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-riverdale-farm',
    title: "Riverdale Farm — a free farm inside the city",
    category: 'kids',
    tags: ['farm', 'animals', 'free', 'kids', 'toddler', 'hidden gem', 'cabbagetown'],
    location: "Cabbagetown, Toronto",
    venue: "Riverdale Farm",
    description: "A real 7.5-acre working farm in downtown Toronto — cows, pigs, goats and chickens, completely free, beside the Don Valley trails.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Riverdale Farm Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-high-park-zoo',
    title: "High Park: free zoo + the castle playground",
    category: 'kids',
    tags: ['park', 'zoo', 'playground', 'free', 'kids', 'picnic', 'capybara'],
    location: "High Park, Toronto",
    venue: "High Park Zoo & Jamie Bell Adventure Playground",
    description: "Bison, llamas and the famous capybaras at the free zoo, then the wooden castle playground — add the trackless train when it runs.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('High Park Zoo Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-mega-indoor-playgrounds',
    title: "Mega indoor playgrounds for burn-the-energy days",
    category: 'kids',
    tags: ['indoor playground', 'play centre', 'toddler', 'kids', 'rainy day', 'climbing'],
    location: "Across the GTA",
    venue: "Kidstown / Playville / Amazon Indoor Playground",
    description: "Multi-storey climbers, ball cannons and toddler zones — the GTA's big indoor playgrounds are the honest answer to a rainy Saturday.",
    cost_tier: '$', good_for_ages: '1-10 years',
    maps_url: mapsSearch('indoor playground Richmond Hill'),
    wow: false, seasonal: null
  },

  // ---------- Culture & hidden gems ----------
  {
    id: 'cur-casa-loma',
    title: "Casa Loma — a real castle with secret tunnels",
    category: 'culture',
    tags: ['castle', 'history', 'tunnels', 'kids', 'museum', 'gardens', 'rainy day'],
    location: "Midtown Toronto",
    venue: "Casa Loma",
    description: "Turrets, an 800-foot underground tunnel, vintage cars and towers you can actually climb — the castle sells itself to kids.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Casa Loma Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-aga-khan-museum',
    title: "Aga Khan Museum & its reflecting-pool courtyard",
    category: 'culture',
    tags: ['museum', 'art', 'architecture', 'hidden gem', 'gardens', 'quiet'],
    location: "Don Mills, Toronto",
    venue: "Aga Khan Museum",
    description: "A serene white-granite museum of Islamic art with formal gardens and pools — one of Toronto's most beautiful buildings, rarely crowded.",
    cost_tier: '$', good_for_ages: '6+',
    maps_url: mapsSearch('Aga Khan Museum Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-mcmichael-gallery',
    title: "McMichael Canadian Art Collection in the woods",
    category: 'culture',
    tags: ['art', 'gallery', 'group of seven', 'nature', 'trail', 'hidden gem'],
    location: "Kleinburg, Vaughan",
    venue: "McMichael Canadian Art Collection",
    description: "The Group of Seven in a log-and-stone gallery over the Humber Valley — pair the art with the sculpture trail through the forest.",
    cost_tier: '$', good_for_ages: '6+',
    maps_url: mapsSearch('McMichael Canadian Art Collection Kleinburg'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-distillery-district',
    title: "Distillery District cobblestone wander",
    category: 'culture',
    tags: ['historic', 'walk', 'food', 'chocolate', 'shopping', 'photos', 'date'],
    location: "Old Toronto",
    venue: "The Distillery Historic District",
    description: "Car-free Victorian lanes of galleries, chocolate shops and patios — an easy two-hour wander with good stroller access.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Distillery District Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-black-creek-village',
    title: "Black Creek Pioneer Village time-travel day",
    category: 'culture',
    tags: ['history', 'pioneer', 'kids', 'hands-on', 'village', 'heritage'],
    location: "North York, Toronto",
    venue: "Black Creek Pioneer Village",
    description: "An 1860s village where costumed blacksmiths, millers and tinsmiths actually work — kids can try period chores and games.",
    cost_tier: '$$', good_for_ages: '4+',
    maps_url: mapsSearch('Black Creek Pioneer Village Toronto'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-graffiti-alley',
    title: "Graffiti Alley & Kensington Market walk",
    category: 'culture',
    tags: ['street art', 'walk', 'photos', 'market', 'free', 'teens'],
    location: "Queen West, Toronto",
    venue: "Graffiti Alley",
    description: "A kilometre of legal murals behind Queen West, then snacks through Kensington Market — free, photogenic, and teen-approved.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Graffiti Alley Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-david-dunlap-observatory',
    title: "Look through Canada's largest telescope in Richmond Hill",
    category: 'culture',
    tags: ['telescope', 'astronomy', 'stars', 'night', 'science', 'hidden gem', 'kids'],
    location: "Richmond Hill",
    venue: "David Dunlap Observatory",
    description: "Saturday-night public viewings through a 74-inch telescope — the largest in Canada, hiding in a Richmond Hill park.",
    cost_tier: '$', good_for_ages: '7+',
    maps_url: mapsSearch('David Dunlap Observatory Richmond Hill'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-toronto-music-garden',
    title: "Toronto Music Garden — a garden composed by Yo-Yo Ma",
    category: 'culture',
    tags: ['garden', 'music', 'waterfront', 'free', 'quiet', 'hidden gem', 'picnic'],
    location: "Harbourfront, Toronto",
    venue: "Toronto Music Garden",
    description: "A waterfront garden designed to embody a Bach cello suite, with free summer concerts in the grass amphitheatre.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Toronto Music Garden'),
    wow: true, seasonal: 'summer'
  },

  // ---------- Nature & lookouts ----------
  {
    id: 'cur-cathedral-bluffs-lookout',
    title: "Scarborough Bluffs lookout at Cathedral Bluffs Park",
    category: 'general',
    tags: ['lookout', 'nature', 'cliffs', 'photos', 'free', 'sunset', 'hike'],
    location: "Scarborough",
    venue: "Cathedral Bluffs Park",
    description: "The top-of-the-cliffs view most Torontonians have never seen — 90 metres above the lake, five minutes from parking.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Cathedral Bluffs Park Scarborough'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-evergreen-brick-works',
    title: "Evergreen Brick Works — ponds, trails & Saturday market",
    category: 'general',
    tags: ['nature', 'trail', 'market', 'kids', 'bike', 'lookout', 'free'],
    location: "Don Valley, Toronto",
    venue: "Evergreen Brick Works",
    description: "A century-old brick factory turned nature hub — turtle ponds, a kiln-building playground, weekend farmers' market and skyline lookout.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Evergreen Brick Works Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-crawford-lake',
    title: "Crawford Lake boardwalk & reconstructed longhouse village",
    category: 'general',
    tags: ['nature', 'trail', 'boardwalk', 'history', 'longhouse', 'lake', 'kids', 'hike'],
    location: "Milton",
    venue: "Crawford Lake Conservation Area",
    description: "A floating boardwalk around a rare meromictic lake plus a reconstructed 15th-century Iroquoian village — an easy, fascinating loop.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Crawford Lake Conservation Area Milton'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-rattlesnake-point',
    title: "Rattlesnake Point cliff lookouts",
    category: 'general',
    tags: ['hike', 'lookout', 'cliffs', 'nature', 'escarpment', 'photos', 'picnic'],
    location: "Milton",
    venue: "Rattlesnake Point Conservation Area",
    description: "Short forest loops to limestone cliff-edge lookouts over the Escarpment — turkey vultures ride the updrafts at eye level.",
    cost_tier: '$', good_for_ages: '5+',
    maps_url: mapsSearch('Rattlesnake Point Conservation Area Milton'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-edwards-gardens',
    title: "Edwards Gardens & the Don ravine trails",
    category: 'general',
    tags: ['garden', 'nature', 'walk', 'free', 'picnic', 'stroller', 'quiet'],
    location: "North York, Toronto",
    venue: "Edwards Gardens / Toronto Botanical Garden",
    description: "Manicured gardens that spill into wild Don River ravine trails — stroller-friendly paths, a teaching garden, and free entry.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Edwards Gardens Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-tommy-thompson-park',
    title: "Bike the Leslie Street Spit to the lighthouse",
    category: 'general',
    tags: ['bike', 'nature', 'birdwatching', 'lighthouse', 'free', 'water', 'trail'],
    location: "Port Lands, Toronto",
    venue: "Tommy Thompson Park",
    description: "A car-free 5 km spit jutting into Lake Ontario — cormorant colonies, skyline views and a lighthouse at the end. Weekends only.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Tommy Thompson Park Toronto'),
    wow: true, seasonal: null
  },

  // ---------- Food & patios ----------
  {
    id: 'cur-st-lawrence-market',
    title: "St. Lawrence Market food crawl",
    category: 'food',
    tags: ['market', 'food', 'peameal', 'lunch', 'foodie', 'historic'],
    location: "Old Toronto",
    venue: "St. Lawrence Market",
    description: "The classic: a peameal bacon sandwich at Carousel Bakery, then graze the lower-level cheese and pastry stalls. Closed Mondays.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('St Lawrence Market Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-stackt-market',
    title: "stackt market — shipping-container food yard",
    category: 'food',
    tags: ['market', 'food', 'beer', 'patio', 'containers', 'games', 'casual'],
    location: "Bathurst & Front, Toronto",
    venue: "stackt market",
    description: "A village of shipping containers with rotating food vendors, a brewery, lawn games and free events — casual enough for kids in tow.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('stackt market Toronto'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-pacific-mall-food',
    title: "Pacific Mall food adventure",
    category: 'food',
    tags: ['food', 'asian', 'bubble tea', 'market', 'indoor', 'rainy day', 'teens'],
    location: "Markham",
    venue: "Pacific Mall",
    description: "North America's largest indoor Asian mall — snack-hop from bubble tea to egg waffles to hand-pulled noodles without repeating a cuisine.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Pacific Mall Markham'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-unionville-main-street',
    title: "Main Street Unionville ice-cream stroll",
    category: 'food',
    tags: ['ice cream', 'historic', 'walk', 'dessert', 'pond', 'date', 'stroller'],
    location: "Unionville, Markham",
    venue: "Main Street Unionville",
    description: "A storybook 19th-century main street — Old Firehall Confectionery sweets, the duck pond, and the boardwalk at Toogood Pond.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Main Street Unionville Markham'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-night-markets',
    title: "Asian night-market food fests (summer weekends)",
    category: 'food',
    tags: ['night market', 'food', 'street food', 'festival', 'evening', 'summer'],
    location: "Markham / Richmond Hill",
    venue: "Night It Up! and TT Night Market sites",
    description: "Taiwanese-style night markets pop up across York Region in summer — stinky tofu, skewers, and carnival games after dark.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Night It Up Markham night market'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-amsterdam-brewhouse',
    title: "Amsterdam BrewHouse lakefront patio",
    category: 'patios',
    tags: ['patio', 'beer', 'brewery', 'lakefront', 'view', 'family', 'summer'],
    location: "Harbourfront, Toronto",
    venue: "Amsterdam BrewHouse",
    description: "600 seats of lakeside patio with its own brewery — kid-friendly before evening, and the boardwalk is right there for a post-meal walk.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Amsterdam BrewHouse Toronto'),
    wow: false, seasonal: 'summer'
  }
];
