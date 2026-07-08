// services/grok.js — DayHop V2
// Talks to the Grok (x.ai) API and turns a natural-language prompt into
// a structured list of local adventure ideas, plus an optional ordered
// "day plan" assembled from a shortlist.

const axios = require('axios');

const GROK_API_URL = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4';
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Richmond Hill';
const DEFAULT_REGION = process.env.DEFAULT_REGION || 'Ontario';

const client = axios.create({ timeout: 25000 });

// When the user hasn't pinned a single city, DayHop plans across the whole
// Greater Toronto Area. We detect that intent from a few common phrasings.
function isGtaWide(city) {
  if (!city) return true;
  return /across the gta|whole gta|all of the gta|entire gta|gta[\s-]?wide|greater toronto area/i
    .test(String(city).trim());
}

function planningArea(city, region) {
  if (isGtaWide(city)) return 'the Greater Toronto Area';
  return `${city}, ${region} and the wider Greater Toronto Area`;
}

function locationRule(city) {
  if (isGtaWide(city)) {
    return `- The user wants ideas from across the Greater Toronto Area. Draw from a healthy mix of areas — Toronto itself (downtown, the waterfront, the Islands, Scarborough Bluffs, High Park) and the surrounding regions: York (Richmond Hill, Markham, Vaughan, Newmarket, Aurora), Peel (Mississauga, Brampton, Caledon), Halton (Oakville, Burlington, Milton), and Durham (Pickering, Ajax, Whitby, Oshawa). Spread suggestions across a few different parts of the GTA rather than clustering them all in one city, unless the user names a specific area.`;
  }
  return `- Center suggestions on ${city} and what's a reasonable drive from it within the Greater Toronto Area. You may include a standout option a bit further out, but most ideas should be in or near ${city}. Defer to any other location the user names in their request.`;
}

function assertConfigured() {
  if (!process.env.GROK_API_KEY) {
    const err = new Error('GROK_API_KEY is not set. Add it to your .env file.');
    err.code = 'GROK_NOT_CONFIGURED';
    throw err;
  }
}

function buildSystemPrompt({ city, region }) {
  return `You are the planning engine behind DayHop, a trusted AI local adventure companion for busy families in ${planningArea(city, region)}.

Your job: turn a parent's natural-language request into a short list of realistic, specific, low-overwhelm day-out ideas.

Hard rules:
${locationRule(city)}
- Prioritize: family-friendly activities, World Cup 2026 watch parties/public viewings, splash pads & playgrounds, patios & rooftops, beaches & waterparks, day cruises, and standout local experiences (helicopter tours, etc.) when relevant to the prompt.
- Never invent a fake specific business name with false confidence — if unsure of an exact venue, describe the type of place and area generically (e.g. "a family-friendly patio near Yonge & 16th") rather than fabricating a precise address or claiming a brand exists.
- Keep tone warm, plain, and trustworthy. No hype, no exclamation overload.
- Each idea must include a clear, honest one-line "why" — the actual reason it fits the request, not generic marketing copy.
- Return ONLY valid JSON. No markdown fences, no commentary, no preamble.

JSON shape to return:
{
  "ideas": [
    {
      "id": "string, kebab-case unique slug",
      "title": "string, specific and concrete",
      "category": "one of: worldcup | kids | patios | water | cruises | adventures | culture | food | general",
      "why": "string, one sentence, honest reason this fits",
      "location": "string, the area or neighbourhood — always name which GTA city/town it's in (e.g. 'Harbourfront, Toronto' or 'Mill Pond, Richmond Hill')",
      "duration_minutes": number,
      "good_for_ages": "string, e.g. 'all ages' or '3-8 years'",
      "cost_tier": "one of: free | $ | $$ | $$$"
    }
  ]
}

Return 6-10 ideas unless the user's request is narrow, in which case return fewer high-quality matches rather than padding with weak ones.`;
}

/**
 * Grounded variant: instead of letting Grok invent venues, we feed it real
 * candidate data (Google Places results + bookable Viator/GetYourGuide
 * activities + live weather) and ask it to select, arrange, and explain —
 * not fabricate. This is what makes DayHop trustworthy with real venues
 * instead of just confidently wrong.
 */
function buildGroundedSystemPrompt({ city, weatherHint }) {
  return `You are the planning engine behind DayHop, a trusted AI local adventure companion, currently planning for ${city}.

You will be given a user request plus a JSON list of REAL candidate places, live local events, and bookable activities (from Google Places, Ticketmaster, Eventbrite, city open-data event calendars, Viator, GetYourGuide, and DayHop's curated list). ${weatherHint || ''}

Hard rules:
- Only recommend items that appear in the provided candidate list. Do not invent venues that are not in the candidates.
- If the candidates don't cover something the user asked for, say so honestly in that idea's "why" rather than fabricating a match — or simply omit that angle.
- Use the live weather context to favor indoor or outdoor picks appropriately, and mention it briefly in "why" when it materially affected the choice.
- Preserve each selected item's "id" and "source" fields exactly as given so we can re-attach booking/map links.
- Dated events only fit if their date works for the request; prefer sooner over later and mention the date in "why".
- Keep tone warm, plain, and trustworthy. No hype.
- Return ONLY valid JSON, no markdown fences, no commentary.

JSON shape to return:
{
  "ideas": [
    {
      "id": "string — copy the candidate's original id field exactly",
      "source": "copy the candidate's source field exactly (e.g. google_places, ticketmaster, eventbrite, toronto_open_data, york_open_data, curated, viator, getyourguide)",
      "title": "string, from the candidate, lightly cleaned up if needed",
      "category": "one of: worldcup | kids | patios | water | cruises | adventures | culture | food | general",
      "why": "string, one sentence, honest reason this fits the request (and weather, if relevant)",
      "location": "string, neighborhood or area name",
      "good_for_ages": "string",
      "cost_tier": "one of: free | $ | $$ | $$$"
    }
  ]
}

Select 6-10 of the strongest candidates for the request. Quality over quantity.`;
}

