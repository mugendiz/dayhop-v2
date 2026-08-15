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
//   new_until    'YYYY-MM-DD' — badge/shelf expiry (default opened_at + 120d
//                here, + 60d for autopilot entries)
//   lat / lng    optional inline coordinates; entries without them get
//                coords from data/catalogCoords.json (scripts/geocode-catalog.js)
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
  {
    // Verified 2026-07-25 via rcparadise.ca: 243 Eglinton Ave W, Tue-Sun
    // 12-8, drift track + rock crawlers + RC construction machines.
    id: 'cur-rc-paradise',
    title: "RC Paradise — indoor remote-control playground",
    category: 'kids',
    tags: ['rc', 'remote', 'control', 'cars', 'trucks', 'drift', 'racing', 'rock', 'crawler', 'construction', 'diggers', 'indoor', 'rainy', 'kids', 'family', 'birthday', 'vehicles'],
    location: "Eglinton West, Toronto",
    venue: "RC Paradise",
    description: "Indoor RC playground — drive drift cars, rock crawlers, and real working RC diggers on custom tracks. No experience needed; little vehicle fans lose their minds here.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('RC Paradise 243 Eglinton Ave W Toronto'),
    booking_url: 'https://rcparadise.ca/experiences/',
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
  },

  // ---------- Trails (discovery-optimization content sprint, 2026-08-11) ----------
  {
    id: 'cur-dundas-peak',
    title: "Dundas Peak & Tews Falls — the fall-colours lookout",
    category: 'general',
    tags: ['trail', 'hike', 'lookout', 'waterfall', 'fall colours', 'escarpment', 'photo'],
    location: "Spencer Gorge, Hamilton",
    venue: "Spencer Gorge Conservation Area",
    description: "The trail past Tews Falls (Ontario's tallest ribbon waterfall) up to the cliff-edge lookout over Dundas Valley. Reserve ahead in leaf season — it's THE fall hike.",
    cost_tier: '$', good_for_ages: '6+',
    maps_url: mapsSearch('Dundas Peak Spencer Gorge Hamilton'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-mono-cliffs',
    title: "Mono Cliffs — crevice caves and a treetop lookout",
    category: 'general',
    tags: ['trail', 'hike', 'cliffs', 'lookout', 'provincial park', 'forest', 'fall colours'],
    location: "Mono, near Orangeville",
    venue: "Mono Cliffs Provincial Park",
    description: "Escarpment cliffs split by cool mossy crevices you walk through, a metal viewing platform level with the canopy, and quiet kettle lakes. Under an hour from the GTA.",
    cost_tier: '$', good_for_ages: '6+',
    maps_url: mapsSearch('Mono Cliffs Provincial Park'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-forks-credit',
    title: "Forks of the Credit — waterfall, kettle lakes, hills",
    category: 'general',
    tags: ['trail', 'hike', 'waterfall', 'river', 'provincial park', 'fall colours', 'picnic'],
    location: "Caledon",
    venue: "Forks of the Credit Provincial Park",
    description: "Rolling bald hills, a kettle lake, and the Cataract Falls ruins where the Credit River drops through a gorge. The loop trail fits a morning perfectly.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Forks of the Credit Provincial Park'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-hilton-falls',
    title: "Hilton Falls — the waterfall you can stand behind",
    category: 'general',
    tags: ['trail', 'hike', 'waterfall', 'conservation', 'bike', 'mill ruins'],
    location: "Milton",
    venue: "Hilton Falls Conservation Area",
    description: "A 10 m curtain waterfall over old mill ruins — the ledge lets you walk in behind the falling water. 30+ km of hiking and mountain-bike trails around it.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Hilton Falls Conservation Area Milton'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-cheltenham-badlands',
    title: "Cheltenham Badlands — Mars-red hills an hour away",
    category: 'general',
    tags: ['badlands', 'lookout', 'photo', 'boardwalk', 'trail', 'geology', 'fall colours'],
    location: "Caledon",
    venue: "Cheltenham Badlands",
    description: "Bare, rippled red-shale hills that look airlifted from another planet. Boardwalk viewing, Bruce Trail access next door, and unbeatable golden-hour photos.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Cheltenham Badlands Caledon'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-rouge-vista',
    title: "Rouge National Urban Park — Vista Trail & marsh boardwalk",
    category: 'general',
    tags: ['trail', 'hike', 'national park', 'lookout', 'marsh', 'free', 'beach'],
    location: "Rouge Valley, Scarborough",
    venue: "Rouge National Urban Park",
    description: "Canada's first national urban park, free with no reservations — the Vista Trail lookout over the Rouge marsh, plus a swimmable beach where the river meets the lake.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Vista Trail Rouge National Urban Park'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-doris-mccarthy',
    title: "Doris McCarthy Trail — a ravine down to the Bluffs shore",
    category: 'general',
    tags: ['trail', 'hike', 'bluffs', 'waterfront', 'ravine', 'free', 'quiet'],
    location: "Scarborough",
    venue: "Doris McCarthy Trail",
    description: "A ravine path that drops you at the base of the Scarborough Bluffs on a wild stretch of shoreline most of the city has never seen. Free, and rarely busy on weekdays.",
    cost_tier: 'free', good_for_ages: '6+',
    maps_url: mapsSearch('Doris McCarthy Trail Scarborough'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-limehouse',
    title: "Limehouse — ladders through the 'Hole in the Wall' crevices",
    category: 'general',
    tags: ['trail', 'hike', 'bruce trail', 'crevice', 'ladder', 'kiln ruins', 'adventure'],
    location: "Halton Hills",
    venue: "Limehouse Conservation Area",
    description: "The Bruce Trail drops through limestone crevices on wooden ladders past 19th-century kiln ruins — a real mini-adventure kids talk about for weeks.",
    cost_tier: 'free', good_for_ages: '6+',
    maps_url: mapsSearch('Limehouse Conservation Area'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-mount-nemo',
    title: "Mount Nemo — cliff lookouts with soaring turkey vultures",
    category: 'general',
    tags: ['trail', 'hike', 'cliffs', 'lookout', 'escarpment', 'fall colours'],
    location: "Burlington",
    venue: "Mount Nemo Conservation Area",
    description: "Sheer escarpment cliffs where turkey vultures ride the updrafts at eye level. On a clear day the lookout reads the CN Tower on the horizon.",
    cost_tier: '$', good_for_ages: '8+',
    maps_url: mapsSearch('Mount Nemo Conservation Area Burlington'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-seaton-trail',
    title: "Seaton Hiking Trail — 13 km of river valley in Pickering",
    category: 'general',
    tags: ['trail', 'hike', 'river', 'forest', 'free', 'quiet'],
    location: "Pickering",
    venue: "Seaton Hiking Trail",
    description: "West Duffins Creek valley singletrack through forest and meadow — one of the GTA's longest continuous trails, and somehow still a local secret. Free.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Seaton Hiking Trail Pickering'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-bronte-creek',
    title: "Bronte Creek — ravine trails plus a children's farm",
    category: 'general',
    tags: ['trail', 'hike', 'provincial park', 'farm', 'kids', 'picnic', 'pool'],
    location: "Oakville",
    venue: "Bronte Creek Provincial Park",
    description: "A deep ravine rim trail, a play barn and children's farm, and a giant outdoor pool in summer — the rare park that satisfies hikers and toddlers on the same visit.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Bronte Creek Provincial Park Oakville'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-lions-valley',
    title: "Lion's Valley Park — the Sixteen Mile Creek gorge",
    category: 'general',
    tags: ['trail', 'hike', 'gorge', 'river', 'free', 'stairs', 'fall colours'],
    location: "Oakville",
    venue: "Lion's Valley Park",
    description: "Oakville's hidden gorge: staircases down into a wooded valley where Sixteen Mile Creek bends under 30 m bluffs. Free, and spectacular in October.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch("Lion's Valley Park Oakville"),
    wow: false, seasonal: null
  },
  {
    id: 'cur-durham-forest-trails',
    title: "Durham Regional Forest — the GTA's trail capital",
    category: 'general',
    tags: ['trail', 'hike', 'forest', 'mountain bike', 'free', 'snowshoe'],
    location: "Uxbridge",
    venue: "Durham Regional Forest",
    description: "Uxbridge calls itself the Trail Capital of Canada and this pine forest is why — dozens of km of hiking and MTB singletrack, free, gorgeous under snow too.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Durham Regional Forest Uxbridge'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-kortright',
    title: "Kortright Centre — forest trails and the March sugar bush",
    category: 'general',
    tags: ['trail', 'hike', 'forest', 'maple syrup', 'sugar bush', 'kids', 'birdwatching'],
    location: "Vaughan",
    venue: "Kortright Centre for Conservation",
    description: "16 km of forest and meadow trails 10 minutes from Canada's Wonderland — and in March the whole place becomes a working sugar bush with pancakes.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Kortright Centre for Conservation Vaughan'),
    wow: false, seasonal: null
  },

  // ---------- Outdoor winter (content sprint) ----------
  {
    id: 'cur-bentway-skate',
    title: "The Bentway — skating under the Gardiner",
    category: 'general',
    tags: ['skating', 'ice', 'winter', 'free', 'art', 'downtown'],
    location: "Fort York, Toronto",
    venue: "The Bentway Skate Trail",
    description: "A figure-8 skate trail wrapped around the Gardiner's concrete pillars, with art installations and skate rentals on site. Free admission, city-weird, wonderful at night.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('The Bentway Skate Trail Toronto'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-nathan-phillips-skate',
    title: "Nathan Phillips Square rink under the Toronto sign",
    category: 'general',
    tags: ['skating', 'ice', 'winter', 'free', 'downtown', 'landmark'],
    location: "City Hall, Toronto",
    venue: "Nathan Phillips Square",
    description: "The classic: skating laps under the glowing TORONTO sign with City Hall's curves overhead. Free ice, cheap rentals, open into the evening.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Nathan Phillips Square skating rink'),
    wow: false, seasonal: 'winter'
  },
  {
    id: 'cur-sam-smith-skate',
    title: "Colonel Sam Smith — the lakeside figure-8 skating trail",
    category: 'general',
    tags: ['skating', 'ice trail', 'winter', 'free', 'lakefront', 'quiet'],
    location: "Etobicoke",
    venue: "Colonel Samuel Smith Park",
    description: "Toronto's first skating TRAIL — a 250 m figure-8 through the trees by the lake. Less crowded than downtown ice and prettier after a snowfall.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Colonel Samuel Smith Park skating trail'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-arrowhead-ice-trail',
    title: "Arrowhead's torch-lit ice trail — worth the drive",
    category: 'general',
    tags: ['skating', 'ice trail', 'winter', 'forest', 'torch night', 'provincial park', 'tubing'],
    location: "Huntsville, Muskoka",
    venue: "Arrowhead Provincial Park",
    description: "A 1.3 km skating trail winding through snowy forest, lit by tiki torches on Fire & Ice nights. Ontario's most magical winter outing — book the day pass early.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Arrowhead Provincial Park ice skating trail'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-scenic-caves-snowshoe',
    title: "Scenic Caves — snowshoe to a 25 m suspension bridge",
    category: 'general',
    tags: ['snowshoe', 'winter', 'caves', 'suspension bridge', 'lookout', 'georgian bay'],
    location: "Blue Mountains, Collingwood",
    venue: "Scenic Caves Nordic Centre",
    description: "Snowshoe groomed forest trails at the top of the escarpment, cross a 25 m high suspension bridge, and look out over frozen Georgian Bay.",
    cost_tier: '$$', good_for_ages: '6+',
    maps_url: mapsSearch('Scenic Caves Nordic Centre Blue Mountains'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-albion-hills-winter',
    title: "Albion Hills — cross-country ski and snowshoe close to home",
    category: 'general',
    tags: ['cross-country ski', 'snowshoe', 'winter', 'conservation', 'rentals', 'fat bike'],
    location: "Caledon",
    venue: "Albion Hills Conservation Park",
    description: "50 km of groomed XC ski trails, snowshoe loops, and fat-bike rentals 45 minutes from the city — the easiest way to try Nordic skiing without a Muskoka drive.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Albion Hills Conservation Park ski'),
    wow: false, seasonal: 'winter'
  },
  {
    id: 'cur-distillery-winter-village',
    title: "Distillery Winter Village — lights, stalls, and cocoa",
    category: 'culture',
    tags: ['christmas', 'holiday market', 'lights', 'winter', 'festive', 'shopping', 'evening'],
    location: "Distillery District, Toronto",
    venue: "The Distillery Winter Village",
    description: "The cobblestone lanes go full storybook: a giant tree, light canopies, craft stalls, and mulled everything. Weekends ticketed at peak — weeknights are calmer.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Distillery Winter Village Toronto'),
    wow: true, seasonal: 'winter'
  },
  {
    id: 'cur-horseshoe-tubing',
    title: "Horseshoe Resort snow tubing — big hills, zero skill",
    category: 'adventures',
    tags: ['snow tubing', 'winter', 'tubing', 'hills', 'family', 'adrenaline'],
    location: "Oro-Medonte, near Barrie",
    venue: "Horseshoe Resort",
    description: "Lift-served tubing lanes — the fun of a ski hill with zero learning curve. Two-hour sessions; book the first slot for the emptiest lanes.",
    cost_tier: '$$', good_for_ages: '4+',
    maps_url: mapsSearch('Horseshoe Resort snow tubing'),
    wow: false, seasonal: 'winter'
  },

  // ---------- Adventure (content sprint) ----------
  {
    id: 'cur-toronto-archery-range',
    title: "Toronto's free public archery range in E.T. Seton Park",
    category: 'adventures',
    tags: ['archery', 'arrow', 'free', 'outdoor', 'target', 'unique'],
    location: "E.T. Seton Park, Toronto",
    venue: "Toronto Public Archery Range",
    description: "A real outdoor archery range in a Don Valley park — free, first-come, open dawn to dusk. Bring or rent gear; beginners welcome next to serious longbow folks.",
    cost_tier: 'free', good_for_ages: '10+',
    maps_url: mapsSearch('Toronto Archery Range E.T. Seton Park'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-treetop-brampton',
    title: "Treetop Trekking Brampton — ziplines over Heart Lake",
    category: 'adventures',
    tags: ['zipline', 'treetop', 'ropes course', 'climbing', 'lake', 'adrenaline', 'kids'],
    location: "Heart Lake Conservation Park, Brampton",
    venue: "Treetop Trekking Brampton",
    description: "Aerial courses in the Heart Lake canopy with ziplines that send you right out over the water. Kids' Treewalk from age 5; big courses run 3+ hours.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Treetop Trekking Brampton Heart Lake'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-crothers-woods',
    title: "Crothers Woods — real mountain biking inside the city",
    category: 'adventures',
    tags: ['mountain bike', 'trail', 'bike', 'don valley', 'free', 'singletrack', 'hike'],
    location: "Don Valley, Toronto",
    venue: "Crothers Woods",
    description: "10+ km of flowy, maintained singletrack in the lower Don — berms, rooty climbs, and skills features, all reachable by TTC. Hikers welcome on the same network.",
    cost_tier: 'free', good_for_ages: '10+',
    maps_url: mapsSearch('Crothers Woods Toronto'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-dagmar-mtb',
    title: "Dagmar — the north Durham singletrack network",
    category: 'adventures',
    tags: ['mountain bike', 'bike', 'singletrack', 'forest', 'trail'],
    location: "Uxbridge",
    venue: "Dagmar North Trails",
    description: "Fast, twisty singletrack through hardwood forest on the Oak Ridges Moraine — the trail network GTA riders graduate to after Crothers Woods.",
    cost_tier: 'free', good_for_ages: '12+',
    maps_url: mapsSearch('Dagmar North mountain bike trails Uxbridge'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-hardwood-bike',
    title: "Hardwood Ski and Bike — Olympic-calibre trails year-round",
    category: 'adventures',
    tags: ['mountain bike', 'bike', 'cross-country ski', 'winter', 'rentals', 'lessons'],
    location: "Oro-Medonte, near Barrie",
    venue: "Hardwood Ski and Bike",
    description: "The 2015 Pan Am MTB venue: machine-groomed singletrack all summer, then Ontario's best cross-country ski trails all winter. Rentals and lessons for both.",
    cost_tier: '$$', good_for_ages: '8+',
    maps_url: mapsSearch('Hardwood Ski and Bike Oro-Medonte'),
    wow: false, seasonal: null
  },
  {
    id: 'cur-goodwood-karts',
    title: "Goodwood Kartways — outdoor racing karts at speed",
    category: 'adventures',
    tags: ['karting', 'go-kart', 'racing', 'outdoor', 'adrenaline'],
    location: "Stouffville",
    venue: "Goodwood Kartways",
    description: "Canada's oldest kart track — real outdoor racing karts on a 1 km road course, quicker and rawer than any indoor electric setup. Arrive-and-drive sessions daily.",
    cost_tier: '$$', good_for_ages: '10+',
    maps_url: mapsSearch('Goodwood Kartways Stouffville'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-sgt-splatters',
    title: "Sgt. Splatter's — indoor paintball any day of the year",
    category: 'adventures',
    tags: ['paintball', 'indoor', 'adrenaline', 'group', 'rainy'],
    location: "North York, Toronto",
    venue: "Sgt. Splatter's Project Paintball",
    description: "A 50,000 sq ft indoor paintball field built like a movie set — urban props, fog, and low-impact rentals for first-timers. Weather-proof adrenaline.",
    cost_tier: '$$', good_for_ages: '10+',
    maps_url: mapsSearch("Sgt Splatter's paintball Toronto"),
    wow: false, seasonal: null
  },

  // ---------- Day-trip icons (ontario-summer content sprint, 2026-08-15) ----------
  // Classic Ontario summer destinations within day-trip range of the GTA.
  // WildPlay 2026 operation and Ontario Place closures verified 2026-08-15;
  // Ontario Place skipped — West Island/marina closed for construction,
  // Trillium Park already covered above.
  {
    id: 'cur-niagara-falls-boat',
    title: "Voyage to the Falls — the boat into the Horseshoe mist",
    category: 'cruises',
    tags: ['niagara', 'falls', 'boat tour', 'falls boat', 'mist', 'horseshoe falls', 'summer', 'family', 'wow'],
    location: "Niagara Falls",
    venue: "Niagara City Cruises",
    description: "The pink-poncho boat that noses right into the Horseshoe Falls basin — 20 minutes of roar and spray. Book the first sailing or after 6pm to skip the longest lines.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Niagara City Cruises Niagara Falls'),
    booking_url: 'https://www.cityexperiences.com/niagara-ca/city-cruises/niagara/',
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-journey-behind-falls',
    title: "Journey Behind the Falls — tunnels under the Horseshoe",
    category: 'general',
    tags: ['niagara', 'falls', 'tunnels', 'observation deck', 'waterfall', 'rainy', 'family'],
    location: "Niagara Falls",
    venue: "Niagara Parks — Journey Behind the Falls",
    description: "130-year-old tunnels through the bedrock to portals directly behind the falling water, plus a lower deck in the spray. Works rain or shine, any month of the year.",
    cost_tier: '$$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Journey Behind the Falls Niagara Parks'),
    booking_url: 'https://www.niagaraparks.com/visit/attractions/journey-behind-the-falls/',
    wow: true, seasonal: null
  },
  {
    id: 'cur-wildplay-mistrider-zipline',
    title: "MistRider Zipline — 670 m along the gorge to the falls",
    category: 'adventures',
    tags: ['zipline', 'niagara', 'falls', 'gorge', 'adrenaline', 'summer'],
    location: "Niagara Falls",
    venue: "WildPlay Niagara",
    description: "Four side-by-side lines send you 670 m down the Niagara gorge rim to the falls observation landing at 70+ km/h. Riders from age 7; night illumination flights in summer.",
    cost_tier: '$$', good_for_ages: '7+',
    maps_url: mapsSearch('WildPlay MistRider Zipline Niagara Falls'),
    booking_url: 'https://www.wildplay.com/niagara-falls/',
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-niagara-parkway-drive',
    title: "Niagara Parkway — the river road from NOTL to the falls",
    category: 'general',
    tags: ['scenic drive', 'niagara', 'parkway', 'river', 'floral clock', 'botanical gardens', 'picnic', 'free'],
    location: "Niagara-on-the-Lake to Niagara Falls",
    venue: "Niagara Parkway",
    description: "Follow the river road past the floral clock, botanical gardens, whirlpool lookouts, and fruit stands. Free parking pull-offs the whole way — pack a picnic and wander.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Niagara Parkway scenic drive'),
    wow: true, seasonal: null
  },
  {
    id: 'cur-wasaga-beach',
    title: "Wasaga Beach — the world's longest freshwater beach",
    category: 'water',
    tags: ['beach', 'swim', 'sand', 'georgian bay', 'wasaga', 'sunset', 'summer', 'family'],
    location: "Wasaga Beach, Georgian Bay",
    venue: "Wasaga Beach Provincial Park (Beach Area 1)",
    description: "Shallow, warm Georgian Bay water off a sandbar that runs 14 km — the world's longest freshwater beach. Buy the daily vehicle permit online before you drive up.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Wasaga Beach Provincial Park Beach Area 1'),
    booking_url: 'https://reservations.ontarioparks.ca/',
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-scenic-caves-summer',
    title: "Scenic Caves — caverns and a 25 m suspension bridge up top",
    category: 'adventures',
    tags: ['caves', 'cavern', 'suspension bridge', 'lookout', 'georgian bay', 'hike', 'treetop walk', 'summer', 'family'],
    location: "Blue Mountains, Collingwood",
    venue: "Scenic Caves Nature Adventures",
    description: "Squeeze through escarpment caves 300 m above Georgian Bay, then cross southern Ontario's longest suspension footbridge for the view. Caves stay cool on the hottest days.",
    cost_tier: '$$', good_for_ages: '5+',
    maps_url: mapsSearch('Scenic Caves Nature Adventures Collingwood'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-blue-mountain-summer',
    title: "Blue Mountain in summer — coaster, gondola, open-air village",
    category: 'adventures',
    tags: ['mountain coaster', 'ridge runner', 'blue mountain', 'village', 'gondola', 'collingwood', 'summer', 'family'],
    location: "The Blue Mountains, Collingwood",
    venue: "Blue Mountain Resort",
    description: "Ride the Ridge Runner coaster down the escarpment, take the open gondola back up, and land in the pedestrian village for patios and live music. Book coaster times online.",
    cost_tier: '$$', good_for_ages: '3+',
    maps_url: mapsSearch('Blue Mountain Village Collingwood'),
    booking_url: 'https://www.bluemountain.ca/',
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-sandbanks-beach',
    title: "Sandbanks — dunes and warm shallows in the County",
    category: 'water',
    tags: ['beach', 'dunes', 'sandbanks', 'prince edward county', 'swim', 'provincial park', 'summer'],
    location: "Prince Edward County",
    venue: "Sandbanks Provincial Park",
    description: "The world's largest baymouth sand dune system: climb the dunes, then float in warm, waist-deep Lake Ontario shallows. Reserve day-use on ontarioparks.ca — it sells out.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Sandbanks Provincial Park'),
    booking_url: 'https://reservations.ontarioparks.ca/',
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-cobourg-beach',
    title: "Cobourg Beach — the boardwalk beach an hour east",
    category: 'water',
    tags: ['beach', 'cobourg', 'sand', 'boardwalk', 'pier', 'family', 'summer', 'free'],
    location: "Cobourg",
    venue: "Cobourg Beach",
    description: "A clean sandy crescent with a Victorian boardwalk, splash pad, and walkable pier — the easiest real-beach-town day from the eastern GTA. Arrive before 11 on weekends.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Cobourg Beach Victoria Park'),
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-warsaw-caves',
    title: "Warsaw Caves — crawl seven limestone caves, swim after",
    category: 'adventures',
    tags: ['caves', 'kettles', 'hike', 'conservation', 'swim', 'peterborough', 'kawarthas', 'summer'],
    location: "Warsaw, near Peterborough",
    venue: "Warsaw Caves Conservation Area",
    description: "Seven wild limestone caves you explore with your own flashlight, plus glacial kettles and a river beach to rinse off. Closed in winter for hibernating bats — summer only.",
    cost_tier: '$', good_for_ages: '8+',
    maps_url: mapsSearch('Warsaw Caves Conservation Area'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-algonquin-canoe-day',
    title: "Canoe Lake day trip — paddle Algonquin and be home by dark",
    category: 'water',
    tags: ['canoe', 'algonquin', 'provincial park', 'lake', 'portage', 'moose', 'paddle', 'summer'],
    location: "Algonquin Provincial Park, Hwy 60",
    venue: "Canoe Lake access point, Algonquin Park",
    description: "Rent a canoe right on Canoe Lake and paddle Tom Thomson's lake past loons and quiet moose bays. The far edge of a day trip: leave the GTA by 7 and you're home by dark.",
    cost_tier: '$$', good_for_ages: '8+',
    maps_url: mapsSearch('Canoe Lake access point Algonquin Park'),
    wow: true, seasonal: 'summer'
  },
  {
    id: 'cur-arrowhead-summer',
    title: "Arrowhead in summer — Stubbs Falls, lake beaches, easy canoes",
    category: 'general',
    tags: ['provincial park', 'muskoka', 'waterfall', 'stubbs falls', 'canoe', 'beach', 'hike', 'huntsville', 'summer'],
    location: "Huntsville, Muskoka",
    venue: "Arrowhead Provincial Park",
    description: "The ice-trail park is a quiet Muskoka classic in July: hike to Stubbs Falls, swim off sandy lake beaches, rent a canoe on Mayflower Lake. Calmer than Algonquin's corridor.",
    cost_tier: '$', good_for_ages: 'all ages',
    maps_url: mapsSearch('Arrowhead Provincial Park Huntsville'),
    booking_url: 'https://reservations.ontarioparks.ca/',
    wow: false, seasonal: 'summer'
  },
  {
    id: 'cur-forks-credit-drive',
    title: "Forks of the Credit Road — the GTA's own hairpin drive",
    category: 'general',
    tags: ['scenic drive', 'caledon', 'forks of the credit', 'hairpin', 'waterfall', 'belfountain', 'ice cream', 'free'],
    location: "Caledon",
    venue: "Forks of the Credit Road",
    description: "A one-lane hairpin switchback down the Credit valley, Belfountain's general store at one end and Cataract Falls at the other. 40 minutes out; add the park loop trail.",
    cost_tier: 'free', good_for_ages: 'all ages',
    maps_url: mapsSearch('Forks of the Credit Road Caledon'),
    wow: true, seasonal: null
  }
];
