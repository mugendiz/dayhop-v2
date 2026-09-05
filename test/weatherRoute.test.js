// test/weatherRoute.test.js — /api/weather for the tile modal, and the
// FAVS_GRID config flag.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const weatherRoute = require('../routes/weather');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

test('weather: validates coords, rounds them, shapes the reply, maps errors', async () => {
  const calls = [];
  weatherRoute._setProvider({
    async getConditions({ lat, lng }) {
      calls.push({ lat, lng });
      if (lat === 0 && lng === 0) { const e = new Error('no key'); e.code = 'WEATHER_NOT_CONFIGURED'; throw e; }
      if (lat === 1 && lng === 1) throw new Error('upstream down');
      return { condition: 'Clouds', description: 'broken clouds', temp_c: 21, feels_like_c: 20, is_rainy: false, is_extreme_heat: false, is_extreme_cold: false, wind_kph: 12 };
    }
  });
  const app = express();
  app.use('/api/weather', weatherRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let res = await fetch(`${base}/api/weather?lat=43.6532&lng=-79.3832`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=600');
    assert.deepEqual(await res.json(), { temp_c: 21, feels_like_c: 20, condition: 'Clouds', description: 'broken clouds', is_rainy: false, wind_kph: 12 });
    assert.deepEqual(calls[0], { lat: 43.65, lng: -79.38 });

    res = await fetch(`${base}/api/weather?lat=91&lng=0`);
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/weather?lat=abc`);
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/weather?lat=0&lng=0`);
    assert.equal(res.status, 503);
    res = await fetch(`${base}/api/weather?lat=1&lng=1`);
    assert.equal(res.status, 502);
  } finally {
    srv.close();
  }
});

test('config: favsGrid flag follows FAVS_GRID=on', async () => {
  const config = require('../routes/config');
  const app = express();
  app.use('/api/config', config);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    delete process.env.FAVS_GRID;
    let j = await (await fetch(`${base}/api/config`)).json();
    assert.equal(j.favsGrid, false);
    process.env.FAVS_GRID = 'on';
    j = await (await fetch(`${base}/api/config`)).json();
    assert.equal(j.favsGrid, true);
    process.env.FAVS_GRID = 'off';
    j = await (await fetch(`${base}/api/config`)).json();
    assert.equal(j.favsGrid, false);
  } finally {
    delete process.env.FAVS_GRID;
    srv.close();
  }
});
