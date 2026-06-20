// services/weather.js — DayHop V2
// Pulls current + short-range forecast from OpenWeather so DayHop can
// favor indoor/outdoor activities sensibly (don't suggest a splash pad
// in a thunderstorm, don't suggest an indoor museum on a perfect day).

const axios = require('axios');

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

function assertConfigured() {
  if (!process.env.OPENWEATHER_API_KEY) {
    const err = new Error('OPENWEATHER_API_KEY is not set.');
    err.code = 'WEATHER_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Returns a compact weather summary for the given coordinates —
 * just enough signal for the AI prompt, not a full payload dump.
 */
async function getConditions({ lat, lng }) {
  assertConfigured();

  const res = await axios.get(`${BASE_URL}/weather`, {
    params: {
      lat, lon: lng,
      appid: process.env.OPENWEATHER_API_KEY,
      units: 'metric'
    },
    timeout: 8000
  });

  const d = res.data;
  return {
    condition: d.weather?.[0]?.main || 'Unknown',
    description: d.weather?.[0]?.description || '',
    temp_c: Math.round(d.main?.temp ?? 0),
    feels_like_c: Math.round(d.main?.feels_like ?? 0),
    is_rainy: ['Rain', 'Drizzle', 'Thunderstorm'].includes(d.weather?.[0]?.main),
    is_extreme_heat: (d.main?.temp ?? 0) >= 32,
    is_extreme_cold: (d.main?.temp ?? 0) <= -10,
    wind_kph: Math.round((d.wind?.speed ?? 0) * 3.6)
  };
}

/**
 * Plain-language hint Grok can use directly in its system prompt context
 * without us hand-rolling conditional logic per category.
 */
function toPromptHint(conditions) {
  if (!conditions) return '';
  const bits = [`Current weather: ${conditions.description}, ${conditions.temp_c}°C.`];
  if (conditions.is_rainy) bits.push('It is currently rainy — favor indoor or covered options.');
  if (conditions.is_extreme_heat) bits.push('It is very hot — favor water-based or shaded/indoor activities, avoid midday full-sun suggestions.');
  if (conditions.is_extreme_cold) bits.push('It is very cold — favor indoor activities or short outdoor stops only.');
  return bits.join(' ');
}

module.exports = { getConditions, toPromptHint };
