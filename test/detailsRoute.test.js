// test/detailsRoute.test.js — /api/details gates the search-grounded price
// lookup (grok.placePriceSearch) to food/patios/couples categories only,
// since it's a real per-uncached-venue cost (~13s, ~US$0.12 via
// callGrokSearch) unlike the plain-completion placeFacts().
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const maps = require('../services/googleMaps');
const grok = require('../services/grok');
const detailsRoute = require('../routes/details');

function listen(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve(srv));
  });
}

test('details: price search runs for food/patios/couples, not other categories', async () => {
  const origSearchLite = maps.searchPlacesLite;
  const origFacts = grok.placeFacts;
  const origPriceSearch = grok.placePriceSearch;
  let priceSearchCalls = 0;
  maps.searchPlacesLite = async () => []; // no place match — lookupPlace short-circuits to null
  grok.placeFacts = async () => ({ facts: [], history: '', busy: '', tip: '' });
  grok.placePriceSearch = async () => {
    priceSearchCalls++;
    return { summary: 'Mains run $22-$45', ranges: [{ label: 'Mains', range: '$22-$45' }], source_note: 'venue website' };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/details', detailsRoute);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const post = body => fetch(`${base}/api/details`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());

    const foodRes = await post({ title: 'Test Bistro', category: 'food' });
    assert.equal(priceSearchCalls, 1);
    assert.deepEqual(foodRes.priceDetail, { summary: 'Mains run $22-$45', ranges: [{ label: 'Mains', range: '$22-$45' }], source_note: 'venue website' });

    const cultureRes = await post({ title: 'Test Museum', category: 'culture' });
    assert.equal(priceSearchCalls, 1, 'placePriceSearch must not run for a non-food/patios/couples category');
    assert.equal(cultureRes.priceDetail, null);
  } finally {
    srv.close();
    maps.searchPlacesLite = origSearchLite;
    grok.placeFacts = origFacts;
    grok.placePriceSearch = origPriceSearch;
  }
});
