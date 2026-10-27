// data/dreamHomeSeeds.js — Dream Homes entered from chat.
//
// Claude has no admin login, so a home a founder asks it to add goes here.
// On boot, services/dreamHomes.applySeeds saves each entry ONCE as a draft
// marked "Added by Claude" in the admin Dream Homes tab; nothing goes public
// until an admin checks the listing, adds an open house time and publishes.
// A seed's `key` is remembered after it is saved, so a draft an admin
// deletes stays deleted. Never reuse a key; add a new entry instead.
//
// Every fact comes from a public listing page, cited in source_url, with
// any disagreement between sources spelled out in `check` for the admin.

module.exports = [
  {
    key: '118-may-ave-richmond-hill-2026-10-27',
    home: {
      address: '118 May Ave, Richmond Hill, ON L4C 3S6',
      area: 'North Richvale, Richmond Hill',
      price: 1999900,
      source_url: 'https://www.remax.ca/on/richmond-hill-north-richvale-real-estate/118-may-avenue-wp_idm73000004-29765969-lst',
      note: 'Seven bedrooms with ravine views out back, a finished walk-up basement and parking for eight.',
      windows: []
    },
    // Admin-only. The founder saw open house signs here on Oct 25; that
    // open house was not posted online.
    check: 'RE/MAX, realtor.ca and Zolo show $1,999,900 (MLS N13123034, Century 21 Atria); one Redfin summary showed $1,499,900. No upcoming open house was posted as of Oct 27, so add the time from the listing or the sign, then publish.'
  }
];
