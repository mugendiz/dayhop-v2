// services/regionGate.js — DayHop V2 (discovery autopilot)
// Geography gate for auto-published finds. DayHop is day trips from the
// GTA; the autopilot was publishing anything in Canada that passed the
// open/legit checks ("Suspended Forest Canopy Experience, Golden B.C."),
// and coordinate-less entries dodge the serve-time distance penalty
// entirely — so geography is verified at publish time, like everything
// else in the chain. Trust contract applies here too: a find whose
// location can't be placed in the region is rejected, never assumed in.
//
// Two tiers:
//   1. Coordinates (Google Places matched) — authoritative: straight-line
//      distance from Toronto within DISCOVERY_MAX_KM (default 250, wide
//      enough for the catalog's own day-trip icons — Niagara, Sandbanks,
//      Algonquin's Hwy-60 corridor).
//   2. Text (no coords) — the extracted area/location must name somewhere
//      in the southern-Ontario day-trip belt and must not name somewhere
//      clearly outside it. Out-list wins ties ("Ottawa Street, Hamilton"
//      is a rare false reject; a Barrhaven play café in a Toronto kids
//      feed is the actual bug).

const TORONTO = { lat: 43.6532, lng: -79.3832 };

function maxKm() {
  const n = Number(process.env.DISCOVERY_MAX_KM);
  return Number.isFinite(n) && n > 0 ? n : 250;
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Southern-Ontario day-trip belt: the GTA, its regions, and the classic
// destinations within roughly a 2.5-hour drive.
const IN_REGION_RE = new RegExp('\\b(' + [
  'toronto', 'gta', 'greater toronto', 'etobicoke', 'scarborough', 'north york', 'east york',
  'mississauga', 'brampton', 'caledon', 'peel',
  'vaughan', 'markham', 'richmond hill', 'newmarket', 'aurora', 'stouffville', 'king city', 'georgina', 'york region',
  'oakville', 'burlington', 'milton', 'halton', 'georgetown',
  'pickering', 'ajax', 'whitby', 'oshawa', 'clarington', 'durham',
  'hamilton', 'ancaster', 'stoney creek', 'grimsby',
  'niagara', 'st\\.? catharines', 'welland', 'fort erie',
  'guelph', 'kitchener', 'waterloo', 'cambridge', 'brantford', 'stratford', 'london',
  'barrie', 'orillia', 'innisfil', 'oro.medonte',
  'collingwood', 'wasaga', 'blue mountain', 'midland', 'penetanguishene',
  'elora', 'fergus', 'orangeville', 'erin', 'mono',
  'peterborough', 'kawartha', 'uxbridge', 'port perry',
  'cobourg', 'port hope', 'prince edward county', 'picton', 'belleville', 'kingston',
  'muskoka', 'huntsville', 'gravenhurst', 'bracebridge', 'algonquin'
].join('|') + ')\\b', 'i');

// Clearly outside the belt: other provinces, their cities, and far Ontario.
// "prince edward island" is spelled out so it can't collide with the county.
const OUT_REGION_RE = new RegExp('\\b(' + [
  'british columbia', 'b\\.?c\\.?', 'alberta', 'saskatchewan', 'manitoba',
  'quebec', 'qu[ée]bec', 'nova scotia', 'new brunswick', 'prince edward island',
  'newfoundland', 'yukon', 'nunavut', 'northwest territories',
  'montr[ée]al', 'laval', 'gatineau', 'ottawa', 'barrhaven', 'kanata', 'orl[ée]ans',
  'vancouver', 'victoria', 'kelowna', 'whistler', 'banff', 'jasper', 'golden',
  'calgary', 'edmonton', 'winnipeg', 'regina', 'saskatoon',
  'halifax', 'moncton', 'fredericton', 'charlottetown', "st\\.? john'?s",
  'windsor', 'sarnia', 'sudbury', 'north bay', 'sault ste', 'thunder bay', 'timmins'
].join('|') + ')\\b', 'i');

/**
 * Decide whether a find belongs in DayHop's serving region.
 * @param {{lat?: number, lng?: number, text?: string}} find — coordinates
 *   when a Places match supplied them, plus whatever location text the
 *   pipeline has (area, draft location, address).
 * @returns {{pass: boolean, reason: string}}
 */
function regionVerdict({ lat, lng, text }) {
  if (lat != null && lng != null) {
    const km = Math.round(haversineKm(TORONTO, { lat, lng }));
    return km <= maxKm()
      ? { pass: true, reason: `${km} km from Toronto` }
      : { pass: false, reason: `${km} km from Toronto (limit ${maxKm()})` };
  }
  const t = String(text || '');
  if (OUT_REGION_RE.test(t)) {
    return { pass: false, reason: `location "${t.slice(0, 60)}" is outside the day-trip belt` };
  }
  if (IN_REGION_RE.test(t)) {
    return { pass: true, reason: 'named location is in the day-trip belt' };
  }
  return { pass: false, reason: `location "${t.slice(0, 60)}" could not be placed in the region` };
}

module.exports = { regionVerdict, haversineKm, TORONTO };
