// services/advisories.js — DayHop V2
// The "should I even go today?" layer: assembles active advisories for a
// location from sources DayHop already talks to — OpenWeather's free Air
// Pollution API (global AQI/PM2.5, same key as weather) plus advisories
// derived from current conditions (extreme heat/cold, damaging wind,
// thunderstorms). Derived entries work anywhere OpenWeather has a forecast,
// which is everywhere — that's the global-coverage floor. Official
// government alerts (One Call 3.0) slot in here as a Phase 2 source.
//
// Contract with callers: never throws. Returns { advisories, status } where
// status is 'ok' | 'partial' | 'unavailable' — the UI must distinguish
// "no advisories" from "couldn't check", so a fetch failure degrades the
// status instead of silently returning an empty list.

const axios = require('axios');
const eccc = require('./ecccAlerts');

const AIR_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';

// Severity ladder. Every level maps to a distinct product behavior:
// info    → detail-only, no ranking effect
// caution → card chip + mild ranking demotion
// warning → banner + strong demotion, Grok must justify conflicts
// danger  → red banner, affected candidates excluded from the pool
const SEVERITY_RANK = { info: 0, caution: 1, warning: 2, danger: 3 };

function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

// One shared advisory shape (see docs/advisories-design.md):
// { id, type, severity, scope, place_id, title, message, source,
//   source_name, expires_at, fetched_at, effects: { avoid_outdoor,
//   avoid_strenuous, blocked } }
function makeAdvisory(a) {
  return Object.assign({
    scope: 'area',
    place_id: null,
    source_name: null,
    starts_at: null,
    expires_at: null,
    fetched_at: new Date().toISOString(),
    effects: {}
  }, a);
}

// ---------- Air quality (OpenWeather Air Pollution API) ----------
// Free on the existing OPENWEATHER_API_KEY. OWM AQI is 1 (good) – 5 (very
// poor); PM2.5 in µg/m³ is the smoke signal. Thresholds start conservative —
// an app that cries wolf loses the trust this feature exists to build.
const airCache = new Map();
const AIR_TTL_MS = 15 * 60 * 1000;
const AIR_CACHE_MAX = 500;

async function fetchAirQuality({ lat, lng }) {
  if (!process.env.OPENWEATHER_API_KEY) return null;

  // ~11 km grid: air quality is regional, so nearby users share an entry.
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const cached = airCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const res = await axios.get(AIR_URL, {
    params: { lat, lon: lng, appid: process.env.OPENWEATHER_API_KEY },
    timeout: 8000
  });
  const entry = res.data?.list?.[0];
  const value = entry
    ? { aqi: entry.main?.aqi ?? null, pm2_5: entry.components?.pm2_5 ?? null }
    : null;

  if (airCache.size >= AIR_CACHE_MAX) airCache.delete(airCache.keys().next().value);
  airCache.set(key, { value, expires: Date.now() + AIR_TTL_MS });
  return value;
}

function airAdvisory(air) {
  if (!air || air.aqi == null) return null;
  const pm = air.pm2_5 ?? 0;
  // PM2.5-heavy air is usually smoke (wildfires) — say so, because "smoke"
  // is the word that changes a user's decision.
  const smoky = pm >= 55;

  if (air.aqi >= 5 || pm >= 150) {
    return makeAdvisory({
      id: 'air-danger',
      type: 'air_quality',
      severity: 'danger',
      title: smoky ? 'Hazardous smoke levels' : 'Very poor air quality',
      message: `Air quality is very poor (PM2.5 ${Math.round(pm)} µg/m³)${smoky ? ' — heavy fine-particle levels, often wildfire smoke' : ''}. Outdoor activity is not recommended today.`,
      source: 'openweather_air',
      source_name: 'OpenWeather air quality',
      effects: { avoid_outdoor: true, avoid_strenuous: true }
    });
  }
  if (air.aqi === 4 || pm >= 55) {
    return makeAdvisory({
      id: 'air-warning',
      type: 'air_quality',
      severity: 'warning',
      title: smoky ? 'Smoky air today' : 'Poor air quality',
      message: `Air quality is poor (PM2.5 ${Math.round(pm)} µg/m³)${smoky ? ' — likely smoke' : ''}. Favor indoor plans; keep outdoor time short and easy.`,
      source: 'openweather_air',
      source_name: 'OpenWeather air quality',
      effects: { avoid_outdoor: true, avoid_strenuous: true }
    });
  }
  if (air.aqi === 3) {
    return makeAdvisory({
      id: 'air-info',
      type: 'air_quality',
      severity: 'info',
      title: 'Moderate air quality',
      message: 'Air quality is moderate. Sensitive groups may want to keep strenuous outdoor activity light.',
      source: 'openweather_air',
      source_name: 'OpenWeather air quality',
      effects: {}
    });
  }
  return null;
}

