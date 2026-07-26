// services/grok.js — DayHop V2
// Talks to the Grok (x.ai) API and turns a natural-language prompt into
// a structured list of local adventure ideas, plus an optional ordered
// "day plan" assembled from a shortlist.

const axios = require('axios');

const GROK_API_URL = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
// Fast non-reasoning variant on purpose: feed generation is a selection/copy
// task, and a reasoning model here burns ~5-10x output tokens and pushes
// latency toward the request timeout. Never default to a reasoning model.
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4.20-0309-non-reasoning';
if (!process.env.GROK_MODEL) {
  console.warn(`[grok] GROK_MODEL not set — defaulting to ${GROK_MODEL}`);
} else {
  console.log(`[grok] model: ${GROK_MODEL}`);
}
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Richmond Hill';
const DEFAULT_REGION = process.env.DEFAULT_REGION || 'Ontario';

// 45s: generous headroom even now that we ask for 12-18 best-only ideas
// (latency scales with output length).
const client = axios.create({ timeout: 45000 });

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

// ---------- Modes: R&R vs Adventure ----------
// The client's mode toggle arrives as `mode` on every AI call. Anything
// unrecognized (including older clients sending nothing) is R&R.
const VALID_MODES = new Set(['rr', 'adventure']);
function normalizeMode(mode) {
  return VALID_MODES.has(mode) ? mode : 'rr';
}

const MODE_DIRECTIVES = {
  rr: `- The user is in R&R (Rest & Relaxation) mode: strongly prefer restorative, scenic, calming experiences — peaceful trails and gardens, lookouts and viewpoints, natural springs, quiet beaches, waterfront strolls, conservation areas, unhurried cafés, calm museums and galleries, spas. Keep the whole set low-stimulation and low-crowd where possible. Avoid high-adrenaline activities (ziplining, karting, bungee, paintball) unless the user explicitly asks for one.`,
  adventure: `- The user is in Adventure mode: strongly prefer active, thrilling, adventurous experiences — ziplining and aerial parks, rock climbing, mountain biking, kayaking, paddleboarding, rafting, paragliding, bungee, go-karting, quad biking, skiing and snowboarding, high-energy attractions. Be open with inclusion: any legal, available activity that fits the spirit belongs. Calm or scenic options should appear only as brief recovery or meal breaks between activities.`
};

const MODE_PLAN_DIRECTIVES = {
  rr: `- The user is in R&R mode: pace the day gently — generous time at each stop, unhurried transitions, built-in downtime. Never make the day feel like a checklist.`,
  adventure: `- The user is in Adventure mode: pace the day with energy — put the most physically demanding activity when energy is highest, treat meals as refuel breaks, and keep momentum between stops.`
};

function modeDirective(mode) { return MODE_DIRECTIVES[normalizeMode(mode)]; }
function modePlanDirective(mode) { return MODE_PLAN_DIRECTIVES[normalizeMode(mode)]; }

// Seasonal spotlight (services/spotlight.js): what the priority clause
// promotes — World Cup watch parties while the tournament is live, then
// events around the next Ontario stat-holiday long weekend, forever.
const { getSpotlight } = require('./spotlight');

function seasonalPriorityPhrase() {
  const sp = getSpotlight();
  if (!sp) return 'seasonal events';
  if (sp.kind === 'worldcup') return 'World Cup 2026 watch parties/public viewings';
  return `events and festivals around the ${sp.name}${sp.long_weekend ? ' long weekend' : ''} (${sp.range})`;
}

// Extra grounded-prompt rule while a holiday spotlight is active.
function spotlightRule() {
  const sp = getSpotlight();
  return sp && sp.kind === 'holiday' ? `- ${sp.prompt_hint}\n` : '';
}

function assertConfigured() {
  if (!process.env.GROK_API_KEY) {
    const err = new Error('GROK_API_KEY is not set. Add it to your .env file.');
    err.code = 'GROK_NOT_CONFIGURED';
    throw err;
  }
}

