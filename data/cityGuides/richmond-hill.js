// Richmond Hill Nature Guide — authored content. Stable facts only; every
// entry links out to Google Maps for live hours/closures.

module.exports = {
  intro:
    'Richmond Hill sits on the Oak Ridges Moraine — the sandy, spring-fed ridge that feeds half the rivers in the ' +
    'GTA — and it shows: kettle lakes that predate the last ice age\'s retreat, cold-water creeks, and forest tracts ' +
    'that feel far older than the subdivisions beside them. This guide runs from the moraine lakes in the north to ' +
    'the mill pond that gave the old village its social centre, with the connecting trails locals actually use.',

  spots: [
    {
      name: 'Lake Wilcox Park',
      area: 'Oak Ridges, north Richmond Hill',
      why: 'The biggest kettle lake on the Oak Ridges Moraine, with a polished waterfront park: boardwalk stretches, a lakeside promenade, splash pad, and real open-water views. The closest thing to cottage-country shoreline inside York Region.',
      tip: 'Sunset from the west-side boardwalk is the town\'s best free show; parking fills on summer weekends.',
      best: 'Summer evenings', ages: 'all ages', cost: 'FREE', access: 'Free lots — busy on summer weekends · washrooms in park · paved promenade', maps: 'Lake Wilcox Park Richmond Hill',
      amen: { lot: 2, wash: 2, play: 2, shade: 1, picnic: 2, wheels: 2, water: 2, fish: 2, transit: 1 },
      // The Wilcox Pages: the anchor place's every use, in one spread.
      flagship: [
        { t: 'The shores', x: 'Three parks share the lake — Wilcox Park\'s promenade, Sunset Beach\'s sandy corner on the north side, and David Hamilton Park\'s quiet south waterfront. Hop them for three moods of the same water.' },
        { t: 'The paddle', x: 'Quiet, non-motorized-friendly water: a calm hour by canoe, kayak, or board along forested shoreline, with loon sightings if you launch early. Carry-in logistics are posted at the park; mornings beat the afternoon breeze.' },
        { t: 'The cast', x: 'A genuine bass lake inside town limits — work the drop-offs early season from the shore nodes by the park lots, or from anything that floats. Licence in pocket; ontario.ca has the zone rules.' },
        { t: 'The sunset', x: 'Twenty minutes before sundown, west-side boardwalk. That\'s the whole recipe — the town\'s best free show, coffee in hand.' }
      ]
    },
    {
      name: 'Oak Ridges Corridor Conservation Reserve',
      area: 'Bathurst to Yonge, Oak Ridges',
      why: 'A protected moraine corridor of rolling forest, ponds, and meadow with a well-marked trail network — the wildest continuous walking in Richmond Hill. Deer, owls, and in spring an amphibian chorus from every wet hollow.',
      tip: 'The Bond Lake side (off Yonge) gives the fastest route into deep forest.',
      best: 'Spring for the frog chorus; fall for colour', ages: 'all ages', cost: 'FREE', access: 'Trailhead lots off Yonge & Bathurst · no facilities · dirt trails', maps: 'Oak Ridges Corridor Conservation Reserve',
      amen: { lot: 2, shade: 2, water: 1, transit: 1 }
    },
    {
      name: 'Mill Pond Park',
      area: 'Mill St, central Richmond Hill',
      why: 'The old village\'s heart: a willow-ringed pond with a looping path, footbridges, and swans that consider themselves residents. Concerts and festivals land here in season; on ordinary mornings it\'s all ducks and dog-walkers.',
      tip: 'Combine with the heritage streets just east for a full unhurried morning; freeze-up and first-green are the two postcard weeks.',
      best: 'All four seasons', ages: 'all ages', cost: 'FREE', access: 'Free lot + street · washrooms in season · stroller-friendly loop', maps: 'Mill Pond Park Richmond Hill',
      amen: { lot: 2, wash: 1, play: 1, shade: 1, picnic: 2, wheels: 2, water: 2, fish: 2, transit: 2 }
    },
    {
      name: 'Phyllis Rawlinson Park',
      area: 'Leslie St north of 19th Ave',
      why: 'A former farm left to the town, kept half-wild: rolling meadow paths, a treed creek hollow, and heritage farm buildings. Off-leash hours in its dog area make it a local institution, but the walking stands on its own.',
      tip: 'The meadow loop at golden hour, when the hawks hunt, is the picture.',
      best: 'Late summer meadows', ages: 'all ages', cost: 'FREE', access: 'Free lot · washrooms near lot · grass and gravel paths', maps: 'Phyllis Rawlinson Park Richmond Hill',
      amen: { lot: 2, wash: 1, shade: 1, picnic: 1, wheels: 1, water: 1 }
    },
    {
      name: 'Jefferson Forest',
      area: 'Bayview Ave north of Stouffville Rd',
      why: 'Tall pine-and-hardwood forest on moraine hills with a genuine trail-network feel — switchbacks, ridgelines, and quiet you don\'t expect a block off Bayview. A favourite of trail runners and winter hikers.',
      tip: 'Trails braid confusingly; keep the sun or a maps app oriented and enjoy being slightly lost.',
      best: 'Winter snow-hikes, fall colour', ages: '6+', cost: 'FREE', access: 'Small roadside lots · no facilities · rooty dirt trails', maps: 'Jefferson Forest Richmond Hill',
      amen: { lot: 1, shade: 2 }
    },
    {
      name: 'Saigeon Trail & German Mills Creek headwaters',
      area: 'East Richmond Hill, off Leslie',
      why: 'A ravine trail following the creek\'s upper reaches through cattail wetlands and reforested slopes — red-winged blackbirds, herons, and long boardwalk sections over the wet bits.',
      tip: 'Walk it north-to-south and exit near a plaza lunch; the trail rewards one-way plans.',
      best: 'Spring bird season', ages: 'all ages', cost: 'FREE', access: 'Neighbourhood parking · boardwalk & gravel · stroller ok', maps: 'Saigeon Trail Richmond Hill',
      amen: { lot: 1, shade: 1, wheels: 2, water: 1, transit: 1 }
    },
    {
      name: 'Bond Lake',
      area: 'Yonge St, Oak Ridges',
      why: 'A deep, moody kettle lake wrapped in forest right off Yonge Street — the viewing points along the corridor reserve trails feel found rather than built. One of the moraine\'s signature waters.',
      tip: 'No formal beach; this one is about the walk and the view, not the swim.',
      best: 'Misty fall mornings', ages: 'all ages', cost: 'FREE', access: 'Corridor trailhead parking · no facilities · natural paths', maps: 'Bond Lake Oak Ridges',
      amen: { lot: 1, shade: 2, water: 2 }
    },
    {
      name: 'Pioneer Park & the Rouge headwaters',
      area: 'Major Mackenzie at Bayview',
      why: 'Where the Rouge River begins as a cold trickle: a treed park with creekside paths and enough frog-and-minnow action to hold any child\'s attention indefinitely.',
      tip: 'Bring rubber boots for the young field team.',
      best: 'Late spring', ages: 'all ages', cost: 'FREE', access: 'Free lot · playground washrooms in season · easy paths', maps: 'Pioneer Park Richmond Hill',
      amen: { lot: 2, wash: 1, play: 2, shade: 2, picnic: 1, wheels: 1, water: 1, transit: 1 }
    },
    {
      name: 'Richmond Green trails',
      area: 'Leslie St at Elgin Mills',
      why: 'Beyond the sports fields, the park\'s east side runs into naturalized meadow and pond habitat with flat, open paths — an easy big-sky walk with reliable killdeer and swallows in summer.',
      tip: 'Winter: the park\'s outdoor rink pairs with a cold-air walk perfectly.',
      best: 'Summer evenings', ages: 'all ages', cost: 'FREE', access: 'Big free lots · washrooms at complex · flat paved paths · transit ok', maps: 'Richmond Green Richmond Hill',
      amen: { lot: 2, wash: 2, play: 2, picnic: 2, wheels: 2, water: 1, transit: 2 }
    },
    {
      name: 'Beaver Creek / Elgin Mills Greenway',
      area: 'West Richmond Hill',
      why: 'A linear greenway stitching neighbourhoods along the creek — mature willows, footbridges, and the kind of everyday nature that makes a daily-walk habit stick.',
      tip: 'A good bike spine: flat, connected, and away from arterials.',
      best: 'Any green month', ages: 'all ages', cost: 'FREE', access: 'Street parking · paved throughout · all wheels', maps: 'Elgin Mills Greenway Richmond Hill',
      amen: { lot: 1, shade: 1, wheels: 2, water: 1, transit: 2 }
    },
    {
      name: 'Hunters Point Wildlife Sanctuary edge trails',
      area: 'Oak Ridges, west of Bayview',
      why: 'Quiet moraine-forest paths skirting protected wetland where the town keeps its wildest residents — trilliums in May, and the least-trafficked walking in this guide.',
      tip: 'Stay on the marked edge trails; the sanctuary core is habitat, not a shortcut.',
      best: 'Trillium season (May)', ages: 'all ages', cost: 'FREE', access: 'Street-end parking · no facilities · quiet dirt paths', maps: 'Hunters Point Richmond Hill trails',
      amen: { lot: 1, shade: 2 }
    }
  ],

  drives: [
    {
      name: 'Kortright Centre for Conservation',
      area: 'Pine Valley Dr, Vaughan (20 min)',
      why: 'A full conservation campus: forest trails, a maple-syrup operation in early spring, raptor and sustainability programs — the moraine explained, not just walked.',
      tip: 'Entry fees apply; event weekends (syrup festival) book up — check the site first.',
      best: 'Maple syrup season (Mar–Apr)', ages: 'all ages', cost: '$$', access: 'Lot on site (fee) · washrooms at centre · groomed trails', maps: 'Kortright Centre for Conservation'
    },
    {
      name: 'York Regional Forest — Hollidge & Eldred King tracts',
      area: 'Hwy 48 corridor, Whitchurch-Stouffville (20 min)',
      why: 'Century-old reforestation tracts with wide sandy trails under cathedral pines — flat, endless-feeling, and gorgeous in every season. The classic York Region forest walk.',
      tip: 'Eldred King\'s red-pine rows are the photogenic ones.',
      best: 'Winter hikes, summer shade', ages: 'all ages', cost: 'FREE', access: 'Free trailhead lots · outhouse at some tracts · wide sandy trails', maps: 'Hollidge Tract York Regional Forest'
    },
    {
      name: 'Bruce\'s Mill Conservation Park',
      area: 'Stouffville Rd (15 min)',
      why: 'Historic mill, forest loops, spring syrup, and a summer treetop trekking course — the all-purpose conservation-area outing east of Yonge.',
      tip: 'TRCA entry fees apply — check before you go.',
      best: 'Maple syrup season', ages: 'all ages', cost: '$', access: 'Lot at the gate · washrooms on site · easy trails', maps: 'Bruce\'s Mill Conservation Park'
    },
    {
      name: 'Thornton Bales Conservation Area ("the 99 steps")',
      area: 'Mulock Dr side, King (20 min)',
      why: 'A steep moraine ravine descended by its famous wooden staircase into mossy, fern-floored forest — the closest thing to Ontario cottage-trail terrain this side of the escarpment.',
      tip: 'The stairs are the workout; take them slow with young or senior knees.',
      best: 'Fall colour', ages: '6+', cost: 'FREE', access: 'Small roadside lot · no facilities · steep stairs — real shoes', maps: 'Thornton Bales Conservation Area King'
    },
    {
      name: 'Musselman\'s Lake',
      area: 'Whitchurch-Stouffville (15 min)',
      why: 'The nearest classic drop-a-line lake outside town — a kettle lake with a long local fishing tradition and public access points on the north side.',
      tip: 'Evening calm is the productive window.',
      best: 'Summer evenings', ages: 'all ages', cost: 'FREE–$', access: 'North-side public access · roadside parking · simple banks', maps: 'Musselman\'s Lake Stouffville'
    }
  ],

  quick: [
    { have: '3 perfect hours', plan: 'Mill Pond loop with the swans, the heritage streets east of the pond, and a Yonge Street café. The town\'s gentlest introduction.' },
    { have: 'Half a day', plan: 'Oak Ridges Corridor from the Bond Lake side into real forest, then Lake Wilcox\'s promenade for lunch and open water.' },
    { have: 'A full day', plan: 'The moraine sampler: corridor trails in the morning, Wilcox at midday, Jefferson Forest\'s pine ridgelines after — and back to the west boardwalk for sunset.' },
    { have: 'A rainy day', plan: 'Jefferson Forest under the pines (rain barely reaches the floor), then Richmond Green\'s paths between showers and hot food on Yonge.' }
  ],

  trails: [
    {
      name: 'Oak Ridges Corridor trail network', facetOf: 'Oak Ridges Corridor Conservation Reserve',
      area: 'Bathurst to Yonge, Oak Ridges',
      why: 'The town\'s serious trail mileage: a marked network rolling over moraine hills between Bond Lake and the Bathurst forests — enough branching loops to make every visit a different hike.',
      tip: 'Trailhead maps are posted; photograph one and wander confidently.',
      route: '10+ km network · dirt', best: 'Fall', ages: '6+', cost: 'FREE', access: 'Trailhead lots off Yonge & Bathurst · no facilities · dirt network', maps: 'Oak Ridges Corridor Conservation Reserve trails',
      tr: { km: 10, kind: 'network', surface: 'dirt', climb: 1, shade: 2, crowd: 1, wheels: 0, boots: 3, pick: 'The serious mileage — a different hike every visit' }
    },
    {
      name: 'Lake to Lake Route, Richmond Hill leg',
      area: 'North–south through town',
      why: 'York Region\'s signature cycling route runs Lake Wilcox to Lake Ontario, and the Richmond Hill leg strings the town\'s green spaces into one rideable line — the commuter\'s secret and the weekend rider\'s spine.',
      tip: 'Signed both directions; start at Wilcox and ride south with gravity\'s blessing.',
      route: 'signed route · paved & trail', best: 'Any green month', ages: '10+', cost: 'FREE', access: 'Signed on-road & trail mix · start at Wilcox lots · bikes', maps: 'Lake to Lake Cycling Route Richmond Hill',
      tr: { km: 20, kind: 'one-way', surface: 'paved & trail', climb: 1, shade: 1, crowd: 1, wheels: 2, boots: 3, pick: 'The bike spine — Wilcox toward the city in one line' }
    },
    {
      name: 'Jefferson Forest loops', facetOf: 'Jefferson Forest',
      area: 'Bayview north of Stouffville Rd',
      why: 'Pine-ridge singletrack and wide forest lanes braided together — the local trail runners\' home turf, honest little climbs included.',
      tip: 'Snowy-day hiking here is the town at its best.',
      route: '~5 km of braided loops · dirt', best: 'Winter snow, fall colour', ages: '6+', cost: 'FREE', access: 'Roadside lots · no facilities · rooty singletrack', maps: 'Jefferson Forest Richmond Hill',
      tr: { km: 5, kind: 'loops', surface: 'dirt', climb: 1, shade: 2, crowd: 1, wheels: 0, boots: 2, pick: 'Pine ridgelines — winter\'s best walking' }
    },
    {
      name: 'Saigeon Trail boardwalk run', facetOf: 'Saigeon Trail & German Mills Creek headwaters',
      area: 'East Richmond Hill',
      why: 'Flat, wet, and full of life — boardwalk stretches over cattail wetland make this the most interesting easy walk in town, and a favourite first "real trail" for small legs.',
      tip: 'One-way it: exit near Leslie for lunch.',
      route: '~4 km one-way · boardwalk & gravel', best: 'Spring bird season', ages: 'all ages', cost: 'FREE', access: 'Neighbourhood parking · boardwalk — stroller ok', maps: 'Saigeon Trail Richmond Hill',
      tr: { km: 4, kind: 'one-way', surface: 'boardwalk & gravel', climb: 0, shade: 1, crowd: 1, wheels: 2, boots: 1, pick: 'Easiest — the first "real trail" for small legs' }
    },
    {
      name: 'Oak Ridges Trail, moraine crest',
      area: 'Crossing town east–west',
      why: 'The long-distance Oak Ridges Trail threads the moraine\'s spine right through Richmond Hill — hike a section and you\'re walking a path that runs, in pieces, from Caledon to Northumberland.',
      tip: 'The ORTA\'s online maps mark every access point.',
      route: 'section hikes · dirt', best: 'Fall', ages: '8+', cost: 'FREE', access: 'ORTA-mapped roadside access · no facilities · dirt footpath', maps: 'Oak Ridges Trail Richmond Hill',
      tr: { km: 8, kind: 'sections', surface: 'dirt', climb: 1, shade: 2, crowd: 0, wheels: 0, boots: 3, pick: 'Walk a piece of a 300 km path' }
    }
  ],

  views: [
    {
      name: 'Bond Lake through the pines', facetOf: 'Bond Lake',
      area: 'Yonge St, Oak Ridges',
      why: 'The corridor trail keeps offering framed glimpses of the dark kettle lake through old conifers — moodier and wilder than Wilcox. Fog mornings after a warm day are the photograph.',
      best: 'Misty fall mornings', maps: 'Bond Lake Oak Ridges'
    },
    {
      name: 'Jefferson ridgelines', facetOf: 'Jefferson Forest',
      area: 'Jefferson Forest',
      why: 'Modest elevation, big effect: pine-framed sightlines down forested moraine slopes — and after fresh snow, the region\'s prettiest walking, full stop.',
      best: 'Winter, fall', maps: 'Jefferson Forest Richmond Hill'
    },
    {
      name: 'Phyllis Rawlinson meadow rise', facetOf: 'Phyllis Rawlinson Park',
      area: 'Leslie St north of 19th',
      why: 'The old farm\'s high meadow: a soft, golden panorama over creek hollow and treed fence lines, hawk-hunting ground at dusk. Late-August goldenrod turns the whole rise amber.',
      best: 'Late-summer golden hour', maps: 'Phyllis Rawlinson Park Richmond Hill'
    }
  ],

  waters: [
    {
      name: 'Rouge headwater creeks', facetOf: 'Pioneer Park & the Rouge headwaters',
      area: 'Pioneer Park & eastward',
      why: 'Cold, clear trickles you can step across — the literal beginning of a national-park river. Boot-and-net territory for kids; after rain the little riffles actually murmur.',
      best: 'Late spring', maps: 'Pioneer Park Richmond Hill'
    },
    {
      name: 'Wilcox–Bond wetland corridor', facetOf: 'Oak Ridges Corridor Conservation Reserve',
      area: 'Between the lakes, Oak Ridges',
      why: 'The wet lowland stitching the two kettle lakes together hums with frogs and red-wings in spring — walk it and you\'re walking the moraine\'s plumbing. Dusk in May is peak chorus.',
      best: 'May evenings', maps: 'Oak Ridges Corridor Conservation Reserve'
    }
  ],

  fishing: [
    {
      name: 'Lake Wilcox', facetOf: 'Lake Wilcox Park',
      area: 'Oak Ridges',
      why: 'The serious water: bass along the drop-offs from the shore nodes or a quiet paddle — the full Wilcox brief, launch included, lives at the flagship entry.',
      best: 'Jun–Sep', maps: 'Lake Wilcox fishing Richmond Hill'
    },
    {
      name: 'Mill Pond', facetOf: 'Mill Pond Park',
      area: 'Central Richmond Hill',
      why: 'The beginner\'s pond: panfish-friendly water, easy grassy banks, and a coffee shop within walking distance for when attention spans expire. Light tackle, small hooks, high delight.',
      best: 'Summer mornings', maps: 'Mill Pond Park Richmond Hill'
    }
  ],


  // The human history threaded through the green.
  heritage: [
    {
      name: 'David Dunlap Observatory Park',
      area: 'Hillsview Dr, off Bayview',
      why: 'The great dome on the hill: when it opened in 1935, the observatory\'s 74-inch telescope was the second-largest on Earth, and the estate around it is now parkland — mown paths, old hardwoods, and the dome rising over the treeline. Public astronomy nights run in season.',
      tip: 'Check the local astronomy society\'s schedule — standing under the opened dome at dusk is unforgettable.',
      best: 'Clear evenings, event nights', ages: 'all ages', cost: 'FREE grounds · $ events', access: 'Lot on site · level mown paths', maps: 'David Dunlap Observatory Park Richmond Hill'
    },
    {
      name: 'Richmond Hill Heritage Centre',
      area: 'Church St N, old village',
      why: 'An 1840s house-museum at the heart of the old village — period rooms, rotating local history, and gardens that pair with the Mill Pond loop five minutes\' walk away.',
      tip: 'Hours are limited — check before you build a day around it; the gardens and heritage streets around it are always open.',
      best: 'Paired with the Mill Pond loop', ages: 'all ages', cost: 'FREE–$', access: 'Street parking · garden paths level', maps: 'Richmond Hill Heritage Centre'
    },
    {
      name: 'Burr House & the artisans\' guild',
      area: 'Carrville Rd',
      why: 'A c.1820s farmhouse kept alive by working artisans — craft gallery, guild studios, and a proper tea room in season. Small, sincere, and very Richmond Hill.',
      tip: 'Weekend afternoons are the liveliest; pair with the Beaver Creek greenway a few minutes west.',
      best: 'Weekend afternoons', ages: 'all ages', cost: 'FREE–$', access: 'Lot beside the house · one level', maps: 'Burr House Richmond Hill'
    }
  ],

  // Entry stamps.
  icons: {
    'Lake Wilcox Park': 'lake',
    'Oak Ridges Corridor Conservation Reserve': 'forest',
    'Mill Pond Park': 'pond',
    'Phyllis Rawlinson Park': 'meadow',
    'Jefferson Forest': 'forest',
    'Saigeon Trail & German Mills Creek headwaters': 'marsh',
    'Bond Lake': 'lake',
    'Pioneer Park & the Rouge headwaters': 'creek',
    'Richmond Green trails': 'meadow',
    'Beaver Creek / Elgin Mills Greenway': 'creek',
    'Hunters Point Wildlife Sanctuary edge trails': 'forest',
    'Kortright Centre for Conservation': 'mill',
    'York Regional Forest — Hollidge & Eldred King tracts': 'forest',
    'Bruce\'s Mill Conservation Park': 'mill',
    'Thornton Bales Conservation Area ("the 99 steps")': 'valley',
    'Oak Ridges Corridor trail network': 'forest',
    'Lake to Lake Route, Richmond Hill leg': 'creek',
    'Jefferson Forest loops': 'forest',
    'Saigeon Trail boardwalk run': 'marsh',
    'Oak Ridges Trail, moraine crest': 'valley',
    'Lake Wilcox west boardwalk': 'lookout',
    'Bond Lake through the pines': 'lake',
    'Jefferson ridgelines': 'lookout',
    'Phyllis Rawlinson meadow rise': 'meadow',
    'Lake Wilcox by paddle': 'lake',
    'Rouge headwater creeks': 'creek',
    'Mill Pond in every season': 'pond',
    'Wilcox–Bond wetland corridor': 'marsh',
    'Lake Wilcox': 'fish',
    'Mill Pond': 'fish',
    'Musselman\'s Lake': 'fish',
    'David Dunlap Observatory Park': 'heritage',
    'Richmond Hill Heritage Centre': 'heritage',
    'Burr House & the artisans\' guild': 'heritage'
  },

  // Photo plates (curated Commons; see assets/photos/credits.json).
  photos: {
    'Lake Wilcox Park': { key: 'rh-spot-wilcox', size: 'large' },
    'Bond Lake': { key: 'rh-spot-bond', size: 'large' },
    'Jefferson Forest': { key: 'rh-spot-jefferson', size: 'small' },
    'David Dunlap Observatory Park': { key: 'rh-spot-ddo', size: 'large' },
    'Richmond Hill Heritage Centre': { key: 'rh-spot-heritagectr', size: 'small' },
    'Burr House & the artisans\' guild': { key: 'rh-spot-burr', size: 'small' }
  },

  // Field companions (wild-* keys are the shared species library).
  companions: {
    'The places': {
      note: 'The regulars — met on ordinary mornings in these parks.',
      species: [
        { key: 'wild-chipmunk', label: 'Eastern chipmunk', sub: 'every wooded edge' },
        { key: 'wild-cardinal', label: 'Northern cardinal', sub: 'year-round colour' },
        { key: 'wild-cottontail', label: 'Eastern cottontail', sub: 'dusk lawns & meadows' }
      ]
    },
    'On the trail': {
      note: 'Walk quietly at the day\'s edges and the moraine shows its residents.',
      species: [
        { key: 'wild-deer', label: 'White-tailed deer', sub: 'corridor forest at dusk' },
        { key: 'wild-fox', label: 'Red fox', sub: 'meadow margins, early' },
        { key: 'wild-woodpecker', label: 'Pileated woodpecker', sub: 'the old pine tracts' }
      ]
    },
    'Worth the climb': {
      note: 'The lookout\'s other audience — keep one eye on the sky.',
      species: [
        { key: 'wild-hawk', label: 'Red-tailed hawk', sub: 'hunting the Rawlinson rise' },
        { key: 'wild-vulture', label: 'Turkey vulture', sub: 'wobbling Vs over the ridge' },
        { key: 'wild-monarch', label: 'Monarch', sub: 'goldenrod season' }
      ]
    },
    'On the water': {
      note: 'Who you\'ll meet at the water line.',
      species: [
        { key: 'wild-loon', label: 'Common loon', sub: 'Wilcox, early mornings' },
        { key: 'wild-turtle', label: 'Painted turtle', sub: 'basking logs, warm mornings' },
        { key: 'wild-kingfisher', label: 'Belted kingfisher', sub: 'the rattle over open water' }
      ]
    },
    'Casting lines': {
      note: 'The usual suspects — what these waters actually hold.',
      species: [
        { key: 'wild-pumpkinseed', label: 'Pumpkinseed', sub: 'first casts & small hooks' },
        { key: 'wild-bass', label: 'Largemouth bass', sub: 'the Wilcox drop-offs' },
        { key: 'wild-perch', label: 'Yellow perch', sub: 'Musselman\'s evenings' }
      ]
    }
  },

  // Bonus page: patios near the green. Area-level entries until named slots
  // are verified — the open slot IS the sponsorship pitch.
  bonus: {
    title: 'Patios & rooftops',
    blurb: 'Where to land after the trail — a rotating shortlist beside the green, refreshed with each edition.',
    disclosure: 'This page rotates: venues change with new editions, and every reader gets updated editions free. No venue has paid for placement in this edition — when a slot is sponsored, it will say so right on it. A venue that wants a named slot in the next edition can write admin@dayhop.quest.',
    entries: [
      {
        name: 'The Yonge Street village stretch',
        area: 'Old Richmond Hill, by Mill Pond',
        why: 'The heritage blocks of Yonge just east of Mill Pond keep a rotating cast of independent cafés and patios — walk the strip after the pond loop and pick the fullest one.',
        pair: 'After: the Mill Pond loop', maps: 'restaurants Yonge Street Richmond Hill village'
      },
      {
        name: 'Oak Ridges, lakeside plazas',
        area: 'Yonge St at Lake Wilcox',
        why: 'The plazas ringing the lake hide solid independent kitchens minutes from the promenade — the post-boardwalk food question answers itself here.',
        pair: 'After: the Wilcox west-boardwalk sunset', maps: 'restaurants Oak Ridges Lake Wilcox'
      },
      {
        name: 'This could be your table',
        area: 'Richmond Hill',
        why: 'The named slots on this page debut in the next edition — and every buyer receives that edition free. Know the patio that belongs here, or own it? Tell us.',
        pair: 'admin@dayhop.quest', maps: 'patio restaurants Richmond Hill'
      }
    ]
  },

  // Field notes.
  facts: [
    { n: 'The Oak Ridges Moraine is the region\'s rain barrel: its deep sands soak up rainfall and release it slowly as the springs and headwaters of some 65 rivers and streams, flowing both north to Lake Simcoe and south to Lake Ontario.' },
    { n: 'Wilcox and Bond are kettles — basins left by blocks of glacier ice stranded as the last ice sheet retreated roughly 12,000 years ago. Lake Wilcox is the largest kettle lake on the whole moraine.' },
    { n: 'When the David Dunlap Observatory opened in 1935, its 74-inch reflector was the second-largest telescope on Earth — and in 1972, observations made here produced the first strong evidence that Cygnus X-1 was a black hole.' },
    { n: 'A century ago an electric radial railway ran up Yonge Street, and Bond Lake was its destination resort: Torontonians rode north for picnics, rowboats, and a lakeside amusement grounds where the forest now stands.' },
    { n: 'The spring chorus is mostly spring peepers — frogs the size of a thumbnail whose massed voices carry a kilometre on a still May evening. Every wet hollow in the corridor becomes a stadium.', photo: 'wild-peeper' },
    { n: 'A white trillium takes seven or more years from seed to first bloom — a carpet of them, like Hunters Point\'s in May, is the signature of old, undisturbed forest.', photo: 'markham-spot-trillium' },
    { n: 'The loons that visit Lake Wilcox can barely walk on land — their legs sit too far back — but they fly at highway speeds and dive deeper than fifty metres. Deep kettle water is exactly their kind of lake.' },
    { n: 'Mill Pond is the village\'s founding artifact: dug for the 19th-century mills, it is the reason old Richmond Hill\'s social centre sits exactly where it does.' }
  ],

  // Month-by-month; October carries the coral.
  almanac: [
    { m: 'JAN', text: 'Fresh snow turns Jefferson\'s pine woods into the town\'s prettiest walking; Mill Pond holds its mirror ice.' },
    { m: 'FEB', text: 'The clearest skies of the year: chickadee flocks work the corridor forest, and late-month thaws start the maple sap moving.' },
    { m: 'MAR', text: 'Red-winged blackbirds return to the corridor cattails in the first mild week; the syrup drives (Kortright, Bruce\'s Mill — both ~20 minutes out) hit full steam.' },
    { m: 'APR', text: 'The frog chorus builds — peepers first, toads after — and the Rouge headwater creeks run loud through Pioneer Park.' },
    { m: 'MAY', text: 'Trillium carpets at Hunters Point and Jefferson by mid-month; warbler migration peaks; dusk in the wetland corridor is peak amphibian chorus.' },
    { m: 'JUN', text: 'Cygnets and goslings on the ponds; Wilcox promenade evenings begin in earnest; the longest golden hours of the year.' },
    { m: 'JUL', text: 'Splash-pad mornings and calm-water paddling before the afternoon breeze; damselflies stitch every shoreline.' },
    { m: 'AUG', text: 'Goldenrod turns the Rawlinson meadows amber late-month; swallows mass over Richmond Green before heading south.' },
    { m: 'SEP', text: 'Mist mornings return to Bond Lake; hawks ride the moraine\'s ridge line south; the first maples flare early.' },
    { m: 'OCT', key: true, text: 'The headline month: kettle-lake colour — Bond and Wilcox ringed in red and gold, peaking mid-to-late October. (Thornton Bales\' staircase ravine, 20 minutes out, is the bonus round.)' },
    { m: 'NOV', text: 'Bare trees open the forest\'s architecture; late waterfowl raft on Wilcox before freeze-up.' },
    { m: 'DEC', text: 'First freeze-up at Mill Pond — the postcard week — while the pine tracts keep their green all winter.' }
  ],

  // The shortlists.
  shortlists: [
    { title: 'The full-amenity family day', text: 'Lake Wilcox Park — washrooms, splash pad, playground, paved promenade, and real open water. Everything on one shoreline.' },
    { title: 'Best without a car', text: 'Mill Pond via YRT on Yonge — the loop, the swans, and the heritage streets, all on foot from the bus.' },
    { title: 'Best toddler outing', text: 'Saigeon Trail\'s boardwalks — flat, stroller-friendly, and full of red-winged blackbirds at eye level.' },
    { title: 'Most view for least effort', text: 'The Wilcox west boardwalk at sunset — paved from the lot, coffee in hand, the town\'s best free show.' },
    { title: 'The quiet one', text: 'Hunters Point edge trails — the least-trafficked walking in this guide, trilliums included.' },
    { title: 'The rainy-day call', text: 'Jefferson Forest under the pines — rain barely reaches the floor.' }
  ],

  // Field-ledger ranks.
  ledger: ['Day Scout', 'Pathfinder', 'Field Ranger', 'Warden of the Moraine'],

  itineraries: [
    {
      title: 'Moraine sampler (full day)',
      blurb: 'The lakes-and-forest day that explains why the moraine matters.',
      steps: [
        'Morning — Oak Ridges Corridor Reserve from the Bond Lake side: forest, ponds, birdsong.',
        'Midday — Lake Wilcox promenade; picnic or plaza lunch in Oak Ridges.',
        'Afternoon — Jefferson Forest\'s pine ridgelines for the deeper-woods feel.',
        'Golden hour — back to Wilcox\'s west boardwalk for sunset over the water.'
      ]
    },
    {
      title: 'Old village amble (half day)',
      blurb: 'Gentle, pretty, zero logistics.',
      steps: [
        'Morning — Mill Pond loop with the swans, then the heritage streets east of the pond.',
        'Lunch — Yonge Street\'s village stretch.',
        'Afternoon — Phyllis Rawlinson\'s meadow paths, timed so the hawks are hunting as the light goes long.'
      ]
    },
    {
      title: 'Kids-in-boots expedition (half day)',
      blurb: 'Frogs, creeks, stairs, syrup — engineered for under-tens.',
      steps: [
        'Morning — Pioneer Park creek prowl (rubber boots non-negotiable).',
        'Midday — Saigeon Trail boardwalks for red-winged blackbird spotting.',
        'Bonus, in season — 20 minutes to Kortright or Bruce\'s Mill for pancakes and syrup done properly.'
      ]
    },
    {
      title: 'Trail and water day (full day)',
      blurb: 'Moraine miles, then a line in the lake.',
      steps: [
        'Morning — Oak Ridges Corridor network from the Bond Lake side: two hours of proper forest trail.',
        'Midday — lunch in Oak Ridges, then launch a paddle on Lake Wilcox while the water\'s calm.',
        'Afternoon — rod out along the Wilcox shore nodes (licence in pocket); bass water, honest odds.',
        'Golden hour — the west boardwalk sunset, earned twice over.'
      ]
    }
  ],

  seasons: [
    { label: 'Spring (Apr–May)', text: 'The moraine wakes loudly: frog chorus in every corridor pond, trilliums at Hunters Point and Jefferson by mid-May, and syrup steam at Kortright and Bruce\'s Mill through April. Trails are wet — the boardwalked routes shine.' },
    { label: 'Summer (Jun–Aug)', text: 'Lake Wilcox is the centre of gravity: promenade evenings, splash-pad mornings. For heat relief, Jefferson and the Regional Forest tracts hold their cool under big pines.' },
    { label: 'Fall (Sep–Oct)', text: 'Kettle-lake colour is the specialty — Bond Lake and Wilcox ringed in red and gold, usually peaking mid-to-late October. Thornton Bales\' staircase ravine is the single best colour hit within 20 minutes.' },
    { label: 'Winter (Nov–Mar)', text: 'Snow turns the pine tracts into the region\'s prettiest walking — Jefferson and Eldred King after fresh snowfall are worth rearranging a morning for. Mill Pond in freeze-up is the postcard.' }
  ]
};