function buildPlanSystemPrompt({ city }) {
  const where = isGtaWide(city) ? 'the Greater Toronto Area' : `${city} and the GTA`;
  return `You are DayHop's day-plan assembler. Given a parent's shortlist of selected activities across ${where}, arrange them into a realistic, well-paced day itinerary.

Hard rules:
- Order items logically by time of day and rough geographic sense. Shortlisted stops may sit in different GTA cities, so account for realistic travel time between areas (e.g. Oakville to Pickering is a long cross-region drive) and group nearby stops together rather than zigzagging across the region.
- Insert a short transition note between items only when it adds real value (e.g. travel time, meal timing) — otherwise omit it.
- Suggest a sensible start time for the whole day based on the items given.
- Flag (politely, in "notes") if the day looks overpacked or geographically scattered, and suggest what to cut — DayHop's job is to reduce overwhelm, not maximize activity count.
- Return ONLY valid JSON, no markdown fences, no commentary.

JSON shape:
{
  "plan_title": "string, short and specific to the day",
  "start_time": "string, e.g. '10:00 AM'",
  "stops": [
    {
      "id": "string, matches the input item id",
      "title": "string",
      "suggested_time": "string, e.g. '10:00 AM - 11:30 AM'",
      "transition_note": "string or empty string if not needed"
    }
  ],
  "notes": "string, empty string if the day is well-paced, otherwise a brief honest flag"
}`;
}

function extractJson(rawText) {
  if (!rawText) throw new Error('Empty response from Grok');
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');
  return JSON.parse(cleaned);
}

async function callGrok(messages, { temperature = 0.7 } = {}) {
  assertConfigured();

  const response = await client.post(
    GROK_API_URL,
    {
      model: GROK_MODEL,
      messages,
      temperature,
      response_format: { type: 'json_object' }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response && response.data && response.data.choices && response.data.choices[0]
    ? response.data.choices[0].message.content
    : null;

  return extractJson(content);
}

async function generateIdeas({ prompt, city = DEFAULT_CITY, region = DEFAULT_REGION, filter }) {
  if (!prompt || !prompt.trim()) {
    const err = new Error('Prompt is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const userMessage = filter && filter !== 'all'
    ? `${prompt}\n\n(User currently has the "${filter}" filter active — weight ideas toward that category where it genuinely fits, but don't force a bad match.)`
    : prompt;

  const messages = [
    { role: 'system', content: buildSystemPrompt({ city, region }) },
    { role: 'user', content: userMessage }
  ];

  const result = await callGrok(messages, { temperature: 0.75 });

  if (!result || !Array.isArray(result.ideas)) {
    const err = new Error('Grok returned an unexpected shape');
    err.code = 'GROK_BAD_SHAPE';
    throw err;
  }

  return result.ideas;
}

/**
 * Select and explain ideas from a pool of REAL candidates (Google Places,
 * Viator, GetYourGuide) rather than letting the model invent venues.
 * Falls back gracefully — caller decides what to do if candidates is empty.
 *
 * @param {Object} opts
 * @param {string} opts.prompt - user's natural language request
 * @param {string} opts.city
 * @param {Array} opts.candidates - normalized candidate objects, each tagged with a `source`
 * @param {Object} [opts.weather] - output of services/weather.getConditions
 */
async function generateGroundedIdeas({ prompt, city = DEFAULT_CITY, candidates, weather }) {
  if (!prompt || !prompt.trim()) {
    const err = new Error('Prompt is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const err = new Error('No candidates provided for grounded generation');
    err.code = 'NO_CANDIDATES';
    throw err;
  }

  const weatherHint = weather ? require('./weather').toPromptHint(weather) : '';

  const userMessage = JSON.stringify({
    request: prompt,
    candidates: candidates.slice(0, 40) // keep token usage sane
  });

  const messages = [
    { role: 'system', content: buildGroundedSystemPrompt({ city, weatherHint }) },
    { role: 'user', content: userMessage }
  ];

  const result = await callGrok(messages, { temperature: 0.5 });

  if (!result || !Array.isArray(result.ideas)) {
    const err = new Error('Grok returned an unexpected shape');
    err.code = 'GROK_BAD_SHAPE';
    throw err;
  }

  return result.ideas;
}

async function buildDayPlan({ items, city = DEFAULT_CITY }) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('At least one shortlisted item is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const messages = [
    { role: 'system', content: buildPlanSystemPrompt({ city }) },
    { role: 'user', content: JSON.stringify({ items }) }
  ];

  return callGrok(messages, { temperature: 0.4 });
}

module.exports = {
  generateIdeas,
  generateGroundedIdeas,
  buildDayPlan
};
