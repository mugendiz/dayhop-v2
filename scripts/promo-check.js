#!/usr/bin/env node
// scripts/promo-check.js — does the offer we advertise match the offer Stripe
// will honour? Run it before mailing a list, and whenever the promo changes.
//
// This exists because of a six-day window in September 2026 when the guides
// page said "$5 with FALL75" and checkout billed $20. Nothing caught it; the
// one external customer who reached checkout in that window left.
//
//   node scripts/promo-check.js
//
// Exit 0 = the window is safe. Exit 1 = we are advertising something Stripe
// will not honour. Exit 0 with a warning = the check could not run.

require('dotenv').config();
const promo = require('../services/promo');

(async () => {
  const cfg = promo.publicConfig();
  console.log('advertised : %s, %d%% off, until %s (%s)', cfg.code, cfg.percentOff, cfg.label, cfg.endsUtc);
  console.log('running now: %s', cfg.active ? 'yes' : 'NO — checkout shows the code box');

  const out = await promo.verify();
  if (out.ok === true) {
    console.log('stripe     : %s active, expires %s', out.code, out.stripeExpiresUtc || 'never');
    console.log('\nOK — %s', out.reason);
    process.exitCode = 0; return;
  }
  if (out.ok === null) {
    console.warn('\nCOULD NOT CHECK — %s', out.reason);
    process.exitCode = 0; return;
  }
  console.error('stripe     : %s', out.stripeExpiresUtc ? `expires ${out.stripeExpiresUtc}` : 'see below');
  console.error('\nMISMATCH — %s', out.reason);
  console.error('\nFix by either:');
  console.error('  · extending the code in Stripe, then setting GUIDE_AUTO_PROMO_ID /');
  console.error('    GUIDE_AUTO_PROMO_UNTIL / GUIDE_AUTO_PROMO_LABEL on Render; or');
  console.error('  · pulling GUIDE_AUTO_PROMO_UNTIL back to the Stripe expiry.');
  console.error('Until then the pages promise a price checkout will not charge.');
  process.exitCode = 1;
})();
