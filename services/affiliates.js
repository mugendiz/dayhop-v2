// services/affiliates.js — DayHop V2
// Affiliate links, off until the founder adds an ID. Nothing here changes
// what a page recommends; it only adds a "where to stay" link where a
// visitor is plainly travelling, with a disclosure beside it.
//
// Stay22 (hotels, and through its providers also tours): documented at
// dev.stay22.com/docs/allez (read 2026-11-03). Plain link format:
//   https://www.stay22.com/allez/roam?aid=<AID>&lat=..&lng=..&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&campaign=..
// "Without an AID, there is no way for us to attribute a booking to you."
// Commission is a share of the booking site's commission, reported by
// third-party reviews at roughly 30 to 55 percent; Stay22 does not publish
// it. Set STAY22_AID on Render to switch these links on.
//
// Not used: Amazon Associates. Its operating agreement does not allow
// affiliate links in PDFs or emails, which is where DayHop's packing lists
// live. GetYourGuide's own partner docs could not be read (JavaScript-only
// page), so its link format is not guessed here.

const DISCLOSURE = 'DayHop may earn a commission if you book through this link, at no extra cost to you.';

function stay22Aid(env = process.env) {
  const aid = String(env.STAY22_AID || '').trim();
  return /^[A-Za-z0-9_-]{2,64}$/.test(aid) ? aid : null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A Stay22 link to places to stay near a point, or null when no AID is set.
 * campaign: letters, digits and underscores only (Stay22 asks for "_" not "-").
 */
function stayLink({ lat, lng, address, checkin, checkout, campaign } = {}, env = process.env) {
  const aid = stay22Aid(env);
  if (!aid) return null;
  const q = new URLSearchParams({ aid });
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    q.set('lat', Number(lat).toFixed(5));
    q.set('lng', Number(lng).toFixed(5));
  } else if (address) {
    q.set('address', String(address).slice(0, 120));
  } else {
    return null; // Stay22 needs a location
  }
  if (YMD.test(checkin || '')) q.set('checkin', checkin);
  if (YMD.test(checkout || '') && (!checkin || checkout > checkin)) q.set('checkout', checkout);
  if (campaign) q.set('campaign', String(campaign).replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 60));
  return `https://www.stay22.com/allez/roam?${q.toString()}`;
}

module.exports = { stayLink, stay22Aid, DISCLOSURE };
