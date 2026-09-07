// services/venueGates.js — DayHop V2
// The two venue rules that hold everywhere a place can enter DayHop —
// the live feed (candidates.js), the Sunday discovery autopilot
// (autoCatalog.js) and the weekly "Talk of the town" picker (talkOfTown.js):
//
//   1. A bar or restaurant without a patio is out. Google's outdoorSeating
//      flag is the truth when it exists; outdoor words in the copy rescue
//      an entry the flag doesn't cover; unknown counts as no patio.
//   2. A drinking-first venue (bar, pub, night club, brewery taproom, wine
//      bar…) with no food identity is out, patio or not. DayHop plans days,
//      not nights out.
//
// Founder rule, 2026-09-07 ("gate restaurants without a patio and locations
// that are for drinking only"). Dated events are exempt from rule 1 — an
// event happens AT a venue; the rule is about venue listings themselves —
// but never from rule 2.

// Drinking-first Google place types; restaurants match on the type substring
// ('restaurant', 'brunch_restaurant', …). Cafés, bakeries, dessert shops,
// and markets deliberately stay outside the gate — "bars and restaurants"
// is the product rule, not "anywhere food exists".
const BAR_TYPES = new Set(['bar', 'pub', 'night_club', 'wine_bar', 'bar_and_grill', 'brewery', 'winery', 'liquor_store']);
// Types that give a drinking venue a food identity (a brewpub with a kitchen
// is a restaurant with beer, not a taproom).
const FOOD_TYPES_RE = /restaurant|cafe|coffee_shop|bakery|food|meal_takeaway|meal_delivery|diner|pizza|steak_house|sandwich_shop|ice_cream_shop/;
// Textual read for sources without Google types (curated catalog, partners).
const BAR_RESTO_TEXT_RE = /\b(bars?|pub|brewery|taproom|gastropub|restaurants?|bistro|eatery|steakhouse|izakaya|brasserie|cantina)\b/i;
const DRINK_TEXT_RE = /\b(bars?|pub|brewery|breweries|taproom|tap\s?room|lounge|cocktail|speakeasy|night\s?club|nightclub|wine\s?bar|beer\s?hall|distillery|tasting\s?room)\b/i;
const FOOD_TEXT_RE = /\b(restaurant|kitchen|eatery|bistro|brunch|dinner|lunch|menu|dishes?|tacos?|pizza|burgers?|noodles?|ramen|sushi|dumplings?|bbq|barbecue|gastropub|food)\b/i;
// Outdoor evidence in the copy rescues an entry the flag doesn't cover.
const OUTDOOR_RE = /\b(patios?|terrace|terrasse|rooftop|roof\s?top|beer\s?garden|biergarten|al\s?fresco|outdoor\s(seating|dining|bar|tables?|patio))\b/i;

function textOf(c) {
  return [c.title, c.name, c.description, c.summary, c.kind,
    Array.isArray(c.tags) ? c.tags.join(' ') : ''].filter(Boolean).join(' ');
}

function isDrinkTyped(types) {
  return (Array.isArray(types) ? types : []).some(t => BAR_TYPES.has(t));
}
function isFoodTyped(types) {
  return (Array.isArray(types) ? types : []).some(t => FOOD_TYPES_RE.test(String(t)));
}

/** Rule 2: drinking-first with no food identity. */
function isDrinkingOnly(c) {
  const types = Array.isArray(c.types) ? c.types : [];
  const text = textOf(c);
  const drinkTyped = isDrinkTyped(types);
  const drinkText = DRINK_TEXT_RE.test(text);
  if (!drinkTyped && !drinkText) return false;
  if (isFoodTyped(types)) return false;
  if (FOOD_TEXT_RE.test(text)) return false;
  return true;
}

/** Rule 1 (the feed's long-standing outdoor-space gate). */
function isIndoorOnlyBarOrRestaurant(c) {
  // Dated events are experiences that happen AT venues (comedy night,
  // tasting) — the rule is about the venues themselves.
  if (c.date) return false;
  const types = Array.isArray(c.types) ? c.types : [];
  const typed = types.some(t => BAR_TYPES.has(t) || String(t).includes('restaurant'));
  const text = textOf(c);
  if (!typed && !BAR_RESTO_TEXT_RE.test(text)) return false; // not a bar/restaurant
  if (c.outdoor_seating === true) return false;              // Google vouches for the patio
  if (OUTDOOR_RE.test(text)) return false;                   // the copy promises outdoor space
  return true;                                               // indoor-only → out
}

/** Does this look like a bar/restaurant at all (so a Places patio check is worth buying)? */
function looksLikeBarOrRestaurant(c) {
  const types = Array.isArray(c.types) ? c.types : [];
  if (types.some(t => BAR_TYPES.has(t) || String(t).includes('restaurant'))) return true;
  return BAR_RESTO_TEXT_RE.test(textOf(c)) || DRINK_TEXT_RE.test(textOf(c)) || c.category === 'food';
}

/**
 * Both rules at once, for the publish-time gates.
 * @returns {{pass: boolean, reason?: 'drinking_only'|'no_patio'}}
 */
function venueGateVerdict(c) {
  if (isDrinkingOnly(c)) return { pass: false, reason: 'drinking_only' };
  if (isIndoorOnlyBarOrRestaurant(c)) return { pass: false, reason: 'no_patio' };
  return { pass: true };
}

module.exports = {
  BAR_TYPES, BAR_RESTO_TEXT_RE, OUTDOOR_RE,
  isIndoorOnlyBarOrRestaurant, isDrinkingOnly, looksLikeBarOrRestaurant, venueGateVerdict
};