function buildSystemPrompt({ city, region, mode }) {
  return `You are the planning engine behind DayHop, a trusted AI local adventure companion for busy families in ${planningArea(city, region)}.

Your job: turn a parent's natural-language request into a short list of realistic, specific, low-overwhelm day-out ideas.

Hard rules:
${locationRule(city)}
${modeDirective(mode)}
- Prioritize: family-friendly activities, ${seasonalPriorityPhrase()}, splash pads & playgrounds, patios & rooftops, beaches & waterparks, day cruises, and standout local experiences (helicopter tours, etc.) when relevant to the prompt.
- Never invent a fake specific business name with false confidence — if unsure of an exact venue, describe the type of place and area generically (e.g. "a family-friendly patio near Yonge & 16th") rather than fabricating a precise address or claiming a brand exists.
- Keep tone warm, plain, and trustworthy. No hype, no exclamation overload.
- Each idea's "why" is one short, warm, benefit-driven sentence (max ~110 characters): how it feels and why it fits their request — never a feature list. Good: "Lively sports bar with big screens and great craft beer — perfect for catching the match with friends." Bad: "Sports bar with multiple big screens perfect for afternoon World Cup watch parties with friends and craft beer options."
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
      "cost_tier": "one of: free | $ | $$ | $$$",
      "wow_reason": "OPTIONAL — include ONLY on the 2-4 stretch ideas: one warm sentence connecting what the user asked for to this unexpected find, e.g. 'You asked for swimming — did you know you can rent a kayak right at Harbourfront?' Omit this field entirely on regular ideas."
    }
  ]
}

Return 8 to 12 ideas — quality over quantity. Every idea must be one you would honestly rate 10/10 for this request: a genuinely excellent place or experience AND a strong fit for what was asked. If an idea is merely "pretty good", leave it out. Cover the request directly first, then broaden to adjacent ideas the user would plausibly love — for example, if they asked about swimming, also include beaches, splash pads, lakes, paddling, and waterparks. Then include 1-3 "stretch" ideas the user did not ask for but a GTA family would be genuinely excited to discover (a helicopter tour, a treetop zipline course, a hidden-gem beach), each carrying a "wow_reason". If fewer than 8 truly excellent ideas exist, return fewer — never pad.`;
}

/**
 * Grounded variant: instead of letting Grok invent venues, we feed it real
 * candidate data (Google Places results + bookable Viator/GetYourGuide
 * activities + live weather) and ask it to select, arrange, and explain —
 * not fabricate. This is what makes DayHop trustworthy with real venues
 * instead of just confidently wrong.
 */
// Shared advisory rules for every prompt that receives an advisoriesHint.
// Safety-first but not alarmist: honor the advisory, still serve the user.
// Written as hard numeric constraints — the fast non-reasoning model
// follows "at most 3" far more reliably than "prefer".
function advisoryRules(advisoriesHint) {
  if (!advisoriesHint) return '';
  return `- ADVISORIES ARE IN EFFECT (see ACTIVE ADVISORIES above). Serve the user's request, but honestly: every outdoor/open-air pick's "why" MUST end with a short practical clause acknowledging the advisory (e.g. "— one to save for when the smoke clears" or "— go early before the heat peaks"). Never claim an outdoor place is protected or unaffected (no "sheltered from the smoke" for an open park), and never call an outdoor pick perfect for today.
- Also include 2-3 of the best indoor or genuinely covered candidates as advisory-safe alternatives, even if the request leaned outdoor — the user may not know about the advisory yet.
- Warm and practical, never alarmist: one short clause per affected pick is enough.
`;
}

