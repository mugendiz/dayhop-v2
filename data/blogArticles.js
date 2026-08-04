// data/blogArticles.js — DayHop V2
// Hand-written seed stories for /blog. These ship in the repo so the blog has
// real content from day one; BabyLoveGrowth (or any webhook source) articles
// land in public.articles and are merged in at read time — a DB row with the
// same slug wins over a seed, so any of these can be superseded without a
// deploy. Keep facts evergreen: venues and recurring events, not one-off
// claims that rot. `html` is trusted first-party content (rendered as-is).

module.exports = [
  {
    slug: 'new-in-toronto-2026',
    title: 'New in Toronto: the 2026 openings actually worth a visit',
    description:
      'Honest Ed’s Park, Boomie Vintage, a re-themed DareDevil Coaster — the new Toronto openings that earn a spot on your day plan.',
    hero_image_url: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?auto=format&fit=crop&w=1400&q=70',
    tags: ['new openings', 'toronto', 'gta'],
    author: 'DayHop',
    published_at: '2026-08-03T12:00:00Z',
    html: `
<p>Toronto never sits still, and 2026 has been generous. These are the new spots our discovery scan keeps surfacing — and that we think are actually worth building a day around, not just walking past.</p>
<h2>Honest Ed's Park, Mirvish Village</h2>
<p>The corner of Bloor and Bathurst finally has its public heart back. The new park woven into Mirvish Village nods to the gloriously chaotic Honest Ed's discount store that stood here for six decades — public art, gathering space, and a genuine neighbourhood feel between the new mid-rises. Pair it with a wander through Koreatown one block west and you have an easy, free afternoon.</p>
<h2>Boomie Vintage, Dundas West</h2>
<p>A new brick-and-mortar vintage shop on Dundas West that gathers around fifteen independent sellers under one roof. Instead of one curator's taste you get a whole bazaar of them — denim racks next to mid-century glassware next to band tees. Vintage shopping on Dundas West was already a sport; this gives it a clubhouse.</p>
<h2>DareDevil Coaster, Canada's Wonderland</h2>
<p>Wonderland's freshly revamped and re-themed coaster is open for riders, and it slots neatly into an Adventure-mode day: hit the park at opening, ride the big steel before the lines build, and cool off at the waterpark in the afternoon. Vaughan's traffic is real — go early or go late.</p>
<h2>How to actually fit these in</h2>
<p>Openings are best as anchors, not itineraries. Pick one, then let the rest of the day form around it — a market nearby, a park in the same direction, dinner where the neighbourhood is good at dinner. That's exactly what <a href="/">DayHop</a> does in one sentence: tell it "vintage shopping on Dundas West then something new", and it builds the day around real places and live weather.</p>
`
  },
  {
    slug: 'first-timers-toronto-must-sees',
    title: 'First time in Toronto? The must-sees that are actually must-sees',
    description:
      'CN Tower, St. Lawrence Market, the Islands, the Distillery District — a no-regrets first-timer list from people who live here.',
    hero_image_url: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&w=1400&q=70',
    tags: ['must see', 'toronto', 'newcomers'],
    author: 'DayHop',
    published_at: '2026-07-30T12:00:00Z',
    html: `
<p>Every city has a tourist list and a real list. Toronto is lucky: they mostly overlap. If it's your first visit — or your first year living here — these earn their reputation.</p>
<h2>The skyline, from the right side</h2>
<p>The CN Tower is worth doing once, ideally on a clear evening. But the view every local actually loves is the one <em>of</em> the skyline: take the ferry to the Toronto Islands and look back. The Islands are car-free, beach-fringed, and twenty minutes from downtown; on a summer evening the ferry ride home into the lit-up skyline is the single best free show in the city.</p>
<h2>St. Lawrence Market</h2>
<p>One of the great food markets of North America, in a building that's been feeding Toronto since the 1800s. Come hungry, leave with a peameal bacon sandwich — it's the city's signature bite for a reason. Saturdays add the farmers market next door.</p>
<h2>The Distillery District</h2>
<p>Cobblestones, Victorian industrial architecture, galleries, and patios — pedestrian-only and genuinely pretty. It's at its best in the golden hour, and in winter it hosts the city's best-known holiday market.</p>
<h2>High Park and Kensington</h2>
<p>High Park is the city's sprawling green lung — trails, a free zoo, cherry blossoms in spring. Kensington Market is its opposite number: dense, scrappy, delicious, and best explored with no plan at all beyond snacking.</p>
<h2>The honest advice</h2>
<p>Don't try to do all of this in one day; Toronto punishes over-scheduling with traffic. Pick two neighbours — Islands + St. Lawrence, or Distillery + Kensington — and let the day breathe. Or tell <a href="/">DayHop</a> what kind of day you want in one sentence and let it pick the pairing that fits the weather.</p>
`
  },
  {
    slug: 'toronto-hidden-gems-insiders',
    title: 'The Toronto spots locals keep to themselves',
    description:
      'Leslie Spit, Trillium Park, Riverdale Farm, the Cabbagetown lanes — hidden-gem Toronto for people who think they’ve seen it all.',
    hero_image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=70',
    tags: ['hidden gems', 'toronto', 'insiders'],
    author: 'DayHop',
    published_at: '2026-07-26T12:00:00Z',
    html: `
<p>You've done the Tower, you've done the Market, you have opinions about ferry lines. This list is for you.</p>
<h2>The Leslie Spit</h2>
<p>Officially Tommy Thompson Park: a five-kilometre man-made peninsula of rubble and wilderness jutting into the lake, car-free and strangely beautiful. Cyclists do the lighthouse run; birders come for one of the best urban birding sites on the Great Lakes; everyone else comes for the skyline-from-the-water views and the feeling of being nowhere near a city.</p>
<h2>Trillium Park</h2>
<p>Carved out of the old Ontario Place grounds, with granite ridges, a William G. Davis trail, and the best sunset lawn downtown. It stays quieter than any waterfront park this good has a right to be.</p>
<h2>Riverdale Farm and the Cabbagetown lanes</h2>
<p>A working farm — free to visit — hiding inside a Victorian neighbourhood whose laneways and painted brick are a walking tour by themselves. Saturday mornings pair perfectly with the Cabbagetown farmers market.</p>
<h2>Evergreen Brick Works and the ravines</h2>
<p>Toronto's ravine system is the city's secret architecture, and the Brick Works — a reclaimed century-old brick factory turned market and trailhead — is its best front door. Twenty minutes of walking buys you total forest.</p>
<h2>The pattern</h2>
<p>Notice the theme: the city's best-kept secrets are where industry used to be. Toronto quietly turns its leftovers into parks. When you want a day built from spots like these instead of the postcard list, flip <a href="/">DayHop</a> into R&amp;R mode and ask for "quiet outdoors, no crowds".</p>
`
  },
  {
    slug: 'stargazing-near-toronto',
    title: 'Stargazing near Toronto: where the sky actually gets dark',
    description:
      'David Dunlap Observatory, York’s campus telescopes, the Leslie Spit, Rouge Park — real night-sky options within reach of the GTA.',
    hero_image_url: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1400&q=70',
    tags: ['stargazing', 'outdoors', 'gta', 'night'],
    author: 'DayHop',
    published_at: '2026-07-21T12:00:00Z',
    html: `
<p>Toronto's sky glow is mighty, but you don't need Algonquin to see stars. These are the options we rotate through DayHop's featured card — tested by clear-night regulars.</p>
<h2>David Dunlap Observatory, Richmond Hill</h2>
<p>Canada's largest optical telescope lives under a great dome minutes from downtown Richmond Hill, and its public star nights are the GTA's best astronomy experience — guided viewing, real deep-sky targets, working-observatory atmosphere. Sessions book up; check ahead.</p>
<h2>Allan I. Carswell Observatory, York University</h2>
<p>York opens campus telescopes to the public on Wednesday evenings — free, volunteer-guided, and surprisingly deep views for a city campus. The easiest possible on-ramp to astronomy.</p>
<h2>The Leslie Spit</h2>
<p>Downtown's darkest sky is a peninsula of parkland with the city glowing <em>behind</em> you instead of above you. Walk toward the lighthouse with a blanket; the lake horizon does the rest.</p>
<h2>Rouge National Urban Park</h2>
<p>Canada's first national urban park gets properly dark in its eastern meadows. Bring a red flashlight, give your eyes twenty minutes, and on a moonless night the Milky Way is genuinely visible from inside the city's borders.</p>
<h2>Reading the night</h2>
<p>Two things matter more than location: cloud cover and the moon. A clear moonless night at the Spit beats a hazy night in the country. DayHop's featured card already does this math — on a genuinely clear night it moves the dark-sky spots to the front and tells you why.</p>
`
  },
  {
    slug: 'toronto-farmers-markets-guide',
    title: 'A Saturday person’s guide to Toronto farmers markets',
    description:
      'St. Lawrence, Cabbagetown, Davisville, SickKids, Scarborough — which Toronto farmers market fits which kind of morning.',
    hero_image_url: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=70',
    tags: ['markets', 'food', 'toronto'],
    author: 'DayHop',
    published_at: '2026-07-16T12:00:00Z',
    html: `
<p>Toronto's markets have distinct personalities, and picking the right one is half the pleasure. A field guide, calibrated by many Saturday mornings.</p>
<h2>St. Lawrence — the institution</h2>
<p>The Saturday farmers market beside the main hall carries two centuries of momentum. Go early for the serious produce, stay for the peameal sandwich, and treat the antique market and surrounding Old Town streets as part of the visit.</p>
<h2>Cabbagetown — the neighbourhood one</h2>
<p>Small, friendly, and set against the prettiest Victorian streetscape in the city. Pair it with Riverdale Farm next door and you have the gentlest Saturday morning Toronto offers.</p>
<h2>Davisville Village — the midtown local</h2>
<p>A proper community market in the June Rowlands Park green — produce, bakers, kids everywhere. The kind of market you walk to, not drive to, which is exactly its charm.</p>
<h2>SickKids — the weekday surprise</h2>
<p>A downtown market at the hospital that catches office workers and visitors alike. If your week needs a mid-day reset near University Avenue, this is it.</p>
<h2>Scarborough — the east-end table</h2>
<p>Reflects the east end's diversity in the best way: the produce and prepared-food mix you won't find at the downtown markets. Worth the trip on its own.</p>
<h2>Make a day of it</h2>
<p>Markets are perfect day-plan anchors: they start early, end early, and leave you fed in a neighbourhood worth exploring. Tell <a href="/">DayHop</a> "farmers market morning then a slow afternoon" and it will chain the rest — park, gallery, or patio — to whichever market you pick.</p>
`
  },
  {
    slug: 'cne-labour-day-weekend-guide',
    title: 'CNE season and the Labour Day weekend: Toronto’s big goodbye to summer',
    description:
      'How to do the Canadian National Exhibition and the Labour Day long weekend right — air show, midway, and the end-of-summer rituals.',
    hero_image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=70',
    tags: ['events', 'cne', 'labour day', 'toronto'],
    author: 'DayHop',
    published_at: '2026-08-01T12:00:00Z',
    html: `
<p>Every Toronto summer ends the same way, and honestly? It's a great way to end a summer. The Canadian National Exhibition runs from mid-August through Labour Day, and the long weekend itself (September 5–7 this year) is the city's collective last hurrah.</p>
<h2>The Ex, done right</h2>
<p>The CNE is a 140-plus-year-old fair that contains multitudes: a midway, concert stages, horse shows, a food building famous for inventing things that shouldn't exist and occasionally something great. The move: go on a weekday if you can, arrive at opening, do the midway before lines build, and save the food building for when you've earned it.</p>
<h2>The air show</h2>
<p>The Canadian International Air Show closes the CNE over Labour Day weekend, and the jets over the lake are visible far beyond the grounds. Insider option: skip the admission entirely and watch from Trillium Park or the western beaches with a picnic — the lake is the runway.</p>
<h2>The rest of the weekend</h2>
<p>Labour Day weekend is peak everything: beaches at their warmest-water best, patios at their most committed, and the last long-weekend energy of the season. It's also quietly one of the best weekends for the Islands — the summer crowds thin just slightly as families pivot to back-to-school.</p>
<h2>Plan around the crush</h2>
<p>The Exhibition grounds pull enormous crowds on the holiday weekend, and transit is your friend — the streetcar beats the parking lots every time. DayHop's long-weekend spotlight is live right now: ask for <a href="/">a Labour Day weekend plan</a> and it will favour the festivals, markets, and fireworks happening around the date.</p>
`
  },
  {
    slug: 'summer-2026-events-recap',
    title: 'The summer 2026 events we’d line up for again',
    description:
      'Dance on Yonge, Dusk Dances, Free Flicks, tennis at Sobeys Stadium — a look back at the Toronto summer events that delivered.',
    hero_image_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=70',
    tags: ['events', 'review', 'toronto', 'summer'],
    author: 'DayHop',
    published_at: '2026-07-12T12:00:00Z',
    html: `
<p>DayHop's event feed watches hundreds of listings a week all summer. Some events are listings; some are rituals. These are the ones from this summer's calendar we'd happily queue for again — and most of them come back every year.</p>
<h2>Dance on Yonge</h2>
<p>A free multicultural dance festival that takes over Yonge Street's public spaces and turns the city's main artery into a stage. The joy-per-dollar ratio (the dollar being zero) is unbeatable, and the crowd is Toronto at its best-mixed.</p>
<h2>Dusk Dances in Withrow Park</h2>
<p>Contemporary dance performed outdoors as the light fails, with the audience strolling between pieces. It's pay-what-you-can, it's gorgeous, and it converts people who "don't like dance" every single evening it runs.</p>
<h2>Free Flicks at Harbourfront</h2>
<p>Outdoor cinema by the lake, free, all summer. The formula — blanket, sunset, water, film — has never needed improving. Arrive early for the good lawn spots and stay for the walk along the quay after.</p>
<h2>Tennis at Sobeys Stadium</h2>
<p>The National Bank Open brings top-tier professional tennis to York University's grounds every August. The insider move is the early rounds: cheaper tickets, packed outer courts, and you're close enough to hear the strings.</p>
<h2>The takeaway</h2>
<p>Toronto's best summer events share a shape: outdoors, low-cost, and communal. When next summer's editions roll around, they'll surface in <a href="/">DayHop's feed</a> the week they're announced — the live event sources are exactly how this recap got written.</p>
`
  },
  {
    slug: 'ontario-road-trip-new-openings',
    title: 'Road-trip Ontario: new and notable stops worth the tank of gas',
    description:
      'Blue Mountain’s Ridge Runner, the Niagara Parks Power Station, Elora, Prince Edward County — Ontario stops that justify the drive.',
    hero_image_url: 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=1400&q=70',
    tags: ['ontario', 'road trip', 'new openings'],
    author: 'DayHop',
    published_at: '2026-07-07T12:00:00Z',
    html: `
<p>The GTA is the anchor, but Ontario keeps adding reasons to fill the tank. These are the out-of-town stops — some new, some newly improved — that we think justify the highway time.</p>
<h2>Blue Mountain, Collingwood</h2>
<p>The GTA's default big-adventure day trip keeps getting better: the Ridge Runner mountain coaster, the open-air gondola, ropes courses, and a walkable pedestrian village at the bottom for the après. Two hours from the city, and a full Adventure-mode day by itself. Georgian Bay's water is the bonus round.</p>
<h2>The Niagara Parks Power Station</h2>
<p>Niagara's best recent idea: a century-old power station on the falls' edge restored as an attraction, including a tunnel that exits at river level with a view of the falls you simply could not get before. It turns Niagara from "seen it" into "see it again".</p>
<h2>Elora and the Gorge</h2>
<p>A limestone-cliff river gorge attached to one of Ontario's prettiest stone villages. Summer brings the famous quarry swim; shoulder seasons bring the gorge trails without the crowds. Ninety minutes out, feels further.</p>
<h2>Prince Edward County</h2>
<p>Sandbanks' dunes and beaches plus a county's worth of wineries, and a food scene that outgrew "surprising" years ago. It's the province's best overnight — but doable as a very committed day.</p>
<h2>The math of a road trip day</h2>
<p>The rule of thumb: the destination should earn double its drive time. Everything above passes. Tell <a href="/">DayHop</a> where you're headed — it plans beyond the GTA, with live weather for the day you're going.</p>
`
  },
  {
    slug: 'free-toronto-days',
    title: 'The zero-dollar Toronto day: free things that don’t feel free',
    description:
      'Free yoga in St. James Park, High Park’s zoo, Riverdale Farm, library events, the Bentway — a full Toronto day for $0.',
    hero_image_url: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?auto=format&fit=crop&w=1400&q=70',
    tags: ['free', 'budget', 'toronto'],
    author: 'DayHop',
    published_at: '2026-06-28T12:00:00Z',
    html: `
<p>Toronto has a reputation as an expensive city, and it's earned. But it also quietly runs one of the best free calendars on the continent — our event feed is full of $0 listings every single week. Here's a whole day of them.</p>
<h2>Morning: park yoga and market browsing</h2>
<p>Free community yoga sessions run all summer in downtown parks — St. James Park's sessions, steps from the cathedral, are a standing feature of our feed. Follow with a stroll through St. Lawrence Market; browsing is free and the samples are a rounding error.</p>
<h2>Midday: animals, no admission</h2>
<p>High Park's zoo has been free for over a century — bison, llamas, and peacocks in the middle of the west end. Riverdale Farm does the same for the east side with a working-farm feel. Both are attached to enough parkland to absorb an entire afternoon.</p>
<h2>Afternoon: the library is a venue</h2>
<p>The Toronto Public Library is one of the busiest urban library systems in the world, and its event calendar — author talks, kids' programs, workshops — is entirely free. The Reference Library's atrium alone is worth a visit.</p>
<h2>Evening: the Bentway and the waterfront</h2>
<p>The park under the Gardiner Expressway hosts free programming all season, and the waterfront's summer calendar — Free Flicks, concerts, festivals at Harbourfront — is the city's best free night out. End on the quay at sunset.</p>
<h2>Filter for it</h2>
<p>Every idea card in <a href="/">DayHop</a> carries a cost tier, and the event feed flags free listings automatically — ask for "a free day downtown" and that's literally what you'll get.</p>
`
  },
  {
    slug: 'rr-vs-adventure-day-plans',
    title: 'R&R day or Adventure day? Two perfect GTA Saturdays, planned',
    description:
      'Two complete GTA day plans — one slow and restorative, one full-throttle — and how to know which one you actually need.',
    hero_image_url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1400&q=70',
    tags: ['day plans', 'gta', 'r&r', 'adventure'],
    author: 'DayHop',
    published_at: '2026-06-21T12:00:00Z',
    html: `
<p>DayHop is built around a toggle: R&amp;R or Adventure. It sounds like a UI choice; it's actually the first question of any good day off. Here's one fully-formed Saturday of each, GTA-tested.</p>
<h2>The R&amp;R Saturday</h2>
<p><strong>Morning:</strong> Cabbagetown farmers market, slow coffee, Riverdale Farm. <strong>Midday:</strong> the Brick Works trails until lunch earns itself. <strong>Afternoon:</strong> a hammock hour at Trillium Park, book optional but recommended. <strong>Evening:</strong> golden hour on the quay and an unhurried dinner wherever the walk ends. Total driving: nearly none. Total decisions: three, all made by 10 a.m.</p>
<h2>The Adventure Saturday</h2>
<p><strong>Morning:</strong> ziplines or the climbing gym while your arms are fresh. <strong>Midday:</strong> kayak the harbour — the Islands from water level are a different city. <strong>Afternoon:</strong> go-karts or Wonderland's coasters, depending which direction you're pointed. <strong>Evening:</strong> the biggest meal of the week; you've earned every bite. Total driving: some. Total adrenaline: budgeted and spent.</p>
<h2>How to choose</h2>
<p>The honest test: what did your week take out of you? A week of deadlines wants the R&amp;R day — restoration, not more stimulus. A week of routine wants the Adventure day — your nervous system needs the news. Couples and families split the difference by alternating weekends, which is also the best argument for planning ahead.</p>
<h2>One sentence either way</h2>
<p>Both of those Saturdays came from a single sentence each. Flip the toggle on <a href="/">DayHop</a>, say what kind of day you want, and it assembles real venues, live weather, and actual events into a plan — then re-plans on the fly when the day changes its mind.</p>
`
  },
  {
    slug: 'gta-events-feed-how-it-works',
    title: 'Where DayHop’s events come from (and why it never fakes an all-clear)',
    description:
      'Inside DayHop’s event pipeline: city open-data feeds, Ticketmaster, community calendars — and the trust rules the feed lives by.',
    hero_image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=70',
    tags: ['behind the scenes', 'events', 'dayhop'],
    author: 'DayHop',
    published_at: '2026-06-20T12:00:00Z',
    html: `
<p>A day planner is only as good as its sense of what's actually happening. Here's an honest look at where DayHop's events come from — useful if you're curious, and clarifying if you're comparing planners.</p>
<h2>The city itself</h2>
<p>Toronto publishes its official Festivals &amp; Events calendar as open data — every listing reviewed by city staff before it appears. That feed is a first-class citizen in DayHop: it's where the free community events (markets, park yoga, outdoor films) largely come from, and it's why the feed feels local rather than just ticketed.</p>
<h2>The ticketed world</h2>
<p>Ticketmaster and Eventbrite cover concerts, sports, and organized happenings; tour and activity partners cover the bookable-experience layer. Where a partner link exists, cards link straight to booking; where it doesn't, we link the venue's official site — never a search-page shrug.</p>
<h2>The long tail</h2>
<p>Library programs, civic calendars, and a weekly Canada-wide discovery scan that looks for newly opened attractions — each new find is verified by two independent checks before it's allowed to appear. That's how things like a new park at Bloor and Bathurst show up in the feed the same season they open.</p>
<h2>The trust rules</h2>
<p>Two rules are absolute. First: no invented events — every card traces to a real source, and when the AI curates, it selects and arranges rather than imagines. Second: the advisory system never fakes an all-clear — if we can't reach the weather-alert feed, we say the check didn't complete rather than showing a green light we didn't verify. A planner you can't trust about a thunderstorm isn't a planner.</p>
<p>That's the machinery. The experience is simpler: <a href="/">one sentence, one plan</a>, real places.</p>
`
  }
];
