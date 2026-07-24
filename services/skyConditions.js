// services/skyConditions.js — DayHop V2
// Tonight's stargazing signal, from Open-Meteo (free, keyless — verified
// 2026-07-24; note: their API has NO moon_phase field, so moon illumination
// is computed locally from the synodic month). Mean cloud cover between
// sunset and ~1 am decides "clear tonight"; the browse payload carries the
// result so the "Under open skies" hero can lead with real stargazing spots
// on nights when the sky actually cooperates.
//
// Contract: getSkyTonight never throws — returns null when unavailable.

const axios = require('axios');

const URL = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 60 * 60 * 1000; // hourly forecast; 1 h cache
const CACHE_MAX = 200;
const CLEAR_MAX_CLOUD_PCT = 35;

const client = axios.create({ timeout: 8000 });
const cache = new Map();
let warned = false;

// Moon illumination (0–100 %) from the synodic cycle — good to a couple of
// per cent, plenty for "is it a dark sky tonight" copy.
const SYNODIC_DAYS = 29.530588853;
const REF_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);

function moonIlluminationPct(now = Date.now()) {
  const days = (now - REF_NEW_MOON_UTC) / 86400000;
  const phase = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  return Math.round(((1 - Math.cos((2 * Math.PI * phase) / SYNODIC_DAYS)) / 2) * 100);
}

/**
 * { clear_tonight, cloud_cover_pct, moon_illumination_pct, sunset } for the
 * coming night at a point, or null when the forecast is unavailable.
 */
async function getSkyTonight({ lat, lng } = {}) {
  if (lat == null || lng == null) return null;
  const key = `${Math.round(lat * 5) / 5},${Math.round(lng * 5) / 5}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const res = await client.get(URL, {
      params: {
        latitude: lat, longitude: lng,
        hourly: 'cloud_cover',
        daily: 'sunset',
        timezone: 'auto',
        forecast_days: 2
      }
    });
    const hourly = res.data && res.data.hourly;
    const sunset = res.data && res.data.daily && res.data.daily.sunset && res.data.daily.sunset[0];
    if (!hourly || !Array.isArray(hourly.time) || !sunset) return null;

    // Window: the sunset hour through 1 am — the hours someone would
    // actually be out under the sky.
    const sunsetHourIso = sunset.slice(0, 13);
    let startIdx = hourly.time.findIndex(t => t.slice(0, 13) === sunsetHourIso);
    if (startIdx < 0) startIdx = Math.min(20, hourly.time.length - 1);
    const clouds = hourly.cloud_cover
      .slice(startIdx, startIdx + 6)
      .filter(v => v != null);
    if (!clouds.length) return null;

    const avg = Math.round(clouds.reduce((a, b) => a + b, 0) / clouds.length);
    const value = {
      clear_tonight: avg <= CLEAR_MAX_CLOUD_PCT,
      cloud_cover_pct: avg,
      moon_illumination_pct: moonIlluminationPct(),
      sunset,
      fetched_at: new Date().toISOString()
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (!warned) { console.warn('[sky] unavailable:', err.message); warned = true; }
    return null;
  }
}

module.exports = { getSkyTonight };