function buildGroundedSystemPrompt({ city, weatherHint, advisoriesHint, dateHint, mode }) {
  return `You are the planning engine behind DayHop, a trusted AI local adventure companion, currently planning for ${city}.

You will be given a user request plus a JSON list of REAL candidate places, live local events, and bookable activities (from Google Places, Ticketmaster, Eventbrite, city open-data event calendars, Viator, GetYourGuide, and DayHop's curated list). ${weatherHint || ''}${advisoriesHint ? `\n\n${advisoriesHint}` : ''}${dateHint ? `\n\n${dateHint}` : ''}

Hard rules:
- Only recommend items that appear in the provided candidate list. Do not invent venues that are not in the candidates.
${advisoryRules(advisoriesHint)}${modeDirective(mode)}
- If the candidates don't cover something the user asked for, say so honestly in that idea's "why" rather than fabricating a match — or simply omit that angle.
- Use the live weather context to favor indoor or outdoor picks appropriately, and mention it briefly in "why" when it materially affected the choice.
- Preserve each selected item's "id" and "source" fields exactly as given so we can re-attach booking/map links.
- Dated events only fit if their date works for the request; prefer sooner over later and mention the date in "why".
${spotlightRule()}
- If an "active_filter" is provided in the request, weight your selection toward that category where it genuinely fits, but never force a bad match.
- Never select two candidates that are effectively the same place or event under slightly different names — keep the one with better data (rating, booking link) and drop the other.
- When candidates include "km_away" (distance from the user's location or their chosen area), STRONGLY prefer closer options when quality is comparable — nearby gems beat marginally-better-but-distant ones. You may mention proximity in "why" (e.g. "just up the road" — but never claim a walking distance you can't know).
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
      "why": "one short, warm, benefit-driven sentence (max ~110 characters) — how it feels and why it fits the request (and weather, if relevant), never a feature list. Good: 'Lively sports bar with big screens and great craft beer — perfect for catching the match with friends.'",
      "location": "string, neighborhood or area name",
      "good_for_ages": "string",
      "cost_tier": "one of: free | $ | $$ | $$$",
      "duration_minutes": number — realistic honest estimate for a typical visit,
      "wow_reason": "OPTIONAL — include ONLY on the 2-4 stretch picks: one warm sentence connecting what the user asked for to this unexpected find, e.g. 'You asked for swimming — did you know you can rent a kayak right at Harbourfront?' Omit this field entirely on regular picks."
    }
  ]
}

The candidates are roughly ordered most-relevant first. Select 12 to 18 candidates — ONLY ones you would honestly rate 10/10 for this request: an excellent place or experience (strong rating, standout offering) AND a strong fit for what was asked. A merely decent candidate does not make the cut. Start with the candidates that directly answer the request, then the strongest adjacent matches — for example, if the user asked about swimming, also consider beaches, splash pads, lakes, paddling rentals, and waterparks. Then include 2 to 4 "stretch" picks: outstanding candidates the user did not ask for but a GTA family would be genuinely excited to discover (a helicopter tour, treetop trekking, a hidden-gem beach — candidates marked "wow": true are good stretch material). Give each stretch pick a "wow_reason". If fewer than 12 candidates are genuinely excellent, return the ones that are rather than padding with weak matches — never invent to hit the count.`;
}

function whereLabel(city) {
  return isGtaWide(city) ? 'the Greater Toronto Area' : `${city} and the GTA`;
}