// ---------- Derived from current conditions ----------
// Works from the weather.getConditions() payload the pipeline already holds,
// so this layer costs zero extra API calls and covers every location on
// Earth. These are estimates, not official alerts — labelled as such
// (source: 'derived'), and Phase 2's government alerts will supersede them.
function derivedAdvisories(conditions) {
  if (!conditions) return [];
  const out = [];
  const feels = conditions.feels_like_c ?? conditions.temp_c ?? 0;
  const wind = conditions.wind_kph ?? 0;

  if (feels >= 40) {
    out.push(makeAdvisory({
      id: 'derived-heat-danger',
      type: 'weather',
      severity: 'danger',
      title: 'Dangerous heat',
      message: `Feels like ${Math.round(feels)}°C right now. Avoid outdoor exertion — this is heat-illness territory.`,
      source: 'derived',
      effects: { avoid_outdoor: true, avoid_strenuous: true }
    }));
  } else if (feels >= 35) {
    out.push(makeAdvisory({
      id: 'derived-heat-warning',
      type: 'weather',
      severity: 'warning',
      title: 'Extreme heat',
      message: `Feels like ${Math.round(feels)}°C. Favor water, shade, and indoor stops; skip midday exertion.`,
      source: 'derived',
      effects: { avoid_strenuous: true }
    }));
  }

  if (feels <= -30) {
    out.push(makeAdvisory({
      id: 'derived-cold-danger',
      type: 'weather',
      severity: 'danger',
      title: 'Dangerous cold',
      message: `Feels like ${Math.round(feels)}°C. Frostbite risk in minutes — keep the day indoors.`,
      source: 'derived',
      effects: { avoid_outdoor: true, avoid_strenuous: true }
    }));
  } else if (feels <= -20) {
    out.push(makeAdvisory({
      id: 'derived-cold-warning',
      type: 'weather',
      severity: 'warning',
      title: 'Extreme cold',
      message: `Feels like ${Math.round(feels)}°C. Keep outdoor stops short and bundle up.`,
      source: 'derived',
      effects: { avoid_strenuous: true }
    }));
  }

  if (wind >= 90) {
    out.push(makeAdvisory({
      id: 'derived-wind-danger',
      type: 'weather',
      severity: 'danger',
      title: 'Damaging winds',
      message: `Winds around ${Math.round(wind)} km/h. Stay clear of trails, trees, and open water today.`,
      source: 'derived',
      effects: { avoid_outdoor: true }
    }));
  } else if (wind >= 60) {
    out.push(makeAdvisory({
      id: 'derived-wind-warning',
      type: 'weather',
      severity: 'warning',
      title: 'High winds',
      message: `Winds around ${Math.round(wind)} km/h. Skip exposed lookouts and paddling; favor sheltered plans.`,
      source: 'derived',
      effects: { avoid_outdoor: true }
    }));
  }

  if (conditions.condition === 'Thunderstorm') {
    out.push(makeAdvisory({
      id: 'derived-storm',
      type: 'weather',
      severity: 'warning',
      title: 'Thunderstorms in the area',
      message: 'Active thunderstorms nearby. Stay off open water and away from exposed areas until they pass.',
      source: 'derived',
      effects: { avoid_outdoor: true }
    }));
  }

  return out;
}

// ---------- Place-level closures (Google Places businessStatus) ----------
// The candidate pipeline calls this per candidate; blocked ones never reach
// the pool, so users never see (or plan around) a closed place.
function closureAdvisory(businessStatus, { place_id, title } = {}) {
  if (businessStatus !== 'CLOSED_TEMPORARILY' && businessStatus !== 'CLOSED_PERMANENTLY') return null;
  const permanent = businessStatus === 'CLOSED_PERMANENTLY';
  return makeAdvisory({
    id: `closed-${place_id || title || 'unknown'}`,
    type: 'closure',
    severity: 'danger',
    scope: 'place',
    place_id: place_id || null,
    title: permanent ? 'Permanently closed' : 'Temporarily closed',
    message: `${title || 'This place'} is currently listed as ${permanent ? 'permanently' : 'temporarily'} closed.`,
    source: 'google_places',
    source_name: 'Google',
    effects: { blocked: true }
  });
}

