// data/blogArticles.js — DayHop V2
// Hand-written seed stories for /blog. These ship in the repo so the blog has
// real content from day one; BabyLoveGrowth (or any webhook source) articles
// land in public.articles and are merged in at read time. A DB row with the
// same slug wins over a seed, so any of these can be superseded without a
// deploy. Keep facts evergreen: venues and recurring events, not one-off
// claims that rot. `html` is trusted first-party content (rendered as-is).
// House style: conversational, warm, lightly funny. No em-dashes.

module.exports = [
  {
    slug: 'new-in-toronto-2026',
    title: 'New in Toronto: the 2026 openings actually worth a visit',
    description:
      'Honest Ed’s Park, Boomie Vintage, and a reborn coaster at Wonderland. The new Toronto openings that deserve a spot on your day plan.',
    hero_image_url: 'https://images.unsplash.com/photo-1517090504586-fde19ea6066f?auto=format&fit=crop&w=1400&q=70',
    tags: ['new openings', 'toronto', 'gta'],
    author: 'DayHop',
    published_at: '2026-08-03T12:00:00Z',
    html: `
<p>Toronto never sits still. Every year the city quietly swaps out a few of its parts, and 2026 has been a generous year for upgrades. Our discovery scan watches for new openings across the country every week, and these are the ones it keeps surfacing. More importantly, they pass the real test: would you actually build a day around them? Yes. Here's how.</p>
<h2>Honest Ed's Park, Mirvish Village</h2>
<p>For sixty years, the corner of Bloor and Bathurst was home to the most gloriously chaotic discount store in the country. Now the neighbourhood has its public heart back. The new park woven into Mirvish Village tips its hat to Honest Ed's with public art and a proper gathering space, and it already feels like it belongs. Wander one block west into Koreatown afterward and you have a lovely, entirely free afternoon.</p>
<h2>Boomie Vintage, Dundas West</h2>
<p>Vintage shopping on Dundas West was already a competitive sport. Boomie gives it a clubhouse. The new brick-and-mortar shop gathers about fifteen independent sellers under one roof, which means fifteen different opinions about what deserves a second life. Denim next to mid-century glassware next to band tees you thought were extinct. Bring patience and a tote bag.</p>
<h2>DareDevil Coaster, Canada's Wonderland</h2>
<p>Wonderland took one of its coasters, gave it a full makeover and a new identity, and reopened it for riders. It slots perfectly into an Adventure-mode day: arrive at opening, ride the big steel while the lines are short, then cool off at the waterpark once the afternoon heats up. One warning from experience: Vaughan traffic does not believe in your schedule. Go early or go late.</p>
<h2>The trick with new places</h2>
<p>Openings work best as anchors, not entire itineraries. Pick one, then let the rest of the day grow around it. A market nearby, a park in the same direction, dinner wherever the neighbourhood does dinner well. That's exactly what <a href="/">DayHop</a> does from a single sentence. Tell it "vintage shopping on Dundas West, then something new" and watch it assemble the rest.</p>
`
  },
  {
    slug: 'first-timers-toronto-must-sees',
    title: 'First time in Toronto? The must-sees that are actually must-sees',
    description:
      'CN Tower, St. Lawrence Market, the Islands, the Distillery District. A no-regrets first-timer list from people who live here.',
    hero_image_url: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&w=1400&q=70',
    tags: ['must see', 'toronto', 'newcomers'],
    author: 'DayHop',
    published_at: '2026-07-30T12:00:00Z',
    html: `
<p>Every city keeps two lists: the one it hands to tourists and the one it keeps for itself. Toronto is lucky. The lists mostly agree. If it's your first visit, or your first year living here and you've been too busy unpacking, start with these.</p>
<h2>The skyline, from the right side</h2>
<p>Yes, go up the CN Tower once, ideally on a clear evening. But the view locals actually love is the one looking back. Take the ferry to the Toronto Islands: car-free, beach-fringed, and twenty minutes from downtown. Stay for sunset. The ferry ride home toward the lit-up skyline is the best free show in the city, and nobody has ever disagreed after seeing it.</p>
<h2>St. Lawrence Market</h2>
<p>One of the great food markets of North America, in a building that has been feeding this city since the 1800s. Arrive hungry. Leave with a peameal bacon sandwich, because some clichés are clichés for delicious reasons. On Saturdays the farmers market sets up next door and the whole block hums.</p>
<h2>The Distillery District</h2>
<p>Cobblestones, Victorian industrial brick, galleries, and patios, all pedestrian-only. It photographs absurdly well in the golden hour, and in winter it hosts the city's most famous holiday market. Even the locals who claim it's touristy keep ending up there.</p>
<h2>High Park and Kensington</h2>
<p>High Park is the city's big green lung, complete with trails, a free zoo, and cherry blossoms that cause a citywide frenzy each spring. Kensington Market is its opposite: dense, scrappy, and delicious. The correct plan for Kensington is no plan. Just snack your way through and see where you surface.</p>
<h2>One honest tip</h2>
<p>Don't cram all of this into one day. Toronto punishes over-scheduling, usually with traffic. Pick two neighbours, like the Islands plus St. Lawrence, and let the day breathe. Or tell <a href="/">DayHop</a> what kind of day you want and let it pick the pairing that suits the weather.</p>
`
  },
  {
    slug: 'toronto-hidden-gems-insiders',
    title: 'The Toronto spots locals keep to themselves',
    description:
      'The Leslie Spit, Trillium Park, Riverdale Farm, and the prettiest laneways in the city. Hidden-gem Toronto for people who think they’ve seen it all.',
    hero_image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=70',
    tags: ['hidden gems', 'toronto', 'insiders'],
    author: 'DayHop',
    published_at: '2026-07-26T12:00:00Z',
    html: `
<p>You've done the Tower. You've done the Market. You have strong opinions about ferry lines. This list is for you, and we're trusting you to use it responsibly.</p>
<h2>The Leslie Spit</h2>
<p>Officially it's Tommy Thompson Park. Unofficially it's a five-kilometre peninsula of old construction rubble that nature decided to adopt, jutting into the lake with no cars allowed. Cyclists do the lighthouse run. Birders come for one of the best urban birding sites on the Great Lakes. Everyone else comes to stand at the edge of the water, look back at the skyline, and feel very smug about knowing this place exists.</p>
<h2>Trillium Park</h2>
<p>Carved out of the old Ontario Place grounds, with granite ridges, a winding trail, and the best sunset lawn downtown. For a park this good, it stays mysteriously quiet. We assume everyone who visits agrees to keep it that way, and now you're in on it too.</p>
<h2>Riverdale Farm and the Cabbagetown lanes</h2>
<p>There is a working farm, free to visit, hiding inside a Victorian neighbourhood. That sentence alone should get you on a streetcar. The surrounding Cabbagetown laneways and painted brick houses are a self-guided walking tour, and on Saturday mornings the local farmers market makes the whole thing feel like a small town that got lost inside a big city.</p>
<h2>Evergreen Brick Works and the ravines</h2>
<p>Toronto's ravine system is the city's secret architecture, a whole forested world running underneath the street grid. The Brick Works, a century-old brick factory reborn as a market and trailhead, is its best front door. Twenty minutes of walking buys you total forest. Your phone will still have signal. Ignore it.</p>
<h2>Notice the pattern</h2>
<p>Nearly all of these used to be industry. Toronto has a lovely habit of turning its leftovers into parks. When you want a day built from spots like these instead of the postcard list, flip <a href="/">DayHop</a> into R&amp;R mode and ask for quiet outdoors without the crowds.</p>
`
  },
  {
    slug: 'stargazing-near-toronto',
    title: 'Stargazing near Toronto: where the sky actually gets dark',
    description:
      'David Dunlap Observatory, campus telescopes at York, the Leslie Spit, and Rouge Park. Real night-sky options within reach of the GTA.',
    hero_image_url: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1400&q=70',
    tags: ['stargazing', 'outdoors', 'gta', 'night'],
    author: 'DayHop',
    published_at: '2026-07-21T12:00:00Z',
    html: `
<p>Toronto's sky glow is mighty. It's the price of all those condo lights, and it convinces most people that seeing stars requires a three-hour drive north. Happily, that's wrong. These are the spots we rotate through DayHop's featured card, tested by people who check the forecast obsessively.</p>
<h2>David Dunlap Observatory, Richmond Hill</h2>
<p>Canada's largest optical telescope lives under a great dome just minutes from downtown Richmond Hill, which still feels like a secret even after you've been. Public star nights get you guided viewing through serious glass, real deep-sky targets included. Sessions book up, so check ahead before you promise anyone the rings of Saturn.</p>
<h2>Allan I. Carswell Observatory, York University</h2>
<p>On Wednesday evenings, York opens its campus telescopes to the public. It's free, it's volunteer-guided, and the views go surprisingly deep for a city campus. If you've never looked through a proper telescope before, this is the gentlest possible way to start.</p>
<h2>The Leslie Spit</h2>
<p>Downtown's darkest sky belongs to a peninsula where the city glows behind you instead of above you. Walk out toward the lighthouse with a blanket and let the lake horizon do the rest. On a good night you'll forget the skyline is right there until you turn around.</p>
<h2>Rouge National Urban Park</h2>
<p>Canada's first national urban park gets properly dark in its eastern meadows. Bring a red flashlight, give your eyes twenty minutes to adjust, and on a moonless night you can see the Milky Way without leaving the city's borders. That sentence surprises everyone, and it's true.</p>
<h2>Two things matter more than location</h2>
<p>Cloud cover and the moon. A clear, moonless night at the Spit beats a hazy night in the countryside every time. DayHop's featured card already does this math for you: when tonight is genuinely clear, the dark-sky spots move to the front of the rotation, and the card tells you why.</p>
`
  },
  {
    slug: 'toronto-farmers-markets-guide',
    title: 'A Saturday person’s guide to Toronto farmers markets',
    description:
      'St. Lawrence, Cabbagetown, Davisville, SickKids, and Scarborough. Which Toronto farmers market fits which kind of morning.',
    hero_image_url: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=70',
    tags: ['markets', 'food', 'toronto'],
    author: 'DayHop',
    published_at: '2026-07-16T12:00:00Z',
    html: `
<p>Toronto's markets have personalities, and matching the market to the morning is half the pleasure. Consider this a field guide, calibrated over many Saturdays and an irresponsible quantity of baked goods.</p>
<h2>St. Lawrence, the institution</h2>
<p>The Saturday farmers market beside the main hall carries two centuries of momentum, and it shows. Go early for the serious produce, stay for the peameal sandwich, and give yourself time to wander Old Town afterward. This is the market you take visitors to when you want them to move here.</p>
<h2>Cabbagetown, the neighbourhood one</h2>
<p>Small, friendly, and set against the prettiest Victorian streetscape in the city. Riverdale Farm is right next door, so you can buy carrots and then go meet the animals who inspired them. The gentlest Saturday morning Toronto offers.</p>
<h2>Davisville Village, the midtown local</h2>
<p>A proper community market on the green at June Rowlands Park. Produce, bakers, and roughly one dog per household. This is the kind of market you walk to rather than drive to, which is precisely its charm.</p>
<h2>SickKids, the weekday surprise</h2>
<p>A downtown market at the hospital that catches office workers, students, and visitors alike. If your week needs a midday reset somewhere near University Avenue, a market lunch beats a desk lunch every single time.</p>
<h2>Scarborough, the east-end table</h2>
<p>The east end's diversity shows up on the tables here, with produce and prepared food you simply won't find downtown. Worth the trip on its own, and a good reminder that the city's food story doesn't end at the Don Valley.</p>
<h2>Make a morning into a day</h2>
<p>Markets are perfect anchors. They start early, end early, and release you well-fed into a neighbourhood worth exploring. Tell <a href="/">DayHop</a> you want a farmers market morning and a slow afternoon, and it will chain the rest together for you.</p>
`
  },
  {
    slug: 'cne-labour-day-weekend-guide',
    title: 'CNE season and the Labour Day weekend: Toronto’s big goodbye to summer',
    description:
      'How to do the Canadian National Exhibition and the Labour Day long weekend right, from the midway to the air show.',
    hero_image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=70',
    tags: ['events', 'cne', 'labour day', 'toronto'],
    author: 'DayHop',
    published_at: '2026-08-01T12:00:00Z',
    html: `
<p>Every Toronto summer ends the same way, and honestly, it's a great way to end a summer. The Canadian National Exhibition runs from mid-August through Labour Day, and the long weekend itself (September 5 to 7 this year) is the city's collective last hurrah before everyone pretends to be responsible again.</p>
<h2>The Ex, done properly</h2>
<p>The CNE is over 140 years old and contains multitudes: a midway, concert stages, horse shows, and a food building famous for inventing things that arguably should not exist. Occasionally one of them is great, and finding it is the sport. The strategy is simple. Go on a weekday if you can, arrive at opening, ride the midway before the lines build, and save the food building for when you've earned it.</p>
<h2>The air show</h2>
<p>The Canadian International Air Show closes the CNE over Labour Day weekend, and the jets over the lake are visible from well beyond the grounds. Here's the insider move: skip admission entirely and watch from Trillium Park or the western beaches with a picnic. The lake is the runway, and the lawn is free.</p>
<h2>The rest of the weekend</h2>
<p>Labour Day weekend is peak everything. The lake is at its warmest, the patios are at their most committed, and the whole city has the slightly giddy energy of a last day of camp. It's also quietly a great weekend for the Islands, since the summer crowds thin just a little as families pivot to back-to-school errands.</p>
<h2>A word about the crush</h2>
<p>The Exhibition grounds pull enormous crowds on the holiday weekend, and the parking lots know it. Take the streetcar and glide past the whole mess. DayHop's long-weekend spotlight is live right now, so ask for <a href="/">a Labour Day weekend plan</a> and it will favour the festivals, markets, and fireworks happening around the date.</p>
`
  },
  {
    slug: 'summer-2026-events-recap',
    title: 'The summer 2026 events we’d line up for again',
    description:
      'Dance on Yonge, Dusk Dances, Free Flicks, and pro tennis at Sobeys Stadium. A look back at the Toronto summer events that delivered.',
    hero_image_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=70',
    tags: ['events', 'review', 'toronto', 'summer'],
    author: 'DayHop',
    published_at: '2026-07-12T12:00:00Z',
    html: `
<p>DayHop's event feed watches hundreds of listings a week all summer long. Most events are listings. A few are rituals. These are the ones from this summer's calendar we'd happily line up for again, and the good news is that most of them come back every year.</p>
<h2>Dance on Yonge</h2>
<p>A free multicultural dance festival that takes over Yonge Street's public spaces and turns the city's main artery into a stage. The joy-per-dollar ratio is unbeatable, the dollar in question being zero. The crowd is Toronto at its best-mixed, and you will absolutely end up dancing whether you planned to or not.</p>
<h2>Dusk Dances in Withrow Park</h2>
<p>Contemporary dance performed outdoors as the light fades, with the audience strolling between pieces. It's pay-what-you-can and quietly gorgeous. Every evening it runs, it converts a fresh batch of people who swore they didn't like dance. Watching that happen is half the show.</p>
<h2>Free Flicks at Harbourfront</h2>
<p>Outdoor cinema by the lake, free, all summer. Blanket, sunset, water, film. The formula has never needed improving, and nobody has dared try. Arrive early for the good lawn spots and take the long way along the quay afterward.</p>
<h2>Tennis at Sobeys Stadium</h2>
<p>Every August the National Bank Open brings top-tier professional tennis to York University's grounds. Skip the finals hype and go for the early rounds instead: cheaper tickets, packed outer courts, and you're close enough to hear the strings do their work.</p>
<h2>What they have in common</h2>
<p>Outdoors, low-cost, and communal. That's the shape of a great Toronto summer event, year after year. When next summer's editions are announced, they'll surface in <a href="/">DayHop's feed</a> the same week. The live event sources are literally how this recap got written.</p>
`
  },
  {
    slug: 'ontario-road-trip-new-openings',
    title: 'Road-trip Ontario: new and notable stops worth the tank of gas',
    description:
      'Blue Mountain’s Ridge Runner, the Niagara Parks Power Station, Elora, and Prince Edward County. Ontario stops that justify the drive.',
    hero_image_url: 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=1400&q=70',
    tags: ['ontario', 'road trip', 'new openings'],
    author: 'DayHop',
    published_at: '2026-07-07T12:00:00Z',
    html: `
<p>The GTA is the anchor, but Ontario keeps adding reasons to fill the tank. Here's our rule of thumb for road trips: the destination should earn at least double its drive time. Everything on this list passes comfortably.</p>
<h2>Blue Mountain, Collingwood</h2>
<p>The GTA's default big-adventure day trip keeps upgrading itself. The Ridge Runner mountain coaster, the open-air gondola, ropes courses, and a walkable village at the bottom where tired legs go to recover. Two hours from the city and a complete Adventure-mode day on its own. Georgian Bay's absurdly clear water is the bonus round.</p>
<h2>The Niagara Parks Power Station</h2>
<p>Niagara's best idea in years: a century-old power station on the edge of the falls, restored and opened up, including a tunnel that exits at river level with a view of the falls you simply could not get before. It turns Niagara from "seen it" back into "wait, we have to go see this". Bring someone who thinks they're done with Niagara and watch them recalibrate.</p>
<h2>Elora and the Gorge</h2>
<p>A limestone gorge with a river running through it, attached to one of Ontario's prettiest stone villages. Summer brings the famous quarry swim. Spring and fall bring the gorge trails without the crowds. It's ninety minutes away and feels like a different province.</p>
<h2>Prince Edward County</h2>
<p>Sandbanks' dunes and beaches, a county's worth of wineries, and a food scene that outgrew the word "surprising" years ago. It's the province's best overnight, though it can be done as a very committed single day if you leave early and regret nothing.</p>
<h2>Before you go</h2>
<p>Tell <a href="/">DayHop</a> where you're headed. It plans beyond the GTA, and it checks the live weather for the day you're actually going, which beats optimism as a planning strategy.</p>
`
  },
  {
    slug: 'free-toronto-days',
    title: 'The zero-dollar Toronto day: free things that don’t feel free',
    description:
      'Park yoga, a free zoo, a working farm, world-class libraries, and movies by the lake. A full Toronto day for exactly nothing.',
    hero_image_url: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?auto=format&fit=crop&w=1400&q=70',
    tags: ['free', 'budget', 'toronto'],
    author: 'DayHop',
    published_at: '2026-06-28T12:00:00Z',
    html: `
<p>Toronto has a reputation as an expensive city, and the reputation is earned. But it also quietly runs one of the best free calendars on the continent. Our event feed fills up with zero-dollar listings every single week. Here's how to turn them into an entire day.</p>
<h2>Morning: park yoga and market browsing</h2>
<p>Free community yoga runs all summer in downtown parks, and the sessions in St. James Park, steps from the cathedral, are a standing fixture of our feed. Follow with a wander through St. Lawrence Market. Browsing costs nothing, and the free samples are between you and your conscience.</p>
<h2>Midday: animals, no admission</h2>
<p>High Park's zoo has been free for more than a century, which means bison, llamas, and extremely confident peacocks in the middle of the west end. Riverdale Farm does the same for the east side with a working-farm feel. Both come attached to enough parkland to absorb the whole afternoon if you let them.</p>
<h2>Afternoon: the library is a venue</h2>
<p>The Toronto Public Library is one of the busiest library systems in the world, and its event calendar is entirely free: author talks, kids' programs, workshops, and more. The Reference Library's atrium is worth a visit even if you only come to stand in it and look up.</p>
<h2>Evening: the Bentway and the waterfront</h2>
<p>The park under the Gardiner Expressway hosts free programming all season, which remains a delightfully strange sentence to type. The waterfront's summer calendar, from Free Flicks to festivals at Harbourfront, is the city's best free night out. End on the quay at sunset and congratulate yourself on the budget.</p>
<h2>Ask for it directly</h2>
<p>Every idea card in <a href="/">DayHop</a> carries a cost tier, and the event feed flags free listings automatically. Ask for a free day downtown, and that is literally what you'll get.</p>
`
  },
  {
    slug: 'rr-vs-adventure-day-plans',
    title: 'R&R day or Adventure day? Two perfect GTA Saturdays, planned',
    description:
      'Two complete GTA day plans, one slow and restorative, one full-throttle, and an honest way to know which one you actually need.',
    hero_image_url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1400&q=70',
    tags: ['day plans', 'gta', 'r&r', 'adventure'],
    author: 'DayHop',
    published_at: '2026-06-21T12:00:00Z',
    html: `
<p>DayHop is built around a toggle: R&amp;R or Adventure. It looks like a UI choice. It's actually the first real question of any day off, and most people answer it by accident. Here's one fully-formed Saturday of each, GTA-tested, so you can answer it on purpose.</p>
<h2>The R&amp;R Saturday</h2>
<p><strong>Morning:</strong> Cabbagetown farmers market, a slow coffee, and a visit to the residents of Riverdale Farm. <strong>Midday:</strong> the Brick Works trails until lunch feels earned. <strong>Afternoon:</strong> a long, unproductive hour at Trillium Park. Book optional but recommended. <strong>Evening:</strong> golden hour on the quay and an unhurried dinner wherever the walk ends. Total driving: nearly none. Total decisions: three, all made before ten a.m., which is the whole point.</p>
<h2>The Adventure Saturday</h2>
<p><strong>Morning:</strong> ziplines or the climbing gym while your arms still believe in you. <strong>Midday:</strong> kayak the harbour. The Islands from water level are a different city entirely. <strong>Afternoon:</strong> go-karts or Wonderland's coasters, depending on which direction you're already pointed. <strong>Evening:</strong> the biggest meal of your week. You've earned every bite and you know it. Total driving: some. Total adrenaline: budgeted in the morning, fully spent by dark.</p>
<h2>How to choose</h2>
<p>Here's the honest test: what did your week take out of you? A week of deadlines wants the R&amp;R day, because your nervous system needs restoration, not more stimulus. A week of routine wants the Adventure day, because your nervous system needs news. Couples and families do well alternating weekends, which also happens to be the best argument ever made for planning ahead.</p>
<h2>One sentence either way</h2>
<p>Both of those Saturdays came from a single sentence each. Flip the toggle on <a href="/">DayHop</a>, say what kind of day you want, and it assembles real venues, live weather, and actual events into a plan. When the day changes its mind, it re-plans. Days do that.</p>
`
  },
  {
    slug: 'gta-events-feed-how-it-works',
    title: 'Where DayHop’s events come from (and why it never fakes an all-clear)',
    description:
      'Inside DayHop’s event pipeline: city open data, ticketing feeds, community calendars, and the trust rules the feed lives by.',
    hero_image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=70',
    tags: ['behind the scenes', 'events', 'dayhop'],
    author: 'DayHop',
    published_at: '2026-06-20T12:00:00Z',
    html: `
<p>A day planner is only as good as its sense of what's actually happening. So here's an honest look under the hood at where DayHop's events come from. Useful if you're curious, clarifying if you're comparing planners, and mildly interesting even if you're neither.</p>
<h2>The city itself</h2>
<p>Toronto publishes its official Festivals and Events calendar as open data, with every listing reviewed by city staff before it appears. That feed is a first-class citizen in DayHop. It's where most of the free community events come from, the park yoga and outdoor films and neighbourhood markets, and it's a big part of why the feed feels local rather than just ticketed.</p>
<h2>The ticketed world</h2>
<p>Ticketmaster and Eventbrite cover concerts, sports, and organized happenings, while tour and activity partners cover the bookable-experience layer. Where a partner link exists, cards link straight to booking. Where it doesn't, we link the venue's official website. What you will never get is a shrug in the form of a generic search page.</p>
<h2>The long tail</h2>
<p>Library programs, municipal calendars, and a weekly Canada-wide discovery scan that hunts for newly opened attractions. Every new find has to pass two independent checks before it's allowed into the catalog. That's how a brand-new park at Bloor and Bathurst shows up in the feed the same season it opens, and how a hallucinated one never does.</p>
<h2>The trust rules</h2>
<p>Two rules are absolute. First, no invented events. Every card traces back to a real source, and when the AI curates, it selects and arranges rather than imagines. Second, the advisory system never fakes an all-clear. If we can't reach the weather-alert feed, we tell you the check didn't complete instead of showing you a green light we never verified. A planner you can't trust about a thunderstorm isn't a planner. It's a horoscope.</p>
<p>That's the machinery. The experience stays simple: <a href="/">one sentence, one plan</a>, real places.</p>
`
  },
{
  slug: 'best-fall-colour-walks-kids-gta',
  title: 'Best fall colour walks for kids in the GTA',
  description:
    'Peak colour lasts about two weeks. These GTA walks pair the best October colour with short loops, real washrooms, and a payoff at the end for small legs.',
  hero_image_url: 'https://dayhop.quest/img/heroes/cur-rouge-vista.jpg',
  tags: ['fall colour', 'kids', 'gta', 'trails', 'autumn'],
  author: 'DayHop',
  published_at: '2026-10-20T12:00:00Z',
  html: `
<p>Ontario fall colour is a short show. The maples go all in for roughly two weeks in mid to late October, and then the whole thing is on the ground. With kids, the winning walk is never just about the trees. It needs a short loop, a real washroom, and something at the end that a six year old counts as a payoff. These five deliver the colour and the logistics.</p>
<h2>Rouge National Urban Park, Scarborough and Markham</h2>
<p>Canada's first national urban park is the GTA's fall colour heavyweight, and it is free. On the Toronto side, the Vista and Orchard trails climb to lookouts over a valley that turns every shade of red and gold at once. On the Markham side, Bob Hunter Memorial Park gives you wide meadow and forest trails that are almost never crowded, even on a peak colour weekend. Trailheads have washrooms on the Toronto side. Go early on weekends, because the lots are not big and everybody in the east end has the same idea.</p>
<h2>Dundas Valley Conservation Area, Hamilton</h2>
<p>If you are willing to point the car west, this is the one locals describe with the word outrageous, and in October they are not exaggerating. The Trail Centre anchors a web of marked trails through deep hardwood forest, so you can pick a loop that matches your smallest walker's stamina and bail out early if the day goes sideways. There is a vehicle fee at the lot, washrooms at the centre, and the town of Dundas five minutes away for the post-walk bakery stop. That last part matters more than any trail feature.</p>
<h2>Cedarvale Ravine and the Beltline, Toronto</h2>
<p>The no car option. A crushed stone path runs through a ravine so full of maples that regulars call it a colour tunnel, and you can reach it from St. Clair West or Davisville subway station. The surface takes a stroller fine, the grade is gentle, and the whole thing feels like somebody hid a forest inside midtown. Link it with the Beltline trail and you can walk as far as small legs allow, then climb out to a streetcar whenever the snacks run out.</p>
<h2>Milne Dam Conservation Park, Markham</h2>
<p>The Rouge River widens into a lake behind a historic dam here, and the forested trails loop the water under some of the best colour in York Region. Herons work the shallows, the main paths are easy, and the full loop is a comfortable hour at adult pace, which means a realistic morning with kids and stops. Enter from the McCowan Road side for the quickest route to the dam overlook. Washrooms are seasonal, so plan a café stop in Unionville afterward. You were going to anyway.</p>
<h2>Jefferson Forest and the Oak Ridges Corridor, Richmond Hill</h2>
<p>Richmond Hill sits on the Oak Ridges Moraine, and its forests run quieter than the headline parks. Jefferson Forest, north of Stouffville Road on Bayview, is rooty dirt trail under tall hardwoods, the kind of walk where kids collect leaves the size of dinner plates. The Oak Ridges Corridor nearby rolls across the moraine crest with big sky views between the trees. Neither has facilities, so treat these as the bring a thermos, earn the quiet option for families whose kids are past the playground stage.</p>
<h2>Before you go</h2>
<p>Ontario Parks publishes a fall colour report through the season that tracks how far along the colour is by region, and it is worth a two minute check before you commit to a drive. Weekday mornings beat weekend afternoons everywhere on this list. Dress one layer warmer than the forecast suggests, because ravines and lakeshores run cold once the sun drops, and pack the snack before anyone asks for it.</p>
<p>We walked every one of these routes and wrote them up properly in our <a href="/guides">City Guides</a>, with surfaces, washrooms, parking, and the honest stroller verdict on each. The guides are $20 each, and every updated edition is free forever, so the fall notes stay current as we re-walk them. If you want a taste first, the <a href="/guides">free Ontario Sampler</a> pulls a favourite spot from each guide, and the free Weekend Playbook newsletter sends the week's best outing every Thursday. We outside. See you under the maples.</p>
<h2>Keep exploring</h2>
<ul>
<li><a href="/blog/stroller-friendly-trails-markham">Stroller-friendly trails near Markham</a></li>
<li><a href="/blog/toronto-nature-spots-ttc-kids">Toronto nature spots you can reach by TTC with kids</a></li>
<li><a href="/guides">Browse all six DayHop City Guides</a></li>
</ul>
`
},
{
  slug: 'stroller-friendly-trails-markham',
  title: 'Stroller-friendly trails near Markham',
  description:
    'Paved loops, real washrooms, and bailout routes: the Markham trails that actually work with a stroller, plus the ones to skip until the wheels come off.',
  hero_image_url: 'https://dayhop.quest/img/guide-previews/markham.webp',
  tags: ['stroller', 'markham', 'trails', 'kids', 'york region'],
  author: 'DayHop',
  published_at: '2026-10-21T12:00:00Z',
  html: `
<p>Stroller-friendly is a claim most trail guides make and few earn. With a stroller, you need four things: a surface your wheels survive, a grade you can push one-handed while holding a toddler's sleeve with the other, washrooms within reach, and a bailout route when nap time wins. Markham is surprisingly good at all four, thanks to two river systems running paved paths through the city. These are the walks that actually work.</p>
<h2>Toogood Pond and the Bridle Trail, Unionville</h2>
<p>The classic for a reason. The pond loop at the top of Main Street Unionville is stroller-friendly all the way around, with boardwalk stretches, turtles on logs, and a heritage street waiting at the end for the café stop that makes every outing with a baby feel like a win. When the nap stretches, continue north on the Bridle Trail along Bruce Creek on a gravel-paved mix that stays stroller-ok, then exit wherever you like. Parking at Toogood, washrooms in the park, ice cream on Main Street. This is the outing you repeat weekly.</p>
<h2>Milliken Mills Park</h2>
<p>A big stormwater lake that birds treat as habitat, ringed by a fully paved loop that takes every kind of wheel. The path is flat, wide, and looped, so there is no committing to an out-and-back that runs longer than the baby's mood. Washrooms sit at the community centre, there is a playground beside the path for the older sibling who has outgrown the seat, and fishing platforms over the water give the walk a destination. Early morning is bird time, which suits the hours babies keep anyway.</p>
<h2>German Mills Creek trail, Thornhill</h2>
<p>Paved throughout, with the kind of deep tree canopy that keeps a summer walk ten degrees cooler and an autumn walk dripping with colour. Start at the John Street end where parking is easy, and follow the creek south for as long as the stroller cooperates. The main path is stroller ok with room to pass joggers, and it connects south toward the East Don trail system if you ever get a walk where nobody wants to stop. Street and small lots at the trailheads.</p>
<h2>Aaniin and Middlefield stormwater trails</h2>
<p>The sleeper pick. Paved paths loop through the neighbourhood's pond system with a free lot at the community centre, washrooms inside the building, and transit that actually reaches it. These are short, flat, shady loops that suit the 45-minute window between feeds better than any headline trail. Perfect for the parent who just needs to be outside with the baby right now, not plan an expedition.</p>
<h2>Cornell community trails</h2>
<p>Paved neighbourhood connectors out to the Little Rouge fringe, all stroller ok, with the kind of evening light that makes a boring day feel complete. This is the after-dinner walk, the one that fits between supper and bedtime when the day needs saving. Park in the neighbourhood, keep it to twenty minutes, and let the baby fall asleep to motion. Some of the best outings are the smallest ones.</p>
<h2>The ones to skip, for now</h2>
<p>Honest notes, because the guide's job is telling you where not to go too. The Rouge Valley trails at Box Grove run on rough valley paths and are car-access only, so save them for the carrier years. Bob Hunter Memorial Park's mown grass loops are lovely but have no facilities and no real surface under the wheels, which matters when the weather turns. And Swan Lake's gravel loop is mostly level but reads better as a toddler-walking walk than a stroller push.</p>
<p>Every one of these routes, plus the full amenity truth on surfaces, washrooms, parking, and playgrounds, is written up in the <a href="/guides#markham">Markham Nature Guide</a>. It is $20, and every updated edition is free forever, because playgrounds close and paths get repaved and the guide should keep up. Or grab the <a href="/guides">free Ontario Sampler</a> first and see how we write. We outside, and so is the stroller.</p>
<h2>Keep exploring</h2>
<ul>
<li><a href="/blog/best-fall-colour-walks-kids-gta">Best fall colour walks for kids in the GTA</a></li>
<li><a href="/blog/things-to-do-kids-richmond-hill-weekend">What to do with kids in Richmond Hill this weekend</a></li>
<li><a href="/guides">Browse all six DayHop City Guides</a></li>
</ul>
`
},
{
  slug: 'things-to-do-kids-richmond-hill-weekend',
  title: 'What to do with kids in Richmond Hill this weekend',
  description:
    'A Richmond Hill weekend that works: a pond loop in the morning, moraine woods after lunch, and telescope time after dark. All local, mostly free.',
  hero_image_url: 'https://dayhop.quest/img/guide-previews/richmond-hill.webp',
  tags: ['richmond hill', 'weekend', 'kids', 'york region'],
  author: 'DayHop',
  published_at: '2026-10-22T12:00:00Z',
  html: `
<p>Richmond Hill keeps a secret better than any town in the GTA. It sits on the Oak Ridges Moraine, the ridge of sand and gravel the glaciers left behind, which means kettle lakes, cold creeks, and real forest inside a town most people only drive through. Here is a weekend shape that uses it properly: gentle morning, proper woods after lunch, and something after dark that kids actually remember.</p>
<h2>Morning: Mill Pond Park</h2>
<p>Start slow. Mill Pond, on Mill Street in the middle of town, has a stroller-friendly loop around a spring-fed pond, washrooms in season, and free parking between the lot and the street. Ducks expect company. The loop is short enough to finish before the first snack request escalates, and the coffee on town's west side is close enough to make a lap of it a ritual. All four seasons, this park just works.</p>
<h2>Late morning: Phyllis Rawlinson Park</h2>
<p>When the kids wake all the way up, drive ten minutes north to Leslie Street. Phyllis Rawlinson Park is meadow country: grass and gravel paths through tall grass, a free lot, and a feel you do not get inside a town of 200,000. Bring a ball, bring the kite that never quite worked at the beach, and let everybody run in a straight line for once. No agenda beyond lunch. That is the agenda.</p>
<h2>After lunch: Jefferson Forest or the Oak Ridges Corridor</h2>
<p>The afternoon walk should feel like you left. Jefferson Forest, off Bayview north of Stouffville Road, is rooty dirt trail under tall hardwoods, quiet enough that kids start whispering without being asked. In mid October the colour here is the best in town and the leaves on the ground are ankle deep in places. Families wanting an easier grade should try the Oak Ridges Corridor trails instead, where the moraine opens up into meadows and long views. Neither spot has facilities, so handle the essentials before you leave lunch.</p>
<h2>Evening: David Dunlap Observatory</h2>
<p>The closer. Canada's largest optical telescope lives under a great dome right here in Richmond Hill, and its public star nights put kids' eyes to glass that working astronomers used. Sessions book up, so check the schedule early in the week rather than Saturday afternoon. If the sky does not cooperate, the fallback is honest: Richmond Green, with its big flat paved paths and the sports complex as a warm-up stop, burns the last energy without anyone having to call it a compromise.</p>
<h2>Lake weeks: Lake Wilcox</h2>
<p>Save the lake for the warmest weekend afternoon. Lake Wilcox Park, up in Oak Ridges, has a paved promenade along the water, sandy spots for digging, and washrooms in the park, with free lots that fill on proper summer weekends. In October the summer crowds are gone and the lake does its best work as a mood: grey herons, low light, and a bench with no one asking for your seat. Pack the picnic blanket, not the swim bag. The season for one ended, the season for the other is perfect right now.</p>
<h2>Make it a habit, not an event</h2>
<p>The trick to Richmond Hill weekends is not finding the places. It is using them on rotation, so no single spot wears out. Pond weeks, forest weeks, lake weeks at Lake Wilcox when the promenade calls. We wrote the whole rotation up in the <a href="/guides/richmond-hill">Richmond Hill Nature Guide</a>: $20, with every updated edition free forever as seasons and facilities change. If you would rather start free, the <a href="/guides">Ontario Sampler</a> gives you one favourite from this guide and five others, and the <a href="/playbook">Weekend Playbook</a> lands every Thursday with the week's picks and the weather call. We outside. Make it weekly.</p>
<h2>Keep exploring</h2>
<ul>
<li><a href="/blog/stargazing-near-toronto">Stargazing near Toronto: where the sky actually gets dark</a></li>
<li><a href="/blog/best-fall-colour-walks-kids-gta">Best fall colour walks for kids in the GTA</a></li>
<li><a href="/playbook">Get the free Weekend Playbook</a></li>
</ul>
`
},
{
  slug: 'toronto-nature-spots-ttc-kids',
  title: 'Toronto nature spots you can reach by TTC with kids',
  description:
    'No car, no problem. Real Toronto wilderness, all reachable on a Presto card: subway ravines, a ferry ride to the Islands, and a brick factory reborn as a trailhead.',
  hero_image_url: 'https://dayhop.quest/img/heroes/cur-high-park-zoo.jpg',
  tags: ['ttc', 'toronto', 'kids', 'transit', 'ravines'],
  author: 'DayHop',
  published_at: '2026-10-23T12:00:00Z',
  html: `
<p>Toronto's founding accident is the best thing that ever happened to family weekends. The city grew up around a network of ravines and a lakefront that were too flood-prone to build in, so the wilderness stayed, and the transit system grew up around it. The result: some of the best urban nature in the country is a subway ride away. Here is what actually works with kids, Presto card in hand.</p>
<h2>High Park</h2>
<p>Get off at High Park station on Line 2 and you are there. The city's big green lung holds the free High Park Zoo, which is the rare outing that costs nothing and never disappoints, plus trails that range from paved loops to proper ravine walking, and fall colour that rivals anywhere in the city. Paved and dirt mix underfoot, washrooms in the park, and the cherry blossoms in late April cause a citywide frenzy you should see at least once. With kids, the zoo anchors the morning and the Grenadier Pond loop closes the afternoon.</p>
<h2>Evergreen Brick Works</h2>
<p>A century-old brick factory in the Don Valley, reborn as a year-round market and the best trailhead in the ravine system. The free shuttle from Broadview station makes it fully car-free, and the site itself is stroller ok with washrooms on site. Walk twenty minutes in any direction and you are in total forest, with your phone still showing full signal. Saturday markets mean the outing doubles as lunch, which is the whole trick of a transit day: never plan an activity that is not also near food.</p>
<h2>Cedarvale Ravine and the Beltline</h2>
<p>The midtown secret. Cedarvale Ravine runs a crushed stone path under a maple canopy so dense that locals call it a colour tunnel, and you can walk in from St. Clair West or Davisville station with no parking logistics at all. The Beltline continues the deal east on an old rail line, giving you a flat straight shot the kids can scooter while you walk. When the legs or the mood run out, surface streets are right there with transit home. This is the outing for the parent who wants nature and the parent who wants logistics to each win.</p>
<h2>The Humber River at Old Mill</h2>
<p>Old Mill station drops you onto the Humber River Recreational Trail, a paved river valley walk that feels a world away from the subway platform. Through September and October, the river below runs with migrating salmon and the banks go purple with asters, which gives the walk a destination in exactly the months you are reading this. Paid and free parking options exist for driving friends, but the station is the whole point: river, salmon, and a warm-up stop in the old mill village, all without a car.</p>
<h2>The Toronto Islands</h2>
<p>Twenty minutes from downtown by ferry, with no cars allowed at the other end. The Jack Layton Ferry Terminal is a short walk from Union Station, and on the other side the Islands give you beaches, boardwalk trails, playgrounds, and a skyline view back at the city that never gets old. Bike rentals on the Island mean the older kids ride while the little ones stay in the stroller. Pack for wind. The lake breeze is the one honest surprise every first-timer meets.</p>
<h2>Taylor Creek Park</h2>
<p>The east end's easy win. Free lots off O'Connor for driving friends, but genuinely TTC-adjacent for everyone else, with paved paths that take every wheel and a marshy creek that ducks and herons use year-round. It is not the most dramatic spot on this list, and that is precisely its job: the dependable forty-five minute outing between the ambitious ones.</p>
<h2>The transit playbook</h2>
<p>Two rules make TTC nature days work. First, the Presto card rides everything but keep an eye on service alerts before you leave, because a weekend subway closure rewrites any plan. Second, give yourself one honest exception: Rouge National Urban Park, the fall colour champion of the east end, belongs to the GO train via Rouge Hill station, not the TTC. Worth knowing, and worth doing, just not on this list.</p>
<p>Every route here, plus the honest transit notes on lots, buses, and the shuttle timing, is written up in the <a href="/guides#toronto">Toronto City Nature Spots guide</a>: $20, with every updated edition free forever, so the shuttle and ferry details stay current. Or start free with the <a href="/guides">Ontario Sampler</a> and the Thursday <a href="/playbook">Weekend Playbook</a>, which flags the weekend picks and the weather call. We outside, and the subway gets you there.</p>
<h2>Keep exploring</h2>
<ul>
<li><a href="/blog/toronto-hidden-gems-insiders">The Toronto spots locals keep to themselves</a></li>
<li><a href="/blog/first-timers-toronto-must-sees">First time in Toronto? The must-sees that are actually must-sees</a></li>
<li><a href="/guides">Browse all six DayHop City Guides</a></li>
</ul>
`
}
];
