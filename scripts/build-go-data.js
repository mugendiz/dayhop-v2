// scripts/build-go-data.js — the Ontario snapshot behind /go ("Go Now").
//
// Sources, all free and attributable:
//   - OpenStreetMap (Overpass API): amenity=toilets and amenity=library
//     across Ontario, with changing_table / wheelchair / fee / opening_hours
//     tags. ODbL: the page credits "© OpenStreetMap contributors".
//   - City of Ottawa PublicWashrooms map service: public toilets with a
//     child change station flag and a seasonal flag.
//   - City of Toronto open data: EarlyON Child and Family Centres (drop-in
//     family stops with lat/lng).
// Toronto's park washrooms are NOT in this file: services/goNow.js reads
// the City's daily feed live, because their status changes.
//
// Nothing here is invented. A tag that is missing stays null, and the page
// shows "not listed" rather than a guess.
//
// Usage: node scripts/build-go-data.js   → data/go/ontario.json
// Re-run monthly; commit the JSON.

const fs = require('fs');
const path = require('path');

const UA = 'DayHop/1.0 (admin@dayhop.quest)';
const OUT = path.join(__dirname, '..', 'data', 'go', 'ontario.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function overpass(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (res.ok) return (await res.json()).elements;
    console.warn(`[go-data] overpass ${res.status}, retry ${attempt}`);
    await sleep(15000 * attempt);
  }
  throw new Error('overpass unavailable');
}

// Only a plain yes (or a count, for diaper=2) is true and only "no" is
// false. "limited" stays unknown: a toilet with wheelchair=limited may have
// steps, and a stroller pill must not promise step-free on a maybe.
const yes = v => (v == null ? null : /^(yes|designated|[1-9][0-9]*)$/i.test(v) ? true : /^no$/i.test(v) ? false : null);
const round = n => Math.round(n * 1e5) / 1e5;

function osmPoint(e, kind) {
  const t = e.tags || {};
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (lat == null || lng == null) return null;
  if (/^(private|no|customers|permit)$/i.test(t.access || '')) return null;
  const changing = yes(t.changing_table) != null ? yes(t.changing_table) : yes(t.diaper);
  return {
    id: `osm-${e.type[0]}${e.id}`, k: kind,
    n: t.name || (kind === 'wc' ? 'Public washroom' : 'Library'),
    lat: round(lat), lng: round(lng),
    src: 'osm',
    ct: changing,
    acc: yes(t.wheelchair),
    free: t.fee == null ? null : !yes(t.fee),
    hours: t.opening_hours ? String(t.opening_hours).slice(0, 80) : null,
    seasonal: t.seasonal ? !/^no$/i.test(t.seasonal) : null,
    addr: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ') || null
  };
}

async function ottawa() {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const url = `https://maps.ottawa.ca/arcgis/rest/services/PublicWashrooms/MapServer/0/query?where=1%3D1&outFields=UNIQUE_ID,NAME,ADDRESS,PUBLIC_TOILETS_YN,CHANGE_STATION_CHILD,SEASONAL&outSR=4326&f=json&resultOffset=${offset}&resultRecordCount=1000`;
    const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
    const feats = j.features || [];
    for (const f of feats) {
      const a = f.attributes, g = f.geometry;
      if (String(a.PUBLIC_TOILETS_YN) !== '1' || !g) continue;
      out.push({
        id: `ott-${a.UNIQUE_ID}`, k: 'wc', n: String(a.NAME || 'Public washroom').trim(),
        lat: round(g.y), lng: round(g.x), src: 'ottawa',
        ct: a.CHANGE_STATION_CHILD == null ? null : String(a.CHANGE_STATION_CHILD) === '1',
        acc: null, free: true, hours: null,
        seasonal: a.SEASONAL == null ? null : String(a.SEASONAL) === '1',
        addr: a.ADDRESS ? String(a.ADDRESS).trim() : null
      });
    }
    if (feats.length < 1000) break;
  }
  return out;
}

async function earlyon() {
  const url = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?resource_id=7326e338-491e-4366-81a0-b12f5257c064&limit=1000';
  const j = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  return j.result.records.filter(r => r.lat && r.lng).map(r => ({
    id: `eon-${r.loc_id || r._id}`, k: 'stop', n: String(r.program_name || 'EarlyON Child and Family Centre').trim(),
    lat: round(r.lat), lng: round(r.lng), src: 'earlyon',
    ct: null, acc: null, free: true, hours: null, seasonal: null,
    addr: r.full_address || r.address || null, url: r.website || null, kind: 'EarlyON drop-in'
  }));
}

async function main() {
  const area = 'area["ISO3166-2"="CA-ON"]->.on;';
  const toilets = await overpass(`[out:json][timeout:120];${area}nwr["amenity"="toilets"](area.on);out center tags;`);
  await sleep(5000);
  const libraries = await overpass(`[out:json][timeout:120];${area}nwr["amenity"="library"](area.on);out center tags;`);
  const points = [
    ...toilets.map(e => osmPoint(e, 'wc')).filter(Boolean),
    ...libraries.map(e => osmPoint(e, 'stop')).filter(Boolean).map(p => Object.assign(p, { kind: 'Library' })),
    ...await ottawa(),
    ...await earlyon()
  ];
  // One pin per place: an Ottawa city record beats an OSM toilet within 40 m.
  const city = points.filter(p => p.src === 'ottawa');
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0004 && Math.abs(a.lng - b.lng) < 0.0005;
  const deduped = points.filter(p => !(p.src === 'osm' && p.k === 'wc' && city.some(c => near(c, p))));
  const snapshot = {
    built_at: new Date().toISOString(),
    sources: {
      osm: 'OpenStreetMap contributors (ODbL), via Overpass API',
      ottawa: 'City of Ottawa, PublicWashrooms map service',
      earlyon: 'City of Toronto Open Data, EarlyON Child and Family Centres'
    },
    counts: deduped.reduce((o, p) => (o[`${p.src}_${p.k}`] = (o[`${p.src}_${p.k}`] || 0) + 1, o), {}),
    points: deduped
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snapshot));
  console.log('[go-data] wrote', OUT, snapshot.counts, `changing tables: ${deduped.filter(p => p.ct).length}`);
}

main().catch(err => { console.error('[go-data]', err.message); process.exit(1); });