// ---------- Assembly ----------
/**
 * All active area advisories for a location. `conditions` is the (optional)
 * services/weather.getConditions() payload the caller already fetched.
 * Never throws; failures degrade `status` instead.
 */
async function getAdvisories({ lat, lng, conditions }) {
  let airOk = false;
  let ecccOk = false;
  const advisories = [];

  // Air quality and official ECCC alerts fetch in parallel — both cached,
  // both independently optional.
  const [airResult, ecccResult] = await Promise.allSettled([
    process.env.OPENWEATHER_API_KEY ? fetchAirQuality({ lat, lng }) : Promise.resolve(null),
    eccc.fetchAlerts({ lat, lng })
  ]);

  if (airResult.status === 'fulfilled' && process.env.OPENWEATHER_API_KEY) {
    airOk = true;
    const adv = airAdvisory(airResult.value);
    if (adv) advisories.push(adv);
  } else if (airResult.status === 'rejected') {
    console.warn('[advisories] air quality unavailable:', airResult.reason && airResult.reason.message);
  }

  // Official government alerts (Phase 2). fetchAlerts returns null when it
  // couldn't answer (or outside Canada) — an empty array is a real "no
  // active alerts".
  const ecccCategories = new Set();
  if (ecccResult.status === 'fulfilled' && Array.isArray(ecccResult.value)) {
    ecccOk = true;
    for (const a of ecccResult.value) {
      advisories.push(makeAdvisory(a));
      if (a.category) ecccCategories.add(a.category);
    }
  }

  // Derived estimates stand down where an official alert covers the same
  // risk — "per Environment Canada" beats "our thermometer math" and the
  // user never sees the same risk twice.
  const DERIVED_CATEGORY = { heat: /heat/, cold: /cold/, wind: /wind/, storm: /storm/ };
  const derived = derivedAdvisories(conditions).filter(d => {
    for (const [cat, re] of Object.entries(DERIVED_CATEGORY)) {
      if (re.test(d.id) && ecccCategories.has(cat)) return false;
    }
    return true;
  });
  advisories.push(...derived);

  // Expiry is honored at read time so a cached entry can't outlive itself.
  const now = Date.now();
  const active = advisories.filter(a => !a.expires_at || Date.parse(a.expires_at) > now);
  active.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const haveConditions = Boolean(conditions);
  const sourceOk = airOk || ecccOk;
  const status = sourceOk && haveConditions ? 'ok'
    : (sourceOk || haveConditions) ? 'partial'
    : 'unavailable';

  return { advisories: active, status };
}

/**
 * Aggregate ranking pressure for the relevance scorer:
 * { avoid_outdoor: 0|1|2, avoid_strenuous: 0|1|2 } where 1 = caution-level,
 * 2 = warning-or-worse. (Blocked candidates never reach the scorer.)
 */
function advisoryEffects(advisories) {
  const out = { avoid_outdoor: 0, avoid_strenuous: 0 };
  for (const a of advisories || []) {
    const level = severityRank(a.severity) >= SEVERITY_RANK.warning ? 2
      : a.severity === 'caution' ? 1 : 0;
    if (!level) continue;
    if (a.effects?.avoid_outdoor) out.avoid_outdoor = Math.max(out.avoid_outdoor, level);
    if (a.effects?.avoid_strenuous) out.avoid_strenuous = Math.max(out.avoid_strenuous, level);
  }
  return out;
}

/**
 * Compact advisory context for Grok's system prompts, in the same spirit as
 * weather.toPromptHint. Empty string when there's nothing actionable.
 */
function toPromptHint(advisories) {
  const actionable = (advisories || []).filter(a => severityRank(a.severity) >= SEVERITY_RANK.caution);
  if (!actionable.length) return '';
  const lines = actionable.slice(0, 4).map(a =>
    `${a.title} (${a.severity}${a.source_name ? `, per ${a.source_name}` : ''}): ${a.message}`);
  return `ACTIVE ADVISORIES for this area: ${lines.join(' | ')}`;
}

module.exports = {
  getAdvisories,
  closureAdvisory,
  advisoryEffects,
  toPromptHint,
  severityRank
};
