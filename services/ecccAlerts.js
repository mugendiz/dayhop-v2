// services/ecccAlerts.js — DayHop V2 (advisories Phase 2)
// Official Environment and Climate Change Canada weather alerts via the
// GeoMet OGC API. Free, keyless. This is the government-alert source the
// advisories layer was designed around: official warnings supersede the
// condition-derived estimates in services/advisories.js.
//
// OPERATIONAL NOTES (verified 2026-07-24):
// - Collection id is 'weather-alerts' (NOT 'alerts' — that 404s).
//   GET https://api.weather.gc.ca/collections/weather-alerts/items
//       ?f=json&bbox=<w,s,e,n>&limit=25
// - Feature properties: id, alert_code, alert_type ('warning'|'watch'|...),
//   alert_name_en ("heat warning"), alert_short_name_en, alert_text_en
//   (long, paragraph-separated), publication_datetime, expiration_datetime,
//   event_end_datetime, validity_datetime.
// - Canada-only by nature; the caller's coords are bbox'd ±0.2°.
//
// Contract: fetchAlerts never throws — returns null when unavailable (so
// callers can tell "no alerts" from "couldn't check").

const axios = require('axios');

const URL = 'https://api.weather.gc.ca/collections/weather-alerts/items';
const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

const client = axios.create({ timeout: 8000 });
const cache = new Map();
let warned = false;

function inCanada(lat, lng) {
  return lat >= 41 && lat <= 84 && lng >= -142 && lng <= -50;
}

// Category buckets used by advisories.js to stand down the matching
// derived (estimated) advisory when an official alert covers the same risk.
function categorize(name) {
  if (/heat/.test(name)) return 'heat';
  if (/cold|wind chill|frostbite/.test(name)) return 'cold';
  if (/thunderstorm|tornado|hurricane|storm surge/.test(name)) return 'storm';
  if (/wind|squall/.test(name)) return 'wind';
  if (/smoke|air quality|smog/.test(name)) return 'air';
  return 'other';
}

function severityFor(alertType, name) {
  if (alertType === 'warning') {
    return /tornado|hurricane|storm surge|severe thunderstorm/.test(name) ? 'danger' : 'warning';
  }
  if (alertType === 'watch') return 'caution';
  return 'info'; // statements, advisories, ended notices
}

function effectsFor(category, severity) {
  const strong = severity === 'warning' || severity === 'danger';
  if (!strong) return {};
  switch (category) {
    case 'heat': return { avoid_strenuous: true };
    case 'cold': return { avoid_strenuous: true };
    case 'storm': return { avoid_outdoor: true };
    case 'wind': return { avoid_outdoor: true };
    case 'air': return { avoid_outdoor: true, avoid_strenuous: true };
    default: return {};
  }
}

// First paragraph of the (long) alert text, tidied to one line.
function summarize(text) {
  return String(text || '')
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function toAdvisoryShape(p) {
  const name = String(p.alert_name_en || 'weather alert').toLowerCase();
  const category = categorize(name);
  const severity = severityFor(String(p.alert_type || '').toLowerCase(), name);
  return {
    id: `eccc-${p.id}`,
    type: 'weather',
    severity,
    title: name.replace(/^\w/, ch => ch.toUpperCase()),
    message: summarize(p.alert_text_en) || `Environment Canada has issued a ${name} for this area.`,
    source: 'eccc',
    source_name: 'Environment Canada',
    starts_at: p.validity_datetime || p.publication_datetime || null,
    expires_at: p.expiration_datetime || p.event_end_datetime || null,
    effects: effectsFor(category, severity),
    category // consumed by advisories.js supersede logic, harmless downstream
  };
}

/**
 * Active official alerts near a point, mapped to the shared advisory shape
 * (advisories.js wraps them with makeAdvisory defaults). Returns null when
 * the service can't answer — including outside Canada.
 */
async function fetchAlerts({ lat, lng } = {}) {
  if (lat == null || lng == null || !inCanada(lat, lng)) return null;
  const key = `${Math.round(lat * 10) / 10},${Math.round(lng * 10) / 10}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const res = await client.get(URL, {
      params: {
        f: 'json',
        bbox: [lng - 0.2, lat - 0.2, lng + 0.2, lat + 0.2].join(','),
        limit: 25
      }
    });
    const feats = (res.data && res.data.features) || [];
    const value = feats
      .map(f => f && f.properties)
      .filter(Boolean)
      .map(toAdvisoryShape);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    if (!warned) { console.warn('[eccc] alerts unavailable:', err.message); warned = true; }
    return null;
  }
}

module.exports = { fetchAlerts };