function buildPlanSystemPrompt({ city, mode }) {
  const where = whereLabel(city);
  return `You are DayHop's day-plan assembler. Given a parent's shortlist of selected activities across ${where}, arrange them into a realistic, well-paced day itinerary.

Hard rules:
${modePlanDirective(mode)}
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

// Multi-day variant (Pro): the same shortlist, spread across 2-3 days.
function buildTripPlanSystemPrompt({ city, days, mode }) {
  const where = whereLabel(city);
  return `You are DayHop's trip-plan assembler. Given a parent's shortlist of selected activities across ${where}, arrange them into a realistic, well-paced ${days}-day itinerary.

Hard rules:
${modePlanDirective(mode)}
- Use ONLY the items provided. Never invent new activities. Every input item appears exactly once across the whole trip — never duplicated, never dropped (unless the trip is badly overpacked, in which case flag the cut in "notes" instead of silently dropping it).
- Spread items over exactly ${days} days. Cluster stops that are geographically close on the same day so each day has minimal driving; put the region-hopping between days, not within them.
- Pace each day like a real family day: roughly 2-5 stops, meals at sensible times, no day wildly heavier than another.
- Insert a short transition note between items only when it adds real value (travel time, meal timing) — otherwise use an empty string.
- Give each day a short warm label (e.g. "Day 1 — Waterfront wandering"), not just a number.
- Flag (politely, in the top-level "notes") if the trip looks overpacked or scattered, and suggest what to cut.
- Return ONLY valid JSON, no markdown fences, no commentary.

JSON shape:
{
  "plan_title": "string, short and specific to the trip",
  "days": [
    {
      "day": 1,
      "label": "string, e.g. 'Day 1 — Waterfront wandering'",
      "start_time": "string, e.g. '10:00 AM'",
      "stops": [
        {
          "id": "string, matches the input item id",
          "title": "string",
          "suggested_time": "string, e.g. '10:00 AM - 11:30 AM'",
          "transition_note": "string or empty string if not needed"
        }
      ],
      "notes": "string, empty unless this specific day needs an honest flag"
    }
  ],
  "notes": "string, empty string if the trip is well-paced, otherwise a brief honest flag"
}`;
}

/**
 * Smart re-planning (the "it's raining — fix my day" engine). Takes the
 * CURRENT itinerary plus a natural-language adjustment request, and optional
 * real candidate venues to swap in. Existing stops are referenced by keep_id
 * and replacements by candidate_id so the caller can re-attach full idea
 * payloads (photos, booking links) without trusting the model to copy them.
 */
function buildReplanSystemPrompt({ city, weatherHint, advisoriesHint, dateHint, hasCandidates, multiDay, mode }) {
  const where = whereLabel(city);
  return `You are DayHop's smart re-planning engine for ${where}. You will receive a family's CURRENT itinerary ("current_plan"), their adjustment request ("request")${hasCandidates ? ', and a list of REAL candidate places/activities ("candidates") you may swap in' : ''}. ${weatherHint || ''}${advisoriesHint ? `\n\n${advisoriesHint}` : ''}${dateHint ? `\n\n${dateHint}` : ''}

Your job: revise the plan to honor the request while keeping everything that still works. Change what needs changing — no more, no less.

Hard rules:
${advisoryRules(advisoriesHint)}${modeDirective(mode)}
- Each output stop is EITHER a kept stop (set "keep_id" to that stop's original id — copy it exactly) OR ${hasCandidates ? 'a swap-in from the candidates (set "candidate_id" to the candidate\'s id — copy it exactly)' : 'a kept stop; with no candidates provided you may only reorder, retime, remove, or annotate stops'}. Never both, and NEVER invent a venue that is in neither list.
- Kept stops may be reordered, retimed, or given new transition notes. Keep their titles as-is.
- Remove stops that conflict with the request (e.g. outdoor stops when rain-proofing, pricey stops for a budget version) — removal is often the right move.
${hasCandidates ? '- Swap-ins must genuinely serve the request. If the candidates don\'t cover something, adjust with what exists and say so honestly in change_summary rather than forcing a bad match.\n' : ''}- Keep the day(s) realistically paced with sensible meal timing and minimal zigzagging.
- Mark every stop you changed, moved significantly, or swapped with "changed": true.
- "change_summary": 2-5 short, warm, plain-language bullets — one concrete change each, with the why (e.g. "Swapped the splash pad for the science centre — it's pouring after 2 PM").
${multiDay ? '- The current plan is multi-day: return the SAME "days" array structure (same number of days unless the request says otherwise). You may move stops between days when it improves the trip.\n' : ''}- Keep tone warm, plain, and trustworthy. Return ONLY valid JSON, no markdown fences, no commentary.

JSON shape to return:
{
  "plan_title": "string — keep the old title unless the request changes the day's character",
  "change_summary": ["string", "..."],
${multiDay ? `  "days": [
    {
      "day": 1,
      "label": "string",
      "start_time": "string, e.g. '10:00 AM'",
      "stops": [ { "keep_id": "string (kept stops only)", "candidate_id": "string (swap-ins only)", "title": "string", "suggested_time": "string", "transition_note": "string or empty", "changed": boolean } ],
      "notes": "string or empty"
    }
  ],
` : `  "start_time": "string, e.g. '10:00 AM'",
  "stops": [ { "keep_id": "string (kept stops only)", "candidate_id": "string (swap-ins only)", "title": "string", "suggested_time": "string", "transition_note": "string or empty", "changed": boolean } ],
`}  "notes": "string, empty unless the revised plan needs an honest flag"
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
      // ~18 ideas of JSON ≈ 2.5K tokens; leave real headroom so the
      // response is never truncated mid-string (which breaks JSON.parse).
      max_tokens: 8000,
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

async function generateIdeas({ prompt, city = DEFAULT_CITY, region = DEFAULT_REGION, filter, mode }) {
  if (!prompt || !prompt.trim()) {
    const err = new Error('Prompt is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const userMessage = filter && filter !== 'all'
    ? `${prompt}\n\n(User currently has the "${filter}" filter active — weight ideas toward that category where it genuinely fits, but don't force a bad match.)`
    : prompt;

  const messages = [
    { role: 'system', content: buildSystemPrompt({ city, region, mode }) },
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
async function generateGroundedIdeas({ prompt, filter, city = DEFAULT_CITY, candidates, weather, advisories, dateHint, mode }) {
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
  const advisoriesHint = require('./advisories').toPromptHint(advisories);

  const userMessage = JSON.stringify({
    request: prompt,
    active_filter: filter && filter !== 'all' ? filter : undefined,
    candidates: candidates.slice(0, 60) // safety belt; caller pre-ranks and slims to 60
  });

  const messages = [
    { role: 'system', content: buildGroundedSystemPrompt({ city, weatherHint, advisoriesHint, dateHint, mode }) },
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

async function buildDayPlan({ items, city = DEFAULT_CITY, days = 1, mode }) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('At least one shortlisted item is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const dayCount = Math.min(Math.max(Number(days) || 1, 1), 3);
  const messages = [
    {
      role: 'system',
      content: dayCount > 1
        ? buildTripPlanSystemPrompt({ city, days: dayCount, mode })
        : buildPlanSystemPrompt({ city, mode })
    },
    { role: 'user', content: JSON.stringify({ items }) }
  ];

  return callGrok(messages, { temperature: 0.4 });
}

/**
 * Revise an existing plan against a natural-language request ("it's raining",
 * "make it kid-friendly", "budget version"). See buildReplanSystemPrompt for
 * the contract; the caller re-attaches full idea payloads by keep_id /
 * candidate_id and must treat unknown ids as hallucinations.
 */
async function replanPlan({ current, instruction, city = DEFAULT_CITY, weather, advisories, candidates, dateHint, mode }) {
  if (!instruction || !String(instruction).trim()) {
    const err = new Error('Tell DayHop what to change first');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!current || typeof current !== 'object') {
    const err = new Error('A current plan is required to re-plan');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const weatherHint = weather ? require('./weather').toPromptHint(weather) : '';
  const advisoriesHint = require('./advisories').toPromptHint(advisories);
  const pool = Array.isArray(candidates) ? candidates.slice(0, 40) : [];
  const multiDay = Array.isArray(current.days) && current.days.length > 0;

  const messages = [
    {
      role: 'system',
      content: buildReplanSystemPrompt({ city, weatherHint, advisoriesHint, dateHint, hasCandidates: pool.length > 0, multiDay, mode })
    },
    {
      role: 'user',
      content: JSON.stringify({
        request: String(instruction).slice(0, 300),
        current_plan: current,
        candidates: pool.length ? pool : undefined
      })
    }
  ];

  const result = await callGrok(messages, { temperature: 0.5 });
  const stopsOk = multiDay
    ? Array.isArray(result && result.days)
    : Array.isArray(result && result.stops);
  if (!result || !stopsOk) {
    const err = new Error('Grok returned an unexpected re-plan shape');
    err.code = 'GROK_BAD_SHAPE';
    throw err;
  }
  return result;
}

/**
 * Short factual color for one place — powers the detail panel's "worth
 * knowing" section. Honesty contract mirrors the idea generator: never
 * fabricate specifics; when unsure of the exact venue, speak to the type
 * of place and area in general terms, or return fewer facts.
 */
async function placeFacts({ title, venue, location, city, category }) {
  if (!title || !String(title).trim()) {
    const err = new Error('A place title is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const messages = [
    {
      role: 'system',
      content: `You write short, trustworthy local color for DayHop, a day-planning app for the Greater Toronto Area. The user is looking at one specific place and wants to know more before visiting.

Hard rules:
- Only state things you are genuinely confident are true. NEVER invent specific dates, statistics, names, or events. If you don't know the exact venue, describe what's true of this type of place in this area, or return fewer facts.
- Keep every string short and concrete. Warm, plain tone — no hype.
- Return ONLY valid JSON, no markdown fences, no commentary.

JSON shape to return:
{
  "facts": ["2-4 genuinely interesting facts about this place — what makes it special, notable features, fun trivia. Each one sentence."],
  "history": "1-2 sentences of real history/background if you know it, else empty string",
  "busy": "one sentence on when it's typically busy vs quiet and the best time to go (typical patterns, not live data)",
  "tip": "one practical insider tip for visiting (parking, what to bring, best spot, nearby pairing)"
}`
    },
    {
      role: 'user',
      content: JSON.stringify({
        place: title,
        venue: venue || undefined,
        area: location || undefined,
        city: city || undefined,
        category: category || undefined
      })
    }
  ];

  const result = await callGrok(messages, { temperature: 0.4 });
  if (!result || typeof result !== 'object') {
    const err = new Error('Grok returned an unexpected facts shape');
    err.code = 'GROK_BAD_SHAPE';
    throw err;
  }
  return {
    facts: Array.isArray(result.facts) ? result.facts.slice(0, 4).map(f => String(f).slice(0, 240)) : [],
    history: result.history ? String(result.history).slice(0, 400) : '',
    busy: result.busy ? String(result.busy).slice(0, 240) : '',
    tip: result.tip ? String(result.tip).slice(0, 240) : ''
  };
}

module.exports = {
  normalizeMode,
  generateIdeas,
  generateGroundedIdeas,
  buildDayPlan,
  replanPlan,
  placeFacts,
  callGrok // generic JSON-mode completion (used by services/newOpenings.js)
};
